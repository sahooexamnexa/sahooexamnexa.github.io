import test from 'node:test';
import assert from 'node:assert/strict';
import {textPdf} from './smart-pdf-fixture.mjs';
import {stageSources,reviewItem,filterBatch,parsePdfText,extractPdf,cleanText} from '../scripts/smart-import.mjs';
export const record=(id=1)=>({id,chapter:'Computer',question_statement:'Which synthetic value is shown for record '+id+'?',options:['Alpha','Beta','Gamma','Delta'],correct:0,explanation:'Alpha is explicitly the answer in this synthetic fixture.',tags:[]});
export const source=(records,name='fixture.html',expectedCount=records.length)=>({name,expectedCount,base64:Buffer.from('<script>const questions='+JSON.stringify(records)+';function UI(){return questions;}</script>').toString('base64')});
const evidence='Verified this individual finding against the controlled synthetic source.';
function resolveContent(b,key){for(const f of b.items.find(i=>i.key===key).unresolved){if(f.stage==='content')b=reviewItem(b,{key,decision:'resolve',findingId:f.id,reason:evidence});}return b;}
const lines=['1. Which synthetic option is first?','A. Alpha','B. Beta','C. Gamma','D. Delta','Answer: A','Explanation: Alpha is the first listed synthetic option.','PYP: Odisha Police SI 2023'];
test('100Q static HTML is exact and originals/options/Unicode remain accounted for',async()=>{
 const records=Array.from({length:100},(_,i)=>record(i+1));records[0].question_statement+=' ଓଡ଼ିଆ';const f=source(records),b=await stageSources([f]);
 assert.equal(b.report.parsed,100);assert.equal(b.report.added,0);assert.equal(b.report.removed,0);assert.equal(b.sources[0].base64,f.base64);assert.deepEqual(b.items[0].raw,records[0]);assert.match(b.items[0].working.text,/ଓଡ଼ିଆ/);assert.equal(b.report.pass2,'pending');
});
test('real binary PDF extraction uses static text and preserves explicit source labels',async()=>{
 const bytes=textPdf(lines),text=await extractPdf(bytes);assert.match(text,/Answer: A/);
 const b=await stageSources([{name:'fixture.pdf',expectedCount:1,base64:bytes.toString('base64')}]);assert.equal(b.report.parsed,1);assert.equal(b.report.pass1,'passed');assert.deepEqual(b.items[0].working.tags,['Odisha Police SI 2023']);assert.equal(b.items[0].working.correctOptionId,'option-A');
});
test('mixed HTML/PDF files preserve separate source IDs and order',async()=>{
 const b=await stageSources([source([record()]),{name:'fixture.pdf',expectedCount:1,base64:textPdf(lines).toString('base64')}]);assert.equal(b.items.length,2);assert.deepEqual(b.items.map(i=>i.key),['s1q1','s2q1']);assert.equal(b.sources.length,2);
});
for(const [name,patch,code]of [['missing option',{options:['A','B','C']},'options'],['duplicate option',{options:['A','A','C','D']},'duplicate_options'],['invalid answer',{correct:8},'answer_mapping'],['no answer',{correct:null},'answer_mapping'],['malformed text',{question_statement:'...'},'question_text']])test(name+' is retained and blocked',async()=>{const b=await stageSources([source([{...record(),...patch}])]);assert.equal(b.items.length,1);assert.ok(b.items[0].findings.some(f=>f.code===code));assert.throws(()=>reviewItem(b,{key:'s1q1',decision:'approve',reason:'Evidence review must not override structure.'}));});
test('unreadable/truncated/dynamic sources are archived with fail-closed reconciliation',async()=>{
 for(const html of ['<script>const questions=[','<script>const questions=makeBank();</script>']){const b=await stageSources([{name:'broken.html',expectedCount:10,base64:Buffer.from(html).toString('base64')}]);assert.equal(b.report.parsed,0);assert.equal(b.report.pass1,'blocked');assert.ok(b.sources[0].errors.length);}
 const b=await stageSources([source([record()],'count.html',2)]);assert.equal(b.report.pass1,'blocked');assert.equal(b.items.length,1);
});
test('duplicate IDs flagged; exact/near content retained with relationships',async()=>{
 const a=record(),b=record(2);b.question_statement=a.question_statement;const c=record(3);c.question_statement='Which synthetic value is shown for record 1 please?';
 const batch=await stageSources([source([a,b,c,a])]);assert.equal(batch.items.length,4);assert.ok(batch.report.exactDuplicates);assert.ok(batch.report.nearDuplicates);assert.ok(batch.items[3].findings.some(f=>f.code==='source_id'));
});
test('same topic distinct facts are not duplicates; reviewed fact keys link semantic candidates',async()=>{
 let b=await stageSources([source([{...record(),question_statement:'Which device stores permanent firmware?'},{...record(2),question_statement:'How many binary digits form one byte?'}])]);assert.equal(b.report.duplicateRelationships.length,0);
 for(const key of ['s1q1','s1q2'])b=reviewItem(b,{key,decision:'keep',factKey:'reviewed-fact-identifier',reason:'Admin identifies same underlying fact for comparison.'});assert.equal(b.report.sameFactCandidates,1);
});
test('only explicit supported PYP metadata survives; no inference from prose/file/chapter/explanation',async()=>{
 const q={...record(),tags:['MCQ PDF','Book','Notes','Custom','History','🟢','Odisha Police SI 2023']};const b=await stageSources([source([q,{...record(2),question_statement:'Odisha Police SI 2023 asks which value?',chapter:'OPSC 2020'}],'OPSC 2022.html')]);assert.deepEqual(b.items[0].working.tags,['Odisha Police SI 2023']);assert.deepEqual(b.items[1].working.tags,[]);assert.deepEqual(b.items[0].raw.tags,q.tags);
});
test('green emoji and citation artifacts are removed from all student fields, not raw',async()=>{
 const q={...record(),question_statement:'Question 🟢 [cite: 15] content?',options:['One [cite: 1]','Two 🟢','Three','Four'],explanation:'Explanation [cite: 2] with source content 🟢',chapter:'Topic [cite: 3] 🟢',tags:['[cite: 2]']};const b=await stageSources([source([q])]);assert.doesNotMatch(JSON.stringify(b.items[0].working),/🟢|\[cite:/);assert.deepEqual(b.items[0].raw,q);assert.equal(cleanText('ଓଡ଼ିଆ [cite: 2]'),'ଓଡ଼ିଆ');
});
test('requested 100 with only 86 reviewed important questions reports shortfall without fabrication',async()=>{
 let b=await stageSources([source(Array.from({length:86},(_,i)=>({...record(i),question_statement:'Synthetic unique fixture '+i+' with choices?'})))]);
 // Reviewed importance is an Admin decision, never inferred from uploaded source.
 b.items.forEach(i=>i.review={decision:'approve',reason:'Synthetic evidence checked against controlled fixture.',important:true});b=filterBatch(b,{criterion:'important',requested:100});assert.equal(b.report.selected,86);assert.equal(b.report.shortfall,14);assert.equal(b.report.added,0);assert.equal(b.items.length,86);
});
test('manual correction reopens content review and keeps raw source immutable',async()=>{
 let b=await stageSources([source([record()])]);const original=structuredClone(b.items[0].raw);
 b=resolveContent(b,'s1q1');b=reviewItem(b,{key:'s1q1',decision:'approve',reason:'Verified against the authoritative synthetic specification.'});assert.equal(b.report.pass2,'approved');
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:'Corrected explanation from the original specification.',question:{...b.items[0].working,correctIndex:0,explanation:'Updated explanation from a reviewed synthetic source.'}});assert.equal(b.report.pass2,'pending');assert.deepEqual(b.items[0].raw,original);
 b=reviewItem(b,{key:'s1q1',decision:'remove',reason:'Owner explicitly excludes this occurrence from working selection.'});assert.equal(b.report.selected,0);assert.equal(b.items.length,1);assert.equal(b.report.removed,1);
});
test('PDF missing/multiple answers and unsupported trailing text stay blocked',()=>{
 const q=parsePdfText(lines.concat('Answer: B').join('\n'))[0];assert.equal(q.correctOptionId,null);assert.ok(q.multipleAnswers);
 assert.throws(()=>parsePdfText('Scanned image without numbered MCQs'));
});

