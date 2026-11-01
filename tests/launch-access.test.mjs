import test from 'node:test';
import assert from 'node:assert/strict';
import {createLaunchAccess,launchPolicyPreview,launchGateway,safeChannelUrl,subjectAccessLabel} from '../launch-access.js';

const session={status:'authenticated',student:{id:'fixture-student',displayName:'Fixture',email:'fixture@example.invalid',emailVerified:true},expiresAt:'2099-01-01T00:00:00Z'};
const eligible=id=>({testId:id,policyVersion:1,status:'eligible',checks:[{provider:'telegram',required:true,status:'verified'}]});
const allowed=id=>({status:'started',testId:id,page:{attemptId:'fixture-attempt'}});
const fixture=overrides=>({...launchGateway,connected:true,getSession:async()=>session,getLaunchPolicy:async()=>({...launchPolicyPreview,version:1}),verifyFreeAccess:async id=>eligible(id),startAttempt:async({testId})=>allowed(testId),logout:async()=>{},...overrides});

test('disconnected adapter never authenticates, verifies or starts a test',async()=>{
  const a=createLaunchAccess();await a.restore();assert.equal(a.snapshot.status,'unavailable');assert.equal(await a.verify('percentages'),null);assert.equal(await a.start('percentages'),null);assert.equal(a.snapshot.user,null);
});
test('anonymous student cannot call verification or attempt endpoints',async()=>{
  let calls=0;const a=createLaunchAccess(fixture({getSession:async()=>({status:'anonymous'}),verifyFreeAccess:async()=>{calls++;},startAttempt:async()=>{calls++;}}));
  await a.verify('percentages');await a.start('percentages');assert.equal(calls,0);assert.equal(a.snapshot.status,'anonymous');
});
test('every attempt refreshes session and policy and requests independent server authorization',async()=>{
  let sessions=0,policies=0,attempts=0;const keys=[];
  const a=createLaunchAccess(fixture({getSession:async()=>{sessions++;return session;},getLaunchPolicy:async()=>{policies++;return {...launchPolicyPreview,version:policies};},startAttempt:async input=>{attempts++;keys.push(input.idempotencyKey);assert.deepEqual(Object.keys(input).sort(),['expectedScoringVersion','idempotencyKey','testId']);return allowed(input.testId);}}));
  await a.verify('percentages');assert.equal((await a.start('percentages')).status,'started');assert.equal((await a.start('percentages')).status,'started');assert.equal(sessions,3);assert.equal(policies,3);assert.equal(attempts,2);assert.notEqual(keys[0],keys[1]);
});
test('lost membership after successful verification blocks start and restores requirement',async()=>{
  const a=createLaunchAccess(fixture({startAttempt:async()=>({status:'denied',reason:'requirements_unmet',freeAccess:{...eligible('percentages'),status:'requirements_unmet',checks:[{provider:'telegram',required:true,status:'not_member'}]}})}));
  await a.verify('percentages');assert.equal(a.snapshot.eligibility.status,'eligible');assert.equal(await a.start('percentages'),null);assert.equal(a.snapshot.eligibility.checks[0].status,'not_member');
});
test('expired or unavailable session and verification outages fail closed',async()=>{
  let authenticated=true;const a=createLaunchAccess(fixture({getSession:async()=>authenticated?session:{status:'anonymous'}}));await a.verify('percentages');authenticated=false;assert.equal(await a.start('percentages'),null);assert.equal(a.snapshot.eligibility,null);
  const down=createLaunchAccess(fixture({verifyFreeAccess:async()=>{throw new Error('Provider timeout');}}));assert.equal(await down.verify('percentages'),null);assert.equal(down.snapshot.status,'unavailable');
});
test('malformed policy, wrong-test response and unconfirmed attempt never unlock',async()=>{
  for(const override of [{getLaunchPolicy:async()=>({...launchPolicyPreview,loginRequired:false})},{startAttempt:async()=>allowed('another-test')},{startAttempt:async()=>({status:'started',testId:'percentages',page:{}})}])assert.equal(await createLaunchAccess(fixture(override)).start('percentages'),null);
});
test('server policy may disable Telegram requirement without disabling authentication',async()=>{
  const a=createLaunchAccess(fixture({getLaunchPolicy:async()=>({...launchPolicyPreview,telegramRequired:false})}));assert.ok(await a.start('percentages'));assert.equal(a.snapshot.policy.telegramRequired,false);assert.equal(a.snapshot.status,'authenticated');
});
test('registration confirmation does not create a signed-in user',async()=>{
  const a=createLaunchAccess(fixture({register:async()=>({status:'email_confirmation_required'}),getSession:async()=>({status:'anonymous'})}));await a.authenticate('register',{displayName:'Fixture Student',email:'fixture@example.invalid',password:'synthetic-password',confirmPassword:'synthetic-password'});assert.equal(a.snapshot.user,null);assert.match(a.snapshot.message,/Check your email/);
});
test('restore supports persistent server sessions, login and logout without browser storage',async()=>{
  let current={status:'anonymous'};const g=fixture({getSession:async()=>current,login:async()=>{current=session;return session;},logout:async()=>{current={status:'anonymous'};}});const a=createLaunchAccess(g);await a.authenticate('login',{email:'fixture@example.invalid',password:'synthetic-password'});assert.equal(a.snapshot.status,'authenticated');const b=createLaunchAccess(g);await b.restore();assert.equal(b.snapshot.user.id,session.student.id);await b.logout();assert.equal(b.snapshot.status,'anonymous');await a.restore();assert.equal(a.snapshot.user,null);
});
test('logout invalidates in-flight starts and local snapshot mutation grants nothing',async()=>{
  let resolveStart;const pending=new Promise(resolve=>{resolveStart=resolve;});const a=createLaunchAccess(fixture({startAttempt:()=>pending}));await a.restore();const s=a.snapshot;s.user.id='tampered';assert.equal(a.snapshot.user.id,session.student.id);
  const start=a.start('percentages');await new Promise(resolve=>setTimeout(resolve,0));await a.logout();resolveStart(allowed('percentages'));assert.equal(await start,null);assert.equal(a.snapshot.user,null);
});
test('concurrent start clicks cannot create two attempts',async()=>{
  let calls=0,resolve;const wait=new Promise(r=>{resolve=r;});const a=createLaunchAccess(fixture({startAttempt:async()=>{calls++;await wait;return allowed('percentages');}}));const first=a.start('percentages');assert.equal(await a.start('percentages'),null);resolve();await first;assert.equal(calls,1);
});
test('channel URLs reject script, credential and lookalike-host injection',()=>{
  assert.equal(safeChannelUrl('https://www.youtube.com/@exam','youtube'),'https://www.youtube.com/@exam');assert.equal(safeChannelUrl('https://t.me/exam','telegram'),'https://t.me/exam');for(const value of ['javascript:alert(1)','https://youtube.com.evil.test/@exam','https://evil@youtube.com/@exam','http://youtube.com/@exam'])assert.equal(safeChannelUrl(value,'youtube'),null);
});
test('premium state presentation never fabricates dates or treats pending as active',()=>{
  assert.equal(subjectAccessLabel(null),'Locked');assert.equal(subjectAccessLabel({state:'payment_pending'}),'Payment pending');assert.equal(subjectAccessLabel({state:'active',expiresAt:'invalid'}),'Locked');assert.match(subjectAccessLabel({state:'active',expiresAt:'2027-01-01T00:00:00Z'}),/^Active until/);assert.equal(subjectAccessLabel({state:'expired'}),'Expired · Renew access');
});

