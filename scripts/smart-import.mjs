// Server-only staging adapter. Source bytes and raw records never enter the public build.
import {createHash} from 'node:crypto';
import {extractArray,sourcePypTags} from './source-array-import.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(x).digest('hex');
// Only delimited, reviewed artifact forms are removed; ordinary prose is never guessed away.
export const cleanText=value=>typeof value==='string'?value.replaceAll('🟢','').replace(/\[cite:\s*\d+\]/gi,'').replace(/\[(?:MCQ PDF|PDF|Book|Notes|Book Notes|PDF Notes|Custom|Source|Practice)\]/gi,'').replace(/^\s*(?:Source file|Filename)\s*:[^\n]*$/gim,'').trim():'';
const norm=s=>cleanText(s).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const issue=(code,reason,stage='structure',related=null)=>({code,reason,stage,severity:'blocking',suggestion:stage==='content'?'Verify against an authoritative reference; record evidence or reject this occurrence.':'Correct from the original source; never guess missing content.',related});

export function auditItem(q){
 const findings=[];
 if(!q.text||q.text.length<8||/\uFFFD|(?:\.{3}|…)\s*$/.test(q.text))findings.push(issue('question_text','Missing, short, replacement characters or possibly truncated question.'));
 const opts=Array.isArray(q.options)?q.options:[];
 if(opts.length!==4||opts.some(o=>!o.text||!o.id))findings.push(issue('options','Exactly four usable options with stable IDs are required.'));
 if(new Set(opts.map(o=>o.id)).size!==opts.length)findings.push(issue('option_ids','Duplicate option IDs.'));
 if(new Set(opts.map(o=>norm(o.text))).size!==opts.length)findings.push(issue('duplicate_options','Repeated option text can make multiple choices correct.'));
 if(!q.correctOptionId||opts.filter(o=>o.id===q.correctOptionId).length!==1)findings.push(issue('answer_mapping','Exactly one answer must reference an existing option.'));
 if(!q.explanation||q.explanation.length<20)findings.push(issue('explanation_quality','Explanation is missing or too brief to support the answer.','content'));
 // These are unresolved checks, not assertions that an answer is wrong or AI-verified.
 findings.push(issue('factual_review','Factual correctness and question/answer consistency require evidence.','content'));
 findings.push(issue('ambiguity_review','Check wording, all alternatives and that exactly one answer is defensible.','content'));
 findings.push(issue('explanation_review','Check explanation correctness and consistency with the selected answer.','content'));
 findings.push(issue('relevance_review','Check relevance to the selected exam/subject/topic; a chapter name is not evidence.','content'));
 if(q.tags.length)findings.push(issue('pyp_provenance','Explicit supported source label found; authenticity still requires verification.','content'));
 return findings;
}
function canonical(raw,i,format){
 const q=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const sourceArray=format==='const-questions-data-v1';
 const options=(Array.isArray(q.options)?q.options:[]).map((o,j)=>({id:sourceArray?'option-'+j:typeof o?.id==='string'?o.id:'option-'+j,text:cleanText(sourceArray?o:o?.text)}));
 // Only explicitly delimited source labels/metadata are used. Never scan question prose.
 return {id:'pending',number:i+1,text:cleanText(sourceArray?q.question_statement:q.text),options,
 correctOptionId:sourceArray?(Number.isInteger(q.correct)?'option-'+q.correct:null):typeof q.correctOptionId==='string'?q.correctOptionId:null,
 explanation:cleanText(q.explanation),tags:sourcePypTags(q),topic:cleanText(sourceArray?q.chapter:q.topic)};
}
export function parsePdfText(text){
 // Reviewed PDF grammar: Q1. / Question 1: / 1. at line start; A-D option lines;
 // explicit Answer: A and Explanation: ...; optional PYP: <supported label> line.
 const starts=[...text.matchAll(/^(?:Q(?:uestion)?\s*)?(\d+)[.):]\s+(.+)$/gm)];
 if(!starts.length)throw Error('No supported numbered MCQ blocks. Scanned/layout-ambiguous PDF needs manual transcription or a supported export.');
 if(text.slice(0,starts[0].index).trim())throw Error('Unaccounted PDF preamble; use an MCQ-only export so no source text is silently skipped.');
 return starts.map((m,i)=>{
  const block=text.slice(m.index,starts[i+1]?.index??text.length),lines=block.split(/\r?\n/),q={id:m[1],number:Number(m[1]),text:m[2],options:[],correctOptionId:null,explanation:'',tags:[],topic:'',sourceBlock:block};let section='text';
  for(const line of lines.slice(1)){
   if(!line.trim())continue;
   let x=/^\s*([A-D])[).:]\s*(.*)$/.exec(line);
   if(x){q.options.push({id:'option-'+x[1],text:x[2]});section='option';continue;}
   x=/^\s*(?:Correct\s+Answer|Answer)\s*:\s*([A-D])\s*$/i.exec(line);
   if(x){if(q.correctOptionId)q.multipleAnswers=true;q.correctOptionId='option-'+x[1].toUpperCase();section='answer';continue;}
   x=/^\s*Explanation\s*:\s*(.*)$/i.exec(line);if(x){q.explanation=x[1];section='explanation';continue;}
   x=/^\s*PYP\s*:\s*(.*)$/i.exec(line);if(x){q.tags.push(x[1]);section='tag';continue;}
   if(section==='option')q.options.at(-1).text+='\n'+line;
   else if(section==='text'||section==='explanation')q[section]+='\n'+line;
   else q.unparsed=(q.unparsed||'')+'\n'+line;
  }
  if(q.multipleAnswers)q.correctOptionId=null;
  return q;
 });
}
export async function extractPdf(bytes){
 const {getDocumentProxy}=await import('unpdf');
 const pdf=await getDocumentProxy(new Uint8Array(bytes),{isEvalSupported:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true,verbosity:0});
 try{
  if(pdf.numPages>500)throw Error('PDF exceeds the 500-page processing safety limit; split the source.');
  const pages=[];let chars=0;
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),content=await page.getTextContent();let lines=[],line='',lastY=null;
   for(const item of content.items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(lastY!==null&&Math.abs(y-lastY)>3&&line){lines.push(line);line='';}line+=(line?' ':'')+item.str;lastY=y;if(item.hasEOL){lines.push(line);line='';lastY=null;}}
   if(line)lines.push(line);const text=lines.join('\n');if(!text.trim())throw Error('Unreadable/image-only page '+n+'; no OCR or invented transcription.');chars+=text.length;if(chars>4*1024*1024)throw Error('Extracted text exceeds safety budget; split source.');pages.push(text);page.cleanup();
  }
  return pages.join('\n');
 }finally{await pdf.loadingTask.destroy();}
}
function htmlRecords(html){
 const marker='<script type="application/json" id="sahoo-mock-data">',start=html.indexOf(marker);
 if(start<0)return {records:extractArray(html).data,format:'const-questions-data-v1'};
 const end=html.indexOf('</script>',start+marker.length);
 if(end<0||html.indexOf(marker,start+marker.length)>=0)throw Error('Ambiguous/truncated canonical JSON.');
 const data=JSON.parse(html.slice(start+marker.length,end));if(!Array.isArray(data.questions))throw Error('No canonical question array.');
 return {records:data.questions,declared:data.questionCount,format:'sahoo-canonical-v1'};
}
export function duplicateFindings(items){
 const relations=[];
 for(let i=0;i<items.length;i++)for(let j=0;j<i;j++){
  const a=items[i].working,b=items[j].working,at=norm(a.text),bt=norm(b.text);if(!at||!bt)continue;
  let kind=null;
  if(at===bt&&JSON.stringify(a.options.map(o=>norm(o.text)))===JSON.stringify(b.options.map(o=>norm(o.text))))kind='exact_duplicate';
  else{
   const aa=new Set(at.split(' ')),bb=new Set(bt.split(' '));const overlap=[...aa].filter(x=>bb.has(x)).length/Math.max(aa.size,bb.size);
   if(at===bt||(aa.size>=6&&bb.size>=6&&overlap>=0.85))kind='near_duplicate';
   else if(items[i].review?.factKey&&items[i].review.factKey===items[j].review?.factKey)kind='same_fact_candidate';
  }
  if(kind)relations.push({item:items[i].key,related:items[j].key,kind});
 }
 return relations;
}
export function refreshAudit(batch){
 const b=clone(batch),relations=duplicateFindings(b.items);
 for(const item of b.items){
  item.findings=[...auditItem(item.working),...(item.sourceFindings||[])];
  for(const r of relations.filter(r=>r.item===item.key||r.related===item.key))item.findings.push(issue(r.kind,'Duplicate candidate, not automatically removed. Compare both source occurrences.','content',r.item===item.key?r.related:r.item));
  const accepted=item.review?.decision==='approve';
  item.unresolved=item.findings.filter(f=>f.stage==='structure'||!accepted);
 }
 const active=b.items.filter(i=>!['reject','remove'].includes(i.review?.decision));
 const criterion=b.filter?.criterion||'all';
 const selected=active.filter(i=>criterion==='all'||criterion==='pyp'&&i.working.tags.length||criterion==='important'&&i.review?.important||criterion==='pyp-important'&&(i.working.tags.length||i.review?.important));
 b.selectedKeys=selected.map(i=>i.key);
 const blocking=b.sources.some(s=>s.errors.length)||selected.some(i=>i.unresolved.length)||selected.some(i=>i.review?.decision!=='approve');
 b.report={files:b.sources.map(({name,type,expectedCount,parsedCount,sha256,errors})=>({name,type,expectedCount,parsedCount,sha256,errors})),
 sourceCount:b.sources.reduce((n,s)=>n+s.expectedCount,0),parsed:b.items.length,selected:selected.length,rejected:b.items.filter(i=>i.review?.decision==='reject').length,
 removed:b.items.filter(i=>i.review?.decision==='remove').length,filteredOut:active.length-selected.length,added:0,corrected:b.items.filter(i=>i.edited).length,
 exactDuplicates:relations.filter(r=>r.kind==='exact_duplicate').length,nearDuplicates:relations.filter(r=>r.kind==='near_duplicate').length,sameFactCandidates:relations.filter(r=>r.kind==='same_fact_candidate').length,
 duplicateRelationships:relations,flagged:b.items.filter(i=>i.unresolved.length).length,pypTagged:selected.filter(i=>i.working.tags.length).length,criteria:criterion,requested:b.filter?.requested??null,
 shortfall:Math.max(0,(b.filter?.requested||0)-selected.length),pass1:b.sources.every(s=>!s.errors.length)&&b.items.every(i=>!i.findings.some(f=>f.stage==='structure'))?'passed':'blocked',
 selectedPass1:b.sources.every(s=>!s.errors.length)&&selected.length>0&&selected.every(i=>!i.findings.some(f=>f.stage==='structure'))?'passed':'blocked',
 pass2:!blocking&&selected.length?'approved':'pending',unresolvedBlocking:selected.reduce((n,i)=>n+i.unresolved.length,0)+b.sources.reduce((n,s)=>n+s.errors.length,0)};
 return b;
}
export async function stageSources(files,{pdfExtractor=extractPdf}={}){
 if(!Array.isArray(files)||!files.length)throw Error('Choose source files.');
 let total=0;const sources=[],items=[];
 for(const [index,f] of files.entries()){
  if(typeof f.name!=='string'||!f.name.trim()||f.name.length>255||!Number.isSafeInteger(f.expectedCount)||f.expectedCount<1||typeof f.base64!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64))throw Error('Filename, exact positive source count and canonical base64 required.');
  const bytes=Buffer.from(f.base64,'base64');total+=bytes.length;if(total>1024*1024)throw Error('Combined source bytes exceed 1 MB; split into smaller batches.');
  const type=/\.pdf$/i.test(f.name)?'pdf':/\.html?$/i.test(f.name)?'html':null;if(!type)throw Error('Only HTML/PDF files supported.');
  const s={name:f.name,type,base64:f.base64,sha256:hash(bytes),expectedCount:f.expectedCount,parsedCount:0,errors:[]};sources.push(s);
  let records=[],format;
  try{
   if(type==='pdf'){if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF signature.');records=parsePdfText(await pdfExtractor(bytes));format='pdf-lines-v1';}
   else{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),parsed=htmlRecords(text);records=parsed.records;format=parsed.format;if(parsed.declared!==undefined&&parsed.declared!==records.length)s.errors.push('Declared canonical count differs from extracted count.');}
   if(!Array.isArray(records))throw Error('No static question array.');s.parsedCount=records.length;
  }catch(error){s.errors.push('Extraction blocked: '+String(error.message).slice(0,250));}
  if(s.parsedCount!==s.expectedCount)s.errors.push('Expected '+s.expectedCount+'; parsed '+s.parsedCount+'. No installation allowed; correct/re-export the source.');
  const ids=new Set();
  records.forEach((raw,i)=>{
   const key='s'+(index+1)+'q'+(i+1),q=canonical(raw,i,format),sourceFindings=[];q.id=key;
   const sourceId=raw?.id??raw?.number;
   if(sourceId===undefined||ids.has(String(sourceId)))sourceFindings.push(issue('source_id','Missing or duplicate source ID in this file.'));ids.add(String(sourceId));
   if(raw?.unparsed)sourceFindings.push(issue('unparsed_text','Unaccounted text after answer/source label; inspect the preserved block.'));
   if(raw?.multipleAnswers)sourceFindings.push(issue('multiple_answers','Multiple answer declarations in source.'));
   items.push({key,sourceIndex:index,sourceId:sourceId??null,sourcePosition:i+1,raw:clone(raw),working:q,sourceFindings,review:{decision:'pending',important:false},edited:false});
  });
 }
 return refreshAudit({sources,items,sourceSha256:hash(Buffer.from(JSON.stringify(sources))),filter:{criterion:'all',requested:null}});
}
export function reviewItem(batch,payload){
 const b=clone(batch),item=b.items.find(i=>i.key===payload.key);if(!item)throw Error('Question occurrence not found.');
 const oldRelations=duplicateFindings(b.items);
 if(!['approve','keep','reject','remove','edit'].includes(payload.decision)||typeof payload.reason!=='string'||payload.reason.trim().length<20)throw Error('Decision and meaningful evidence/reason required.');
 if(payload.decision==='edit'){
  const q=payload.question;if(!q||!Array.isArray(q.options))throw Error('Editable question required.');
  item.working={...item.working,text:cleanText(q.text),options:q.options.map((o,i)=>({id:item.working.options[i]?.id||'option-'+i,text:cleanText(o.text)})),explanation:cleanText(q.explanation),tags:sourcePypTags(q),topic:cleanText(q.topic)};
  item.working.correctOptionId=Number.isInteger(q.correctIndex)?item.working.options[q.correctIndex]?.id??null:null;
  item.edited=true;item.review={decision:'pending',important:false,reason:payload.reason};
  // Evidence may repair a malformed occurrence, but original record/ID remain in archive.
  item.sourceFindings=[];
 }else{
  if(payload.decision==='approve'&&auditItem(item.working).some(f=>f.stage==='structure'))throw Error('Resolve structural blockers before approval.');
  item.review={decision:payload.decision,reason:payload.reason,important:payload.important===true,factKey:typeof payload.factKey==='string'?payload.factKey.trim().slice(0,200):''};
 }
 // Every correction reopens content review of all retained occurrences: duplicate relationships may change.
 if(payload.decision==='edit')for(const other of b.items)if(other.review.decision==='approve')other.review.decision='pending';
 // A newly linked fact must be reviewed by both occurrences; an earlier approval
 // cannot silently cover a relationship that did not exist when it was recorded.
 for(const r of duplicateFindings(b.items))if(!oldRelations.some(old=>old.item===r.item&&old.related===r.related&&old.kind===r.kind)){
  for(const other of b.items)if(other.key!==payload.key&&[r.item,r.related].includes(other.key)&&other.review.decision==='approve')other.review.decision='pending';
 }
 return refreshAudit(b);
}
export function filterBatch(batch,filter){
 if(!['all','pyp','important','pyp-important'].includes(filter.criterion)||filter.requested!==null&&(!Number.isSafeInteger(filter.requested)||filter.requested<1))throw Error('Invalid filter/target count.');
 return refreshAudit({...clone(batch),filter:{criterion:filter.criterion,requested:filter.requested}});
}