test('multiple PDF sources reconcile individually without combining duplicate source IDs',async()=>{
 const bytes=textPdf(lines),files=['first.pdf','second.pdf'].map(name=>({name,expectedCount:1,base64:bytes.toString('base64')}));
 const b=await stageSources(files);assert.equal(b.report.parsed,2);assert.equal(b.report.sourceCount,2);assert.equal(b.report.pass1,'passed');assert.equal(b.report.exactDuplicates,1);assert.equal(b.items.length,2);assert.deepEqual(b.sources.map(s=>s.base64),files.map(f=>f.base64));
});

test('image-only PDF and invalid PDF are preserved but blocked without invented questions',async()=>{
 for(const bytes of [textPdf([]),Buffer.from('%PDF-broken')]){
  const b=await stageSources([{name:'unreadable.pdf',expectedCount:1,base64:bytes.toString('base64')}]);
  assert.equal(b.report.parsed,0);assert.equal(b.report.pass1,'blocked');assert.equal(b.sources[0].base64,bytes.toString('base64'));assert.ok(b.sources[0].errors.length);
 }
});

test('source safety budget, unsupported types and nonpositive counts fail closed',async()=>{
 const f=source([record()]);
 for(const bad of [{...f,base64:Buffer.alloc(1024*1024+1).toString('base64')},{...f,name:'bank.exe'},{...f,expectedCount:0},{...f,base64:'%%%'}])await assert.rejects(stageSources([bad]));
});