test('YouTube promotion configuration and obsolete flags cannot affect eligibility',async()=>{
  for(const youtubeChannelUrl of [null,'javascript:invalid','https://www.youtube.com/@optional']){
    const calls=[];const a=createLaunchAccess(fixture({getLaunchPolicy:async()=>({...launchPolicyPreview,youtubeChannelUrl,youtubeRequired:true}),beginSocialLink:async provider=>{calls.push(provider);throw new Error('Unexpected linking');}}));
    assert.equal((await a.verify('percentages')).status,'eligible');assert.ok(await a.start('percentages'));assert.equal(Object.hasOwn(a.snapshot.policy,'youtubeRequired'),false);assert.deepEqual(a.snapshot.eligibility,null);assert.deepEqual(calls,[]);
  }
});


test('new UI activates only with matching schema, Edge transport and explicit server activation',async()=>{
 for(const [capabilities,active] of [
  [{},false],
  [{attemptPolicySchema:2,attemptPolicyActive:true},false],
  [{attemptPolicyTransport:2,attemptPolicyActive:true},false],
  [{attemptPolicySchema:2,attemptPolicyTransport:2,attemptPolicyActive:false},false],
  [{attemptPolicySchema:2,attemptPolicyTransport:2,attemptPolicyActive:true},true]
 ]){
  let sent;
  const a=createLaunchAccess(fixture({getLaunchPolicy:async()=>({...launchPolicyPreview,version:1,...capabilities}),startAttempt:async payload=>{sent=payload;return allowed(payload.testId);}}));
  assert.equal((await a.start('fixture')).status,'started');
  assert.equal(a.snapshot.policy.attemptPolicyActive,active);
  assert.equal(sent.expectedScoringVersion,active?2:1);
 }
});
