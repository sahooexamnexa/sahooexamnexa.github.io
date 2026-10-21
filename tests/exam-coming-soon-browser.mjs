// Synthetic catalog only; no real Auth, question bank or production writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:4173').replace(/\/?$/,'/');
const project='https://fixture.supabase.co',checks=[],errors=[];
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let current;
const fixture=()=>({exams:[{id:'empty',name:'Empty exam ଓଡ଼ିଆ',published:true},{id:'other',name:'Other exam',published:true},{id:'hidden',name:'Hidden exam',published:false}],subjects:[{id:'s',name:'Computer',exam_ids:['empty'],published:true,price_paise:0,validity_months:3},{id:'other-s',name:'Computer',exam_ids:['other'],published:true}],topics:[{id:'t',name:'Topic',subject_id:'s',published:true},{id:'other-t',name:'Topic',subject_id:'other-s',published:true}],tests:[{id:'other-test',title:'Other test',subject_id:'other-s',topic_id:'other-t',published:true,access:'free',question_count:1,duration_seconds:60}]});
const mock=published=>({id:'mock',title:'Fixture test',subject_id:'s',topic_id:'t',published,access:'free',question_count:1,duration_seconds:60});
await context.route('**/*',async r=>{
 const u=new URL(r.request().url());
 if(u.origin===new URL(base).origin){
  if(u.pathname===new URL('public-config.json',base).pathname)return r.fulfill({json:{url:project,publishableKey:'sb_publishable_fixture'}});
  const response=await r.fetch(),headers={...response.headers()};
  if(headers['content-security-policy'])headers['content-security-policy']=headers['content-security-policy'].replace(/https:\/\/[a-z0-9-]+\.supabase\.co/g,project).replace("connect-src 'self'","connect-src 'self' "+project);
  return r.fulfill({response,headers});
 }
 if(u.origin===project&&u.pathname==='/functions/v1/academy-api'){
  const action=r.request().postDataJSON().action;assert.ok(['policy','catalog'].includes(action),'No private/write operations allowed');
  return r.fulfill({json:action==='catalog'?current:{version:1,loginRequired:true,telegramRequired:false,attemptPolicyActive:true},headers:{'access-control-allow-origin':new URL(base).origin}});
 }
 throw Error('Unexpected external request: '+u.origin+u.pathname);
});
const visit=async route=>{await page.goto(base+'#/'+route);await page.reload();await page.locator('main').waitFor();};
const coming=page.getByRole('heading',{name:'Mock Tests Coming Soon 🚀',exact:true});
try{
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:900});
  for(const state of ['no-records','draft','hidden','subjects-topics','hidden-topic']){
   current=fixture();
   if(state==='no-records'){current.subjects=current.subjects.filter(s=>s.id!=='s');current.topics=current.topics.filter(t=>t.id!=='t');}
   if(['draft','hidden'].includes(state))current.tests.push(mock(false));
   if(state==='hidden-topic'){current.tests.push(mock(true));current.topics[0].published=false;}
   await visit('exam/empty');await coming.waitFor();
   await page.getByText('We’re preparing mock tests for this exam. Please check back soon.',{exact:true}).waitFor();
   assert.equal(await page.getByRole('link',{name:'Explore topics',exact:true}).count(),0);
   assert.ok(!(await page.locator('main').innerText()).includes('Fixture test'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   checks.push(width+'px: '+state+' → Coming Soon without hidden data or overflow');
  }
  current=fixture();await visit('exams');await page.getByRole('heading',{name:'Empty exam ଓଡ଼ିଆ',exact:true}).waitFor();
  const card=page.locator('main article').filter({has:page.getByRole('heading',{name:'Empty exam ଓଡ଼ିଆ',exact:true})});
  assert.equal(await card.getByText('Coming Soon',{exact:true}).count(),1);
  assert.equal(await page.getByRole('heading',{name:'Hidden exam',exact:true}).count(),0);
  await visit('exam/hidden');await page.getByText('This exam, subject, topic or test is unavailable in the selected hierarchy.',{exact:true}).waitFor();assert.equal(await coming.count(),0);
  checks.push(width+'px: badge present; hidden exam absent and direct URL unavailable');
  await visit('exam/empty');await coming.waitFor();current.tests.push(mock(true));await page.reload();
  await page.getByRole('link',{name:'Explore topics',exact:true}).waitFor();assert.equal(await coming.count(),0);
  await page.getByRole('link',{name:'Explore topics',exact:true}).click();await page.getByRole('link',{name:'View tests',exact:true}).click();await page.getByRole('link',{name:'View test',exact:true}).waitFor();
  assert.ok((await page.locator('main').innerText()).includes('FREE'));
  checks.push(width+'px: publishing restores exam → subject → topic → FREE test on reload');
  current.tests.at(-1).access='paid';await page.reload();await page.getByText('PREMIUM · SUBJECT ACCESS REQUIRED',{exact:true}).waitFor();
  await page.getByRole('link',{name:'View test',exact:true}).click();await page.getByRole('button',{name:'Start Premium Mock',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Start Premium Mock',exact:true}).isDisabled());
  checks.push(width+'px: published PREMIUM counts but access remains locked');
  current.tests.at(-1).published=false;await visit('exam/empty');await coming.waitFor();
  checks.push(width+'px: unpublishing automatically restores Coming Soon');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{await browser.close();}
