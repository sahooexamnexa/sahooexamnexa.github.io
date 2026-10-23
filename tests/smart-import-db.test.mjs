import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {makeHandler} from '../supabase/functions/_shared/handler.mjs';
import {inspectUploadedHtml} from '../scripts/upload-import.mjs';
const admin='10000000-0000-4000-8000-000000000003',student='10000000-0000-4000-8000-000000000001';
const q={id:7,chapter:'Computer',question_statement:'Which synthetic option is the first? 🟢 [cite: 1]',options:['Alpha','Beta','Gamma','Delta'],correct:0,explanation:'Alpha is the first option in the synthetic fixture.',tags:['Notes PDF']};
const html='<script>const questions='+JSON.stringify([q])+';</script>';
test('smart staging database lifecycle and authorization are fail-closed',async t=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 for(const f of fs.readdirSync('supabase/migrations').sort().filter(f=>!f.includes('202610210001')))await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users(id) values($1),($2)',[admin,student]);await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 const rpc=async(actor,action,payload={})=>(await db.query('select public.academy_api($1,$2,$3) as result',[actor,action,JSON.stringify(payload)])).rows[0].result;
 const save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
 await save('exams',{id:'exam',name:'Fixture exam',published:true});await save('subjects',{id:'s',name:'Computer',exam_ids:['exam'],price_paise:0,validity_months:3,published:true});await save('topics',{id:'topic',subject_id:'s',name:'Topic',published:true});
 const draft={id:'draft',title:'Synthetic smart draft',subject_id:'s',topic_id:'topic',duration_seconds:600,access:'free',published:false};await save('tests',draft);
 const fingerprint=async()=>JSON.stringify((await db.query("select (select jsonb_agg(t) from public.tests t) tests,(select jsonb_agg(q) from public.questions q) questions,(select jsonb_agg(i) from public.imports i) imports,(select jsonb_agg(a) from public.attempts a) attempts,(select jsonb_agg(p) from public.profiles p) profiles,(select jsonb_agg(s) from public.admin_settings s) settings")).rows);
 await t.test('forward migration preserves existing content/settings/roles and grants no browser access',async()=>{
  const before=await fingerprint();await db.exec(fs.readFileSync('supabase/migrations/202610210001_smart_import.sql','utf8'));assert.equal(await fingerprint(),before);
  for(const role of ['anon','authenticated']){
   for(const permission of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query("select has_table_privilege($1,'public.smart_import_batches',$2) allowed",[role,permission])).rows[0].allowed,false);
   for(const fn of ['academy_api','academy_before_smart_api'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,'public.'+fn+'(uuid,text,jsonb)'])).rows[0].allowed,false);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.smart_import_batches'::regclass")).rows[0].relrowsecurity,true);
 });
 const handler=makeHandler({rpc,getUser:async token=>({id:token,email_confirmed_at:'2026-01-01'}),config:{origins:['https://fixture.invalid']},inspectHtml:inspectUploadedHtml});
 const call=async(action,payload={},who=admin)=>{const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json',origin:'https://fixture.invalid',...(who?{authorization:'Bearer '+who}:{})},body:JSON.stringify({action,payload})}));return {status:r.status,data:await r.json()};};
 const upload={testId:'draft',files:[{name:'source.html',expectedCount:1,base64:Buffer.from(html).toString('base64')}]};let batch;
 await t.test('Admin batch list works empty and denies browser table access',async()=>{
  assert.deepEqual(await call('adminSmartList'),{status:200,data:[]});
 });
 await t.test('anonymous/student cannot upload, inspect, filter, review or install; internal create/update not exposed',async()=>{
  for(const action of ['adminSmartUpload','adminSmartList','adminSmartDetail','adminSmartReview','adminSmartFilter','adminSmartFinalize'])for(const who of [null,student])assert.equal((await call(action,upload,who)).status,who?403:401);
  for(const action of ['adminSmartCreate','adminSmartUpdate'])assert.equal((await call(action,{state:{}})).status,400);
  assert.equal((await db.query('select count(*)::int n from public.smart_import_batches')).rows[0].n,0);
 });
 await t.test('upload archives bytes privately, creates no questions, and blocks duplicate/replacement upload',async()=>{
  const r=await call('adminSmartUpload',upload);assert.equal(r.status,200);batch=r.data;assert.equal(batch.state.sources[0].base64,upload.files[0].base64);assert.deepEqual(batch.state.items[0].raw,q);assert.equal(batch.state.report.pass2,'pending');assert.equal((await db.query('select count(*)::int n from public.questions')).rows[0].n,0);assert.equal((await call('adminSmartUpload',upload)).status,400);
  const list=await call('adminSmartList');assert.equal(list.status,200);assert.equal(list.data[0].report.parsed,1);assert.doesNotMatch(JSON.stringify(list.data),/base64|question_statement/);
 });
 await t.test('unresolved findings prevent install/publication and forged stale review cannot overwrite',async()=>{
  assert.equal((await call('adminSmartFinalize',{batchId:batch.id,expectedRevision:batch.revision})).status,400);await assert.rejects(save('tests',{...draft,published:true}));
  assert.equal((await call('adminSmartReview',{batchId:batch.id,expectedRevision:0,key:'s1q1',decision:'approve',reason:'Reviewed against the synthetic source specification.'})).status,409);
 });
 await t.test('edit/review/filter preserve raw source, allow owner-selected shortfall and remain private',async()=>{
  const edit=await call('adminSmartReview',{batchId:batch.id,expectedRevision:batch.revision,key:'s1q1',decision:'edit',reason:'Correcting synthetic wording against the original fixture.',question:{...batch.state.items[0].working,text:'Which fixture option is first? ଓଡ଼ିଆ',correctIndex:0}});assert.equal(edit.status,200);batch=edit.data;assert.deepEqual(batch.state.items[0].raw,q);assert.equal(batch.state.report.pass2,'pending');
  for(const finding of batch.state.items[0].unresolved){const r=await call('adminSmartReview',{batchId:batch.id,expectedRevision:batch.revision,key:'s1q1',decision:'resolve',findingId:finding.id,reason:'Verified individual evidence against the controlled fixture.'});assert.equal(r.status,200);batch=r.data;}
  batch=(await call('adminSmartReview',{batchId:batch.id,expectedRevision:batch.revision,key:'s1q1',decision:'approve',important:true,reason:'Reviewed all alternatives, answer, explanation and source against fixture.'})).data;
  const f=await call('adminSmartFilter',{batchId:batch.id,expectedRevision:batch.revision,filter:{criterion:'important',requested:100}});assert.equal(f.status,200);batch=f.data;assert.equal(batch.state.report.shortfall,99);assert.equal(batch.state.report.selected,1);assert.equal(batch.state.report.pass2,'approved');
  assert.doesNotMatch(JSON.stringify(await rpc(null,'catalog')),/source\.html|base64|correctOptionId|smartBatchId/);
 });
 await t.test('approved selection installs once, stays draft, legacy content gate remains, original archive immutable',async()=>{
  const r=await call('adminSmartFinalize',{batchId:batch.id,expectedRevision:batch.revision});assert.equal(r.status,200);assert.equal(r.data.finalized,true);assert.equal((await call('adminSmartFinalize',{batchId:batch.id,expectedRevision:batch.revision})).status,400);
  const stored=(await db.query('select * from public.tests where id=$1',['draft'])).rows[0];assert.equal(stored.published,false);assert.equal(stored.question_count,1);
  const imp=(await db.query('select * from public.imports')).rows[0];assert.equal(imp.pass1,true);assert.equal(imp.pass2,false);assert.equal(imp.source_sha256.length,64);await assert.rejects(save('tests',{...draft,published:true}));
  await assert.rejects(db.query('delete from public.smart_import_batches where id=$1',[batch.id]));await assert.rejects(db.query("update public.smart_import_batches set sources='[]' where id=$1",[batch.id]));
 });
 await t.test('normal deliberate review/publish still works; pre-submit projection and server score stay private',async()=>{
  const imp=(await db.query('select * from public.imports')).rows[0];await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'Final synthetic selected draft reviewed after installation.'});await save('tests',{...draft,published:true});await save('admin_settings',{telegram_required:false});
  const start=await rpc(student,'start',{testId:'draft',idempotencyKey:crypto.randomUUID()});assert.equal(start.status,'started');const question=start.page.questions[0];assert.doesNotMatch(JSON.stringify(start),/correctOptionId|explanation|smartBatchId|sourceRecord|source\.html|base64|cite:|🟢/);assert.deepEqual(question.options.map(o=>Object.keys(o).sort()),Array(4).fill(['id','text']));
  const end=await rpc(student,'submitAttempt',{attemptId:start.page.attemptId,answers:{[question.id]:'option-0'}});assert.equal(end.score,1);
 });
 await t.test('unrelated edits cannot waive source blockers through the HTTP/DB review and install paths',async()=>{
  await save('tests',{...draft,id:'source-conflict',published:false});
  const records=[q,{...q,question_statement:'Another valid synthetic question sharing the same original ID?'}];
  const input={testId:'source-conflict',files:[{name:'duplicate.html',expectedCount:2,base64:Buffer.from('<script>const questions='+JSON.stringify(records)+';</script>').toString('base64')}]};
  let r=await call('adminSmartUpload',input);assert.equal(r.status,200);let b=r.data;
  const review=async extra=>call('adminSmartReview',{batchId:b.id,expectedRevision:b.revision,key:'s1q2',reason:'Only synthetic source evidence is used in this isolated regression.',...extra});
  r=await review({decision:'edit',question:{...b.state.items[1].working,correctIndex:0,explanation:'A changed explanation does not correct the duplicate source identity.'}});assert.equal(r.status,200);b=r.data;
  assert.ok(b.state.items[1].unresolved.some(f=>f.code==='source_id'));assert.equal((await review({decision:'resolve',findingId:'source_id'})).status,400);
  assert.equal((await review({decision:'approve'})).status,400);assert.equal((await call('adminSmartFinalize',{batchId:b.id,expectedRevision:b.revision})).status,400);
  assert.equal((await db.query("select count(*)::int n from public.questions where test_id='source-conflict'")).rows[0].n,0);
  assert.deepEqual((await db.query('select original_items from public.smart_import_batches where id=$1',[b.id])).rows[0].original_items.map(i=>i.raw),records);
 });
 await t.test('invalid source and canonical option IDs cannot be repaired accidentally, waived or installed',async()=>{
  await save('tests',{...draft,id:'invalid-identities',published:false});
  const records=[{id:null,number:1,text:'Which synthetic canonical option is first?',options:['Alpha','Beta','Gamma','Delta'].map(text=>({text})),correctOptionId:'option-0',explanation:'Alpha is first in the original controlled fixture.',tags:[],topic:'Computer'}];
  const html='<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:records})+'</script>';
  let r=await call('adminSmartUpload',{testId:'invalid-identities',files:[{name:'identity.html',expectedCount:1,base64:Buffer.from(html).toString('base64')}]});assert.equal(r.status,200);let b=r.data;
  const original=JSON.stringify((await db.query('select sources,original_items from public.smart_import_batches where id=$1',[b.id])).rows[0]);
  const review=extra=>call('adminSmartReview',{batchId:b.id,expectedRevision:b.revision,key:'s1q1',reason:'Only synthetic evidence is used for this isolated review.',...extra});
  r=await review({decision:'edit',question:{...b.state.items[0].working,correctIndex:0,explanation:'An unrelated explanation change must not invent source mappings.'}});assert.equal(r.status,200);b=r.data;
  for(const code of ['source_id','source_option_ids','answer_mapping'])assert.ok(b.state.items[0].unresolved.some(f=>f.code===code));
  for(const findingId of ['source_id','source_option_ids'])assert.equal((await review({decision:'resolve',findingId})).status,400);
  assert.equal((await review({decision:'approve'})).status,400);assert.equal((await call('adminSmartFinalize',{batchId:b.id,expectedRevision:b.revision})).status,400);
  assert.equal((await db.query("select count(*)::int n from public.questions where test_id='invalid-identities'")).rows[0].n,0);
  assert.equal(JSON.stringify((await db.query('select sources,original_items from public.smart_import_batches where id=$1',[b.id])).rows[0]),original);
  await assert.rejects(db.query("update public.smart_import_batches set original_items='[]' where id=$1",[b.id]));
  await assert.rejects(db.query('delete from public.smart_import_batches where id=$1',[b.id]));
  assert.equal((await call('adminSmartUpdate',{batchId:b.id,expectedRevision:b.revision,state:{report:{pass2:'approved'}}})).status,400);
 });
 }finally{await db.close();}
});
