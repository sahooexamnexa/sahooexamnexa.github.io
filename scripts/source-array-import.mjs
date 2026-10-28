// Private static-data adapter shared by the Admin Edge upload and offline verification.
// Acorn builds syntax trees only. Uploaded scripts/HTML are never executed or rendered.
import {parse,parseExpressionAt} from 'acorn';
import {createHash} from 'node:crypto';
import {prepareImport} from '../import-core.js';

function literal(node,depth=0){
  if(!node||depth>64)throw new Error('Missing, sparse or excessively nested data literal.');
  if(node.type==='Literal'&&!node.regex&&!node.bigint){
    if(node.value===null||typeof node.value==='string'||typeof node.value==='boolean'||(typeof node.value==='number'&&Number.isFinite(node.value)))return node.value;
  }
  if(node.type==='UnaryExpression'&&node.operator==='-'&&node.argument.type==='Literal'&&typeof node.argument.value==='number'&&Number.isFinite(node.argument.value))return -node.argument.value;
  if(node.type==='ArrayExpression')return node.elements.map(n=>literal(n,depth+1));
  if(node.type==='ObjectExpression'){
    const result=Object.create(null);
    for(const p of node.properties){
      if(p.type!=='Property'||p.kind!=='init'||p.method||p.computed||p.shorthand)throw new Error('Only plain static object properties are supported.');
      const key=p.key.type==='Identifier'?p.key.name:p.key.type==='Literal'&&typeof p.key.value==='string'?p.key.value:null;
      if(key===null||['__proto__','prototype','constructor'].includes(key)||Object.hasOwn(result,key))throw new Error('Unsafe or duplicate object key.');
      result[key]=literal(p.value,depth+1);
    }
    return result;
  }
  throw new Error('Only plain data literals are supported. Nothing is executed.');
}
export function parseDataLiteral(source,start=0){
  const node=parseExpressionAt(source,start,{ecmaVersion:2022});
  return {data:literal(node),end:node.end};
}
function children(node){return Object.values(node).flatMap(v=>Array.isArray(v)?v.filter(n=>n?.type):v?.type?[v]:[]);}
export function extractArray(html){
  const declarations=[],programs=[];
  // Consume comments as whole tokens so a commented-out example is not a bank.
  const tags=/<!--[\s\S]*?-->|<script\b([^>]*?)>/gi;
  let match;
  while((match=tags.exec(html))){
    if(match[0].startsWith('<!--'))continue;
    const start=tags.lastIndex,close=/<\/script\s*>/gi;close.lastIndex=start;
    const end=close.exec(html);if(!end)throw new Error('Unterminated script block.');
    tags.lastIndex=close.lastIndex;
    const attrs=match[1];
    // External scripts are never downloaded. Non-JavaScript data is not executable source.
    if(/\bsrc\s*=/i.test(attrs)||/\btype\s*=\s*["']?application\/json/i.test(attrs))continue;
    const script=html.slice(start,end.index),program=parse(script,{ecmaVersion:2022});
    programs.push(program);
    const topLevel=new Set(program.body.filter(n=>n.type==='VariableDeclaration'&&n.kind==='const').flatMap(n=>n.declarations));
    const pending=[program];
    while(pending.length){
      const node=pending.pop();
      if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.id.name==='questions'){
        if(!topLevel.has(node)||node.init?.type!=='ArrayExpression')throw new Error('Use one top-level const questions = static array; dynamic construction is unsupported.');
        declarations.push({node,start});
      }
      pending.push(...children(node));
    }
  }
  if(declarations.length!==1)throw new Error('Expected exactly one top-level const questions array.');
  const bank=declarations[0];
  // Do not import runtime changes. Direct top-level reads/aliases/writes of the bank
  // are ambiguous and rejected. Quiz callbacks/functions are ignored in their entirety,
  // including UI-only shuffling; the authoritative import is the literal snapshot.
  const functions=new Map(programs.flatMap(p=>p.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n.body])));
  const visited=new Set();
  for(const program of programs){
    const pending=[program];
    while(pending.length){
      const node=pending.pop();
      if(visited.has(node))continue;visited.add(node);
      if(node.type==='CallExpression'){
        const callee=node.callee;
        if(['FunctionExpression','ArrowFunctionExpression'].includes(callee.type))pending.push(callee.body);
        if(callee.type==='Identifier'&&functions.has(callee.name))pending.push(functions.get(callee.name));
      }
      if(node===bank.node||['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))continue;
      if(node.type==='Identifier'&&node.name==='questions')throw new Error('Top-level dynamic question processing is unsupported; supply a complete static array.');
      pending.push(...children(node));
    }
  }
  return {data:literal(bank.node.init),start:bank.start+bank.node.init.start,end:bank.start+bank.node.init.end};
}
// Fail closed: these are the reviewed source metadata identifiers, not inferred
// labels. Add other exam identities only with an explicit format review. This
// mapping validates source representation, not authenticity (Pass 2 still does).
const PYP_EXAMS=Object.freeze({
  'odisha-police-si':'Odisha Police SI',
  'odisha-police-constable':'Odisha Police Constable',
  'osssc-peo':'OSSSC PEO',
  'ri':'RI', 'osssc-ri':'OSSSC RI',
  'ari':'ARI', 'osssc-ari':'OSSSC ARI',
  'amin':'AMIN', 'osssc-amin':'OSSSC AMIN',
  'forest-guard':'Forest Guard', 'osssc-forest-guard':'OSSSC Forest Guard',
  'opsc':'OPSC', 'opsc-ocs':'OPSC OCS', 'opsc-aso':'OPSC ASO',
  'ossc':'OSSC', 'ossc-cgl':'OSSC CGL', 'ossc-chsl':'OSSC CHSL',
  'oprb':'OPRB', 'oprb-si':'OPRB SI', 'oprb-constable':'OPRB Constable'
});
const PYP_NAMES=new Set(Object.values(PYP_EXAMS));
function validPypLabel(label){
  if(typeof label!=='string')return false;
  // Match the entire original string: no trimming, guessing or suffix extraction.
  const match=/^(.+) (19\d{2}|20\d{2})$/.exec(label);
  return !!match&&match[0]===label&&PYP_NAMES.has(match[1]);
}
export function sourcePypTags(record){
  const tags=Array.isArray(record.tags)?record.tags.filter(validPypLabel):[];
  const pyp=record.pyp;
  if(pyp&&!Array.isArray(pyp)&&typeof pyp==='object'&&typeof pyp.examId==='string'&&Object.hasOwn(PYP_EXAMS,pyp.examId)&&Number.isInteger(pyp.year)){
    const expected=PYP_EXAMS[pyp.examId]+' '+pyp.year;
    if(pyp.label===expected&&validPypLabel(pyp.label)&&!tags.includes(pyp.label))tags.push(pyp.label);
  }
  return tags;
}
export function inspectSourceArrayHtml(html,{expectedCount}={}){
  if(typeof html!=='string'||Buffer.byteLength(html)>10*1024*1024)throw new Error('Source must be UTF-8 HTML within 10 MB.');
  const {data,start,end}=extractArray(html),records=JSON.parse(JSON.stringify(data));
  for(const [i,q] of records.entries()){
    if(!q||Array.isArray(q)||typeof q!=='object'||!(typeof q.id==='string'&&q.id.trim()||Number.isSafeInteger(q.id))||typeof q.question_statement!=='string'||!Array.isArray(q.options))throw new Error(`Invalid source structure/ID at record ${i+1}; no records dropped.`);
  }
  const canonical=records.map((q,i)=>({
    id:String(q.id),number:i+1,text:q.question_statement,
    options:q.options.map((text,j)=>({id:`option-${j}`,text})),
    correctOptionId:Number.isInteger(q.correct)?`option-${q.correct}`:null,
    explanation:q.explanation,topic:q.chapter,
    tags:sourcePypTags(q),
    metadata:{sourceIndex:i,sourceId:q.id,sourceRecord:q}
  }));
  const declaredCount=expectedCount??records.length;
  const result=prepareImport({questionCount:declaredCount,questions:canonical,metadata:{format:'const-questions-data-v1'}});
  // Reject malformed uploads atomically. Exact repeated content remains a review
  // finding rather than being silently removed. All custom/source fields stay private.
  const invalid=result.issues.filter(i=>i.field!=='duplicate');
  if(invalid.length)throw new Error(invalid.map(i=>`Record ${i.number??'count'}: ${i.field}`).join('; '));
  return {...result,sourceRecords:records,studentRecords:records.map(q=>({...q,tags:sourcePypTags(q),question_statement:q.question_statement.replaceAll('🟢','')})),sourceSha256:createHash('sha256').update(html).digest('hex'),arraySource:html.slice(start,end),format:'const-questions-data-v1',sourceLineStart:html.slice(0,start).split('\n').length};
}