test('canonical HTML remains supported with exact declared count and stable option IDs',async()=>{
 const q={id:'q1',number:1,text:'Which canonical fixture option is first?',options:['one','two','three','four'].map((text,i)=>({id:'o'+i,text})),correctOptionId:'o0',explanation:'The canonical fixture explicitly selects option one.',tags:[]};
 const f={name:'canonical.html',expectedCount:1,base64:Buffer.from('<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[q]})+'</script>').toString('base64')};
 const b=await stageSources([f]);assert.equal(b.report.pass1,'passed');assert.deepEqual(b.items[0].working.options,q.options);assert.equal(b.items[0].working.correctOptionId,'o0');assert.deepEqual(b.items[0].raw,q);
});

test('all four filters retain source order, report exclusions and never impose a target cap',async()=>{
 let b=await stageSources([source([record(1),{...record(2),tags:['OSSSC PEO 2023']},record(3)])]);
 b.items[0].review.important=true;
 for(const [criterion,keys]of [['all',['s1q1','s1q2','s1q3']],['important',['s1q1']],['pyp',['s1q2']],['pyp-important',['s1q1','s1q2']]]){
  const f=filterBatch(b,{criterion,requested:1});assert.deepEqual(f.selectedKeys,keys);assert.equal(f.report.parsed,3);assert.equal(f.report.filteredOut,3-keys.length);
 }
});

test('new same-fact relationships reopen related approvals and source-wide findings remain visible',async()=>{
 let b=await stageSources([source([{...record(1),question_statement:'Which device stores permanent firmware?'},{...record(2),question_statement:'How many binary digits form a byte?'},{...record(3),correct:null}])]);
 const evidence='All synthetic alternatives and explanations checked against fixture.';
 b=resolveContent(b,'s1q1');b=reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence,factKey:'same'});
 b=reviewItem(b,{key:'s1q2',decision:'keep',reason:evidence,factKey:'same'});
 assert.equal(b.items[0].review.decision,'pending');
 b=reviewItem(b,{key:'s1q3',decision:'reject',reason:'This broken occurrence is explicitly excluded, never silently lost.'});
 assert.equal(b.report.pass1,'blocked');assert.equal(b.report.selectedPass1,'passed');assert.equal(b.report.parsed,3);assert.equal(b.report.rejected,1);
});

