-- Forward-only private staging. No existing content/import/attempt/settings updates.
begin;
create table public.smart_import_batches (
 id uuid primary key default gen_random_uuid(), test_id text not null references public.tests,
 sources jsonb not null, original_items jsonb not null, state jsonb not null,
 revision integer not null default 1, finalized boolean not null default false,
 created_by uuid not null references public.profiles, created_at timestamptz not null default now()
);
create unique index smart_import_one_pending_test on public.smart_import_batches(test_id) where not finalized;
alter table public.smart_import_batches enable row level security;
revoke all on public.smart_import_batches from public,anon,authenticated;
grant all on public.smart_import_batches to service_role;
create function public.academy_smart_archive_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Smart source archive is permanent';end if;
 if new.sources is distinct from old.sources or new.original_items is distinct from old.original_items or new.test_id<>old.test_id or new.created_by<>old.created_by or old.finalized then raise exception 'Source archive/finalized batch is immutable';end if;
 return new;
end $$;
create trigger smart_archive_guard before update or delete on public.smart_import_batches for each row execute function public.academy_smart_archive_guard();

alter function public.academy_api(uuid,text,jsonb) rename to academy_before_smart_api;
revoke all on function public.academy_before_smart_api(uuid,text,jsonb) from public,anon,authenticated;
create function public.academy_api(actor uuid,action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.smart_import_batches; t public.tests; state jsonb; selected jsonb; q jsonb; item jsonb; n integer; result jsonb;
begin
 if action not in ('adminSmartCreate','adminSmartList','adminSmartDetail','adminSmartUpdate','adminSmartFinalize') then return public.academy_before_smart_api(actor,action,payload);end if;
 if not exists(select 1 from public.profiles where id=actor and role='admin') then raise exception 'Admin required' using errcode='42501';end if;
 if action='adminSmartList' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',sb.id,'testId',sb.test_id,'revision',sb.revision,'finalized',sb.finalized,'report',sb.state->'report') order by sb.created_at desc),'[]') from public.smart_import_batches sb);
 end if;
 if action='adminSmartCreate' then
  perform 1 from public.admin_settings where id=true for update;
  select * into t from public.tests where id=payload->>'testId' for update;
  if t.id is null or t.published or t.deleted_at is not null or exists(select 1 from public.questions where test_id=t.id) or exists(select 1 from public.imports where test_id=t.id) then raise exception 'Select an empty existing draft test without an import';end if;
  state=payload->'state';
  if jsonb_typeof(state->'sources') is distinct from 'array' or jsonb_array_length(state->'sources')<1 or jsonb_typeof(state->'items') is distinct from 'array' then raise exception 'Server-extracted sources required';end if;
  insert into public.smart_import_batches(test_id,sources,original_items,state,created_by) values(t.id,state->'sources',state->'items',state-'sources',actor) returning * into b;
 elsif action='adminSmartDetail' then
  select * into b from public.smart_import_batches where id=(payload->>'batchId')::uuid;
 else
  perform 1 from public.admin_settings where id=true for update;
  select * into b from public.smart_import_batches where id=(payload->>'batchId')::uuid for update;
  if b.id is null or b.finalized or b.revision is distinct from (payload->>'expectedRevision')::integer then raise exception 'Batch changed/finalized; reload';end if;
  select * into t from public.tests where id=b.test_id for update;
  if t.published or t.deleted_at is not null then raise exception 'Published/removed destination is protected';end if;
  if action='adminSmartUpdate' then
   state=payload->'state';
   if jsonb_typeof(state->'items') is distinct from 'array' or jsonb_array_length(state->'items')<>jsonb_array_length(b.original_items)
    or (select jsonb_agg(jsonb_build_object('key',v->'key','raw',v->'raw','sourceId',v->'sourceId','sourceIndex',v->'sourceIndex','sourcePosition',v->'sourcePosition') order by ord) from jsonb_array_elements(state->'items') with ordinality x(v,ord))
    is distinct from (select jsonb_agg(jsonb_build_object('key',v->'key','raw',v->'raw','sourceId',v->'sourceId','sourceIndex',v->'sourceIndex','sourcePosition',v->'sourcePosition') order by ord) from jsonb_array_elements(b.original_items) with ordinality x(v,ord)) then raise exception 'Every original occurrence must remain accounted for';end if;
   update public.smart_import_batches set state=(payload->'state')-'sources',revision=revision+1 where id=b.id returning * into b;
  else
   if exists(select 1 from public.questions where test_id=t.id) or exists(select 1 from public.imports where test_id=t.id) then raise exception 'Destination is no longer empty; reimport prohibited';end if;
   if exists(select 1 from jsonb_array_elements(b.sources) s where jsonb_array_length(s->'errors')<>0 or s->'expectedCount' is distinct from s->'parsedCount') then raise exception 'Source count/extraction unresolved';end if;
   if b.state->'report'->>'pass2' is distinct from 'approved' then raise exception 'Complete content review before installing';end if;
   select jsonb_agg(v order by ord) into selected from jsonb_array_elements(b.state->'items') with ordinality x(v,ord) where (b.state->'selectedKeys') ? (v->>'key');
   n=coalesce(jsonb_array_length(selected),0);if n<1 then raise exception 'No approved selection';end if;
   for item in select value from jsonb_array_elements(selected) loop
    q=item->'working';
    if item->'review'->>'decision' is distinct from 'approve' or jsonb_array_length(item->'unresolved')<>0 or length(trim(item->'review'->>'reason'))<20 then raise exception 'Unresolved review';end if;
    if jsonb_array_length(q->'options')<>4 or (select count(distinct o->>'id') from jsonb_array_elements(q->'options') o)<>4
      or (select count(*) from jsonb_array_elements(q->'options') o where o->>'id'=q->>'correctOptionId')<>1
      or exists(select 1 from jsonb_array_elements(q->'options') o where length(trim(coalesce(o->>'text','')))=0)
      or length(trim(coalesce(q->>'text','')))=0 or length(trim(coalesce(q->>'explanation','')))=0 then raise exception 'Invalid working question';end if;
   end loop;
   select jsonb_agg((v->'working')||jsonb_build_object('number',ord,'metadata',jsonb_build_object('smartBatchId',b.id,'sourceKey',v->>'key','sourceId',v->'sourceId')) order by ord) into selected from jsonb_array_elements(selected) with ordinality x(v,ord);
   result=public.academy_before_smart_api(actor,'adminImport',jsonb_build_object('testId',t.id,'html','Private multi-source archive: smart_import_batches/'||b.id::text,
    'import',jsonb_build_object('sourceSha256',b.state->>'sourceSha256','original',selected,'imported',selected,'issues','[]'::jsonb,
    'audit',jsonb_build_object('sourceQuestions',n,'importedQuestions',n,'countMatch',true,'added',0,'removed',0,'smartBatchId',b.id,'stagingReport',b.state->'report'))));
   -- Installation remains Hidden/Draft and legacy Pass 2 pending: publication is always a separate deliberate action.
   update public.smart_import_batches set finalized=true,revision=revision+1 where id=b.id returning * into b;
  end if;
 end if;
 if b.id is null then raise exception 'Batch not found';end if;
 if action not in ('adminSmartDetail','adminSmartList') then insert into public.admin_audit(actor_id,action,details) values(actor,action,jsonb_build_object('batchId',b.id,'revision',b.revision,'state',b.state));end if;
 return jsonb_build_object('id',b.id,'testId',b.test_id,'revision',b.revision,'finalized',b.finalized,'state',b.state||jsonb_build_object('sources',b.sources));
end $$;
revoke all on function public.academy_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_api(uuid,text,jsonb) to service_role;
commit;
