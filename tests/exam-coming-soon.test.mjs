import test from 'node:test';
import assert from 'node:assert/strict';
import {examHasPublishedTests} from '../catalog-hierarchy.js';

const catalog=()=>({
 exams:[{id:'si',published:true},{id:'peo',published:true}],
 subjects:[{id:'si-computer',exam_ids:['si'],published:true},{id:'peo-computer',exam_ids:['peo'],published:true}],
 topics:[{id:'si-topic',subject_id:'si-computer',published:true},{id:'peo-topic',subject_id:'peo-computer',published:true}],
 tests:[]
});
const record=(extra={})=>({id:'mock',subject_id:'si-computer',topic_id:'si-topic',published:true,access:'free',...extra});

test('published exam with no tests stays Coming Soon even with subjects/topics',()=>{
 const c=catalog();assert.equal(examHasPublishedTests(c,'si'),false);
 c.subjects=[];c.topics=[];assert.equal(examHasPublishedTests(c,'si'),false);
});
test('draft, hidden and non-boolean publication values never count',()=>{
 const c=catalog();c.tests=[false,undefined,null,'true',0].map((published,i)=>record({id:String(i),published}));
 assert.equal(examHasPublishedTests(c,'si'),false);
});
test('one published FREE or PREMIUM test restores normal flow without checking entitlement',()=>{
 for(const access of ['free','paid']){const c=catalog();c.tests=[record({access})];assert.equal(examHasPublishedTests(c,'si'),true);}
});
test('another exam with the same subject display name cannot suppress Coming Soon',()=>{
 const c=catalog();c.subjects.forEach(s=>s.name='Computer');c.tests=[record({subject_id:'peo-computer',topic_id:'peo-topic'})];
 assert.equal(examHasPublishedTests(c,'si'),false);assert.equal(examHasPublishedTests(c,'peo'),true);
});
test('hidden exam, subject, topic and invalid ancestry fail closed',()=>{
 for(const key of ['exams','subjects','topics']){const c=catalog();c.tests=[record()];c[key][0].published=false;assert.equal(examHasPublishedTests(c,'si'),false,key);}
 const c=catalog();c.tests=[record({topic_id:'peo-topic'})];assert.equal(examHasPublishedTests(c,'si'),false);
 assert.equal(examHasPublishedTests(c,'missing'),false);
});
test('publish/unpublish derives availability from current catalog without mutation or saved switches',()=>{
 const c=catalog();c.tests=[record({published:false})];assert.equal(examHasPublishedTests(c,'si'),false);
 c.tests[0].published=true;const before=structuredClone(c);assert.equal(examHasPublishedTests(c,'si'),true);assert.deepEqual(c,before);
 c.tests[0].published=false;assert.equal(examHasPublishedTests(c,'si'),false);
});