test('duplicate source IDs survive unrelated explanation edits and cannot be waived',async()=>{
 let b=await stageSources([source([record(1),{...record(1),question_statement:'A different synthetic question with the same source ID?'}])]);const raw=structuredClone(b.items.map(i=>i.raw));
 assert.ok(b.items[1].unresolved.some(f=>f.code==='source_id'));
 b=reviewItem(b,{key:'s1q2',decision:'edit',reason:evidence,question:{...b.items[1].working,correctIndex:0,explanation:'Only the explanation changed; source ID is still duplicated.'}});
 b=resolveContent(b,'s1q2');assert.ok(b.items[1].unresolved.some(f=>f.code==='source_id'));assert.equal(b.report.pass1,'blocked');
 assert.throws(()=>reviewItem(b,{key:'s1q2',decision:'approve',reason:evidence}));assert.throws(()=>reviewItem(b,{key:'s1q2',decision:'resolve',findingId:'source_id',reason:evidence}));assert.deepEqual(b.items.map(i=>i.raw),raw);
});

test('targeted option repair clears only that structural finding; corrupt evidence reopens it',async()=>{
 let b=await stageSources([source([{...record(),options:['Alpha�...','Beta','Gamma','Delta'],tags:['Odisha Police SI 2023']}])]);const raw=structuredClone(b.items[0].raw);
 b=reviewItem(b,{key:'s1q1',decision:'resolve',findingId:'pyp_provenance',reason:evidence});
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,options:['Alpha','Beta','Gamma','Delta'].map(text=>({text})),correctIndex:0}});
 assert.equal(b.report.pass1,'passed');assert.ok(!b.items[0].unresolved.some(f=>f.code==='pyp_provenance'));assert.ok(b.items[0].unresolved.some(f=>f.code==='factual_review'));
 b=resolveContent(b,'s1q1');b=reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence});assert.equal(b.report.pass2,'approved');
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,options:[{text:'Alpha�...'},...b.items[0].working.options.slice(1)],correctIndex:0}});assert.equal(b.report.pass1,'blocked');assert.equal(b.report.pass2,'pending');assert.deepEqual(b.items[0].raw,raw);
});

test('identical PDF explanations consolidate safely with every original occurrence and line retained',async()=>{
 const repeated=lines.concat('Explanation: Alpha is the first listed synthetic option.');
 const b=await stageSources([{name:'same.pdf',expectedCount:1,base64:textPdf(repeated).toString('base64')}]);
 assert.equal(b.items[0].raw.explanationOccurrences.length,2);assert.deepEqual(b.items[0].raw.explanationOccurrences.map(o=>o.line),[7,9]);assert.equal(b.items[0].working.explanation,lines[6].slice(13));assert.equal(b.report.pass1,'passed');assert.ok(!b.items[0].findings.some(f=>f.code==='explanation_conflict'));
});

test('conflicting PDF explanations need correction AND explicit individual resolution; originals immutable',async()=>{
 let b=await stageSources([{name:'conflict.pdf',expectedCount:1,base64:textPdf(lines.concat('Explanation: A second contradictory candidate from this source.')).toString('base64')}]);const raw=structuredClone(b.items[0].raw);
 assert.equal(b.items[0].working.explanation,'');assert.equal(raw.explanationOccurrences.length,2);assert.ok(b.items[0].unresolved.some(f=>f.code==='explanation_conflict'));assert.throws(()=>reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence}));
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,correctIndex:0,explanation:raw.explanationOccurrences[0].text}});assert.ok(b.items[0].unresolved.some(f=>f.code==='explanation_conflict'));
 b=resolveContent(b,'s1q1');assert.throws(()=>reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence}));
 b=reviewItem(b,{key:'s1q1',decision:'resolve',findingId:'explanation_conflict',reason:evidence});b=reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence});assert.equal(b.report.pass1,'passed');assert.equal(b.report.pass2,'approved');assert.deepEqual(b.items[0].raw,raw);
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,correctIndex:0,explanation:raw.explanationOccurrences[1].text}});assert.ok(b.items[0].unresolved.some(f=>f.code==='explanation_conflict'));assert.equal(b.report.pass2,'pending');
});

for(const [name,text]of [['replacement','Alpha�'],['truncated','Alpha...'],['ellipsis','Alpha…'],['decoding','cafÃ©'],['control','Alpha\u0000'],['cleaned-empty','🟢 [cite: 1]'],['whitespace','   ']])test('corrupted option '+name+' fails Pass 1 without invented repair',async()=>{
 for(let index=0;index<4;index++){const q=record();q.options[index]=text;const b=await stageSources([source([q])]);assert.equal(b.report.pass1,'blocked');assert.ok(b.items[0].unresolved.some(f=>f.code==='option_text_'+index));assert.throws(()=>reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence}));assert.deepEqual(b.items[0].raw,q);}
});

test('corruption in question, explanation and canonical answer IDs is structural; legitimate Unicode is valid',async()=>{
 for(const patch of [{question_statement:'A corrupted � question?'},{explanation:'Corrupted explanation �'},{explanation:'Incomplete explanation…'}]){const b=await stageSources([source([{...record(),...patch}])]);assert.equal(b.report.pass1,'blocked');}
 const canonical={id:'q1',text:'Which legitimate Unicode value applies?',options:['ଓଡ଼ିଆ','English café','日本語','1, 2, 3'].map((text,i)=>({id:'o'+i,text})),correctOptionId:'o0�',explanation:'A legitimate explanation in English and ଓଡ଼ିଆ.',tags:[],topic:'ଓଡ଼ିଆ'};
 const f=q=>({name:'unicode.html',expectedCount:1,base64:Buffer.from('<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[q]})+'</script>').toString('base64')});
 assert.equal((await stageSources([f(canonical)])).report.pass1,'blocked');const valid=await stageSources([f({...canonical,correctOptionId:'o0'})]);assert.equal(valid.report.pass1,'passed');assert.deepEqual(valid.items[0].working.options,canonical.options);
});

test('same-fact links survive unrelated edits; invalidated resolutions never revive on reverting text',async()=>{
 let b=await stageSources([source([{...record(1),question_statement:'Which device stores permanent firmware?'},{...record(2),question_statement:'Where are the startup instructions stored?'}])]);
 for(const key of ['s1q1','s1q2'])b=reviewItem(b,{key,decision:'keep',factKey:'reviewed-firmware-fact',reason:evidence});
 for(const key of ['s1q1','s1q2']){b=resolveContent(b,key);b=reviewItem(b,{key,decision:'approve',reason:evidence});}assert.equal(b.report.pass2,'approved');
 const old=b.items[0].working.explanation;
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,correctIndex:0,explanation:'Changed synthetic explanation requiring relationship review again.'}});
 assert.equal(b.report.sameFactCandidates,1);assert.equal(b.items[1].review.decision,'pending');assert.ok(b.items[1].unresolved.some(f=>f.code==='same_fact_candidate'));
 b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,correctIndex:0,explanation:old}});
 assert.ok(b.items[1].unresolved.some(f=>f.code==='same_fact_candidate'));assert.equal(b.report.pass2,'pending');
});

const canonicalRecord=()=>({id:'original-q1',number:1,text:'Which canonical synthetic option is first?',options:['Alpha','Beta','Gamma','Delta'].map((text,i)=>({id:'o'+i,text})),correctOptionId:'o0',explanation:'Alpha is the first controlled synthetic option.',tags:[],topic:'Computer'});
const canonicalSource=records=>({name:'canonical.html',expectedCount:records.length,base64:Buffer.from('<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:records.length,questions:records})+'</script>').toString('base64')});

test('invalid original IDs remain traceable and blocked despite unrelated edits or fallback numbering',async()=>{
 for(const id of ['', ' \t ',null,{},[],true,false,1.5,Number.MAX_SAFE_INTEGER+1,'broken\u0000id','id�']){
  const raw={...record(),id,number:99};let b=await stageSources([source([raw])]);
  assert.equal(b.items[0].key,'s1q1');assert.deepEqual(b.items[0].sourceId,id);assert.deepEqual(b.items[0].raw,raw);
  assert.ok(b.items[0].unresolved.some(f=>f.code==='source_id'));assert.equal(b.report.pass1,'blocked');
  b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,correctIndex:0,explanation:'Changed explanation cannot change original identity.'}});
  b=resolveContent(b,'s1q1');assert.ok(b.items[0].unresolved.some(f=>f.code==='source_id'));
  for(const decision of ['approve','resolve'])assert.throws(()=>reviewItem(b,{key:'s1q1',decision,findingId:'source_id',reason:evidence}));
  assert.deepEqual(b.items[0].raw,raw);
 }
 const raw=record();delete raw.id;const b=await stageSources([source([raw])]);assert.ok(b.items[0].unresolved.some(f=>f.code==='source_id'));assert.equal(b.items[0].sourceId,null);
});

test('valid numeric/string source IDs and canonical number-only records retain exact identity',async()=>{
 for(const id of [0,1,-1,Number.MAX_SAFE_INTEGER,'q-1','001','ଓଡ଼ିଆ-୧']){
  const b=await stageSources([source([{...record(),id}])]);assert.equal(b.report.pass1,'passed');assert.equal(b.items[0].sourceId,id);assert.equal(b.items[0].raw.id,id);
 }
 const raw=canonicalRecord();delete raw.id;const b=await stageSources([canonicalSource([raw])]);assert.equal(b.report.pass1,'passed');assert.equal(b.items[0].sourceId,1);assert.ok(!Object.hasOwn(b.items[0].raw,'id'));
});

test('duplicate source identity still blocks numeric/string collisions without merging occurrences',async()=>{
 const records=[record(7),{...record('7'),question_statement:'A different question with the repeated source identity?'}];let b=await stageSources([source(records)]);
 assert.equal(b.items.length,2);assert.deepEqual(b.items.map(i=>i.sourceId),[7,'7']);assert.ok(b.items[1].unresolved.some(f=>f.code==='source_id'));
 b=reviewItem(b,{key:'s1q2',decision:'edit',reason:evidence,question:{...b.items[1].working,correctIndex:0,topic:'Another topic'}});
 assert.ok(b.items[1].unresolved.some(f=>f.code==='source_id'));assert.deepEqual(b.items.map(i=>i.raw),records);
});

test('canonical option IDs are never fabricated or coerced, and ambiguous originals cannot be waived',async()=>{
 for(const id of [undefined,null,'',' ',123,{},[],true,' o0','o0 ','o0�']){
  const q=canonicalRecord();if(id===undefined)delete q.options[0].id;else q.options[0].id=id;
  // This formerly guessed option-0 when a canonical ID was absent.
  q.correctOptionId='option-0';let b=await stageSources([canonicalSource([q])]);
  assert.equal(b.report.pass1,'blocked');assert.ok(b.items[0].unresolved.some(f=>f.code==='source_option_ids'));assert.ok(b.items[0].unresolved.some(f=>f.code==='answer_mapping'));
  assert.equal(b.items[0].working.options[0].id,typeof id==='string'?id:null);assert.equal(b.items[0].working.correctOptionId,q.correctOptionId);
  b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...b.items[0].working,correctIndex:0,explanation:'An unrelated edit must not generate an ID or repair source mapping.'}});
  b=resolveContent(b,'s1q1');assert.ok(b.items[0].unresolved.some(f=>f.code==='source_option_ids'));
  assert.throws(()=>reviewItem(b,{key:'s1q1',decision:'resolve',findingId:'source_option_ids',reason:evidence}));assert.throws(()=>reviewItem(b,{key:'s1q1',decision:'approve',reason:evidence}));assert.deepEqual(b.items[0].raw,q);
 }
 const q=canonicalRecord();q.options[1].id='o0';const b=await stageSources([canonicalSource([q])]);
 assert.ok(b.items[0].unresolved.some(f=>f.code==='source_option_ids'));assert.ok(b.items[0].unresolved.some(f=>f.code==='answer_mapping'));assert.deepEqual(b.items[0].working.options,q.options);
});

test('canonical answer mapping is strict while valid HTML/PDF derived IDs remain traceable',async()=>{
 for(const correctOptionId of [null,0,'0','o4','O0',' o0','o0 ']){
  const q={...canonicalRecord(),correctOptionId},b=await stageSources([canonicalSource([q])]);assert.ok(b.items[0].unresolved.some(f=>f.code==='answer_mapping'));assert.deepEqual(b.items[0].raw,q);
 }
 const canonical=canonicalRecord(),b=await stageSources([canonicalSource([canonical]),source([record()]),{name:'fixture.pdf',expectedCount:1,base64:textPdf(lines).toString('base64')}]);
 assert.equal(b.report.pass1,'passed');assert.deepEqual(b.sources.map(s=>s.format),['sahoo-canonical-v1','const-questions-data-v1','pdf-lines-v1']);
 assert.deepEqual(b.items[0].working.options,canonical.options);assert.equal(b.items[0].working.correctOptionId,'o0');
 assert.deepEqual(b.items[1].raw.options,record().options);assert.equal(b.items[1].raw.correct,0);assert.equal(b.items[1].working.correctOptionId,'option-0');
 assert.match(b.items[2].raw.sourceBlock,/Answer: A/);assert.equal(b.items[2].working.correctOptionId,'option-A');
});

test('cross-field edits cannot clear other damaged fields or original identity findings',async()=>{
 const q={...canonicalRecord(),id:'',text:'A damaged � question?',correctOptionId:'absent',explanation:'Damaged explanation �'};q.options[2].text='Gamma�';
 let b=await stageSources([canonicalSource([q])]);const original=structuredClone(b.items[0].raw);
 for(const patch of [{topic:'Other topic'},{text:'A repaired synthetic question?'},{explanation:'A repaired explanation with explicit source evidence.'}]){
  const before=b.items[0].working;b=reviewItem(b,{key:'s1q1',decision:'edit',reason:evidence,question:{...before,correctIndex:null,...patch}});
  for(const code of ['source_id','option_text_2','answer_mapping'])assert.ok(b.items[0].unresolved.some(f=>f.code===code),code);
  assert.equal(b.report.pass1,'blocked');assert.equal(b.report.pass2,'pending');assert.deepEqual(b.items[0].raw,original);
 }
});

test('canonical duplicate properties and non-finite numeric literals are archived and blocked, never last-write-wins',async()=>{
 const json=JSON.stringify({questionCount:1,questions:[canonicalRecord()]});
 for(const malformed of [json.replace('"correctOptionId":"o0"','"correctOptionId":"o0","correctOptionId":"o1"'),json.replace('"id":"o0"','"id":"o0","id":"o1"'),json.replace('"questionCount":1','"questionCount":1,"questionCount":1'),json.replace('"number":1','"number":1e999')]){
  const bytes=Buffer.from('<script type="application/json" id="sahoo-mock-data">'+malformed+'</script>'),f={name:'ambiguous.html',expectedCount:1,base64:bytes.toString('base64')},b=await stageSources([f]);
  assert.equal(b.sources[0].base64,f.base64);assert.equal(b.report.pass1,'blocked');assert.equal(b.report.pass2,'pending');assert.equal(b.report.parsed,0);assert.ok(b.sources[0].errors.length);
 }
});
