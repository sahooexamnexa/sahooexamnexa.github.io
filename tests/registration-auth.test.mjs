import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAuthFields,validateEmailCode,normalizeEmail,authErrorMessage,confirmationMessage} from '../auth-forms.js';
import {createLaunchAccess,launchPolicyPreview} from '../launch-access.js';
import {createSupabaseGateway} from '../supabase-gateway.js';
import {createLaunchViews} from '../launch-views.js';

const credentials={displayName:'  ସାହୁ Student  ',email:' Fixture@Example.invalid ',password:'Synthetic password 123!',confirmPassword:'Synthetic password 123!'};
const session={status:'authenticated',student:{id:'synthetic-user',displayName:'Student',email:'fixture@example.invalid',emailVerified:true,role:'student'},expiresAt:'2099-01-01T00:00:00Z'};
const fixture=overrides=>({connected:true,realBackend:true,getSession:async()=>({status:'anonymous'}),getLaunchPolicy:async()=>({...launchPolicyPreview,version:1}),register:async()=>({status:'email_confirmation_required'}),verifySignupCode:async()=>session,resendSignupCode:async()=>{},logout:async()=>{},...overrides});
const sdkClient=(overrides={})=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only',expires_at:4070908800}}}),getUser:async()=>({data:{user:{id:'synthetic-user',email:'fixture@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{role:'admin',emailVerified:true}}}}),...overrides}});
const publicConfig={url:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture'};
function browserBase(t,baseURI='http://localhost/'){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{value:{baseURI},configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
}

test('registration validates Unicode names and preserves password whitespace',()=>{
  assert.deepEqual(validateAuthFields('register',credentials),{});
  assert.equal(normalizeEmail(credentials.email),'fixture@example.invalid');
  assert.deepEqual(validateAuthFields('register',{...credentials,password:'  password  ',confirmPassword:'  password  '}),{});
});
for(const [name,change,field] of [
  ['missing name',{displayName:'  '},'displayName'],['oversized name',{displayName:'x'.repeat(121)},'displayName'],
  ['control in name',{displayName:'bad\u0000name'},'displayName'],['malformed email',{email:'a@'},'email'],
  ['empty password',{password:''},'password'],['short new password',{password:'short',confirmPassword:'short'},'password'],
  ['missing confirmation',{confirmPassword:''},'confirmPassword'],['different confirmation',{confirmPassword:'Different password'},'confirmPassword']
])test(name+' is rejected before signup',async()=>{
  let calls=0;const a=createLaunchAccess(fixture({register:async()=>{calls++;}}));
  await a.authenticate('register',{...credentials,...change});assert.equal(calls,0);assert.ok(a.snapshot.fieldErrors[field]);assert.equal(a.snapshot.user,null);
});
test('login does not impose new registration length or confirmation on existing passwords',()=>{
  assert.deepEqual(validateAuthFields('login',{email:'fixture@example.invalid',password:'old123'}),{});
});
for(const token of ['123456','12345678','1234567890'])test('configured '+token.length+' digit email codes are supported',()=>assert.deepEqual(validateEmailCode({email:credentials.email,token}),{}));
for(const token of ['',123456,'12345','12345678901','12a456','１２３４５６','<script>'])test('invalid code shape '+JSON.stringify(token)+' is rejected',()=>assert.ok(validateEmailCode({email:credentials.email,token}).token));
test('signup stays anonymous and never sends confirmation or forged privileges to the gateway',async()=>{
  let sent;const a=createLaunchAccess(fixture({register:async value=>{sent=value;return {status:'email_confirmation_required'};}}));
  await a.authenticate('register',{...credentials,role:'admin',emailVerified:true});
  assert.deepEqual(sent,{displayName:'ସାହୁ Student',email:'fixture@example.invalid',password:credentials.password});
  assert.equal(a.snapshot.status,'anonymous');assert.equal(a.snapshot.user,null);assert.equal(a.snapshot.verification.email,'fixture@example.invalid');assert.equal(a.snapshot.message,confirmationMessage);
  assert.doesNotMatch(JSON.stringify(a.snapshot),/Synthetic password|confirmPassword|emailVerified/);
});
test('OTP verification needs a fresh confirmed server session and policy',async()=>{
  let current={status:'anonymous'},verified=0;const a=createLaunchAccess(fixture({getSession:async()=>current,verifySignupCode:async input=>{assert.deepEqual(input,{email:'fixture@example.invalid',token:'123456'});verified++;current=session;}}));
  await a.verifyEmail({email:credentials.email,token:'123456'});assert.equal(verified,1);assert.equal(a.snapshot.status,'authenticated');assert.equal(a.snapshot.user.role,'student');assert.equal(a.snapshot.verification,null);assert.doesNotMatch(JSON.stringify(a.snapshot),/123456/);
});
test('successful code response alone cannot fabricate a confirmed account',async()=>{
  const a=createLaunchAccess(fixture());await a.verifyEmail({email:credentials.email,token:'123456'});assert.equal(a.snapshot.user,null);assert.notEqual(a.snapshot.status,'authenticated');
});
test('controller refuses a confirmed session for a different verification email',async()=>{
  const a=createLaunchAccess(fixture({getSession:async()=>session}));await a.verifyEmail({email:'another@example.invalid',token:'123456'});assert.equal(a.snapshot.user,null);assert.notEqual(a.snapshot.status,'authenticated');
});
test('expired session timestamps fail closed even with a verified flag',async()=>{
  const a=createLaunchAccess(fixture({getSession:async()=>({...session,expiresAt:'2001-01-01T00:00:00Z'})}));await a.restore();assert.equal(a.snapshot.status,'unavailable');assert.equal(a.snapshot.user,null);
});
for(const reason of ['invalid','expired'])test(reason+' OTP keeps the account unverified with a safe useful message',async()=>{
  const a=createLaunchAccess(fixture({verifySignupCode:async()=>{throw {code:'otp_expired',message:'private '+reason+' token 123456'};}}));
  await a.authenticate('register',credentials);await a.verifyEmail({email:credentials.email,token:'123456'});
  assert.equal(a.snapshot.status,'anonymous');assert.equal(a.snapshot.user,null);assert.match(a.snapshot.fieldErrors.token,/invalid or expired/);assert.doesNotMatch(JSON.stringify(a.snapshot),/private|123456/);
});
test('resend cooldown is enforced in controller even when the button is bypassed',async()=>{
  let clock=1000,calls=0;const a=createLaunchAccess(fixture({resendSignupCode:async()=>{calls++;}}),{now:()=>clock});
  await a.authenticate('register',credentials);assert.equal(a.snapshot.verification.resendSeconds,60);
  await a.resendCode(credentials.email);assert.equal(calls,0);
  clock+=59000;assert.equal(a.snapshot.verification.resendSeconds,1);await a.resendCode(credentials.email);assert.equal(calls,0);
  clock+=1000;await a.resendCode(credentials.email);assert.equal(calls,1);assert.equal(a.snapshot.verification.resendSeconds,60);assert.match(a.snapshot.message,/If this account needs confirmation/);
});
test('session restoration preserves pending confirmation and cooldown without storing credentials',async()=>{
  let clock=1000;const a=createLaunchAccess(fixture(),{now:()=>clock});await a.authenticate('register',credentials);clock+=10000;await a.restore();assert.equal(a.snapshot.verification.resendSeconds,50);assert.equal(a.snapshot.verification.email,'fixture@example.invalid');assert.equal(a.snapshot.user,null);
});
test('provider rate limiting starts a new cooldown without exposing provider details',async()=>{
  const a=createLaunchAccess(fixture({resendSignupCode:async()=>{throw {status:429,code:'over_email_send_rate_limit',message:'private account details'};}}),{now:()=>1000});
  await a.resendCode(credentials.email);assert.equal(a.snapshot.verification.resendSeconds,60);assert.match(a.snapshot.message,/Too many requests/);assert.doesNotMatch(a.snapshot.message,/private/);
});
test('SMTP/delivery failure is reported without claiming an email was sent',async()=>{
  const a=createLaunchAccess(fixture({resendSignupCode:async()=>{throw {code:'unexpected_failure',message:'SMTP private password'};}}));await a.resendCode(credentials.email);assert.match(a.snapshot.message,/could not be sent/);assert.doesNotMatch(a.snapshot.message,/private password/);assert.equal(a.snapshot.user,null);
});
test('signup delivery failure is actionable and does not create a local account',async()=>{
  const a=createLaunchAccess(fixture({register:async()=>{throw {code:'unexpected_failure'};}}));await a.authenticate('register',credentials);assert.match(a.snapshot.message,/could not be completed/);assert.equal(a.snapshot.user,null);
});
test('duplicate-account responses do not reveal existence or grant access',async()=>{
  for(const register of [async()=>({status:'email_confirmation_required'}),async()=>{throw {code:'user_already_exists',message:'PRIVATE EXISTING USER'};}]){
    const a=createLaunchAccess(fixture({register}));await a.authenticate('register',credentials);assert.equal(a.snapshot.message,confirmationMessage);assert.equal(a.snapshot.user,null);assert.doesNotMatch(JSON.stringify(a.snapshot),/PRIVATE/);
  }
});
test('unconfirmed existing login offers confirmation without changing password or granting access',async()=>{
  const a=createLaunchAccess(fixture({login:async()=>{throw {code:'email_not_confirmed'};}}));await a.authenticate('login',credentials);assert.equal(a.snapshot.verification.email,'fixture@example.invalid');assert.equal(a.snapshot.status,'anonymous');
});
for(const [label,error] of [['incorrect password',{code:'invalid_credentials'}],['login rate limit',{code:'over_request_rate_limit',status:429}]])test(label+' does not inherit an earlier signup verification route',async()=>{
  const a=createLaunchAccess(fixture({login:async()=>{throw error;}}));await a.authenticate('register',credentials);assert.ok(a.snapshot.verification);await a.authenticate('login',credentials);assert.equal(a.snapshot.verification,null);assert.equal(a.snapshot.user,null);
});
test('concurrent verification is deduplicated and logout invalidates its local result',async()=>{
  let release,calls=0;const pending=new Promise(resolve=>{release=resolve;});const a=createLaunchAccess(fixture({verifySignupCode:async()=>{calls++;await pending;},getSession:async()=>session}));
  const first=a.verifyEmail({email:credentials.email,token:'123456'});assert.equal(await a.verifyEmail({email:credentials.email,token:'123456'}),null);await a.logout();release();assert.equal(await first,null);assert.equal(calls,1);assert.equal(a.snapshot.user,null);assert.equal(a.snapshot.verification,null);
});
test('SDK signup preserves existing metadata/confirmation redirects and discards role injection',async t=>{
  browserBase(t);
  let sent;const g=createSupabaseGateway(sdkClient({signUp:async input=>{sent=input;return {data:{session:null},error:null};}}),publicConfig);
  assert.deepEqual(await g.register({...credentials,role:'admin'}),{status:'email_confirmation_required'});assert.deepEqual(sent,{email:'fixture@example.invalid',password:credentials.password,options:{data:{displayName:'ସାହୁ Student'},emailRedirectTo:'http://localhost/'}});
});
test('SDK resend uses signup confirmation, never passwordless auto-signup',async t=>{
  browserBase(t);
  let sent;const g=createSupabaseGateway(sdkClient({resend:async input=>{sent=input;return {error:null};}}),publicConfig);await g.resendSignupCode(credentials.email);assert.deepEqual(sent,{type:'signup',email:'fixture@example.invalid',options:{emailRedirectTo:'http://localhost/'}});
});
test('SDK confirmation and recovery retain the old Pages subpath redirects',async t=>{
  browserBase(t,'https://example.invalid/sahoo-academy/');let confirmation,reset;
  const g=createSupabaseGateway(sdkClient({resend:async input=>{confirmation=input;return {error:null};},resetPasswordForEmail:async(...args)=>{reset=args;return {error:null};}}),publicConfig);
  await g.resendSignupCode(credentials.email);await g.requestPasswordReset('fixture@example.invalid');assert.equal(confirmation.options.emailRedirectTo,'https://example.invalid/sahoo-academy/');assert.equal(reset[1].redirectTo,'https://example.invalid/sahoo-academy/reset-password.html');
});
test('SDK verifyOtp uses email type, checks remote user, and resolves role from the backend',async t=>{
  let sent;t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,publicConfig.url+'/functions/v1/academy-api');assert.equal(JSON.parse(options.body).action,'account');return Response.json({display_name:'Student',role:'student'});});
  const g=createSupabaseGateway(sdkClient({verifyOtp:async input=>{sent=input;return {error:null};}}),publicConfig);const result=await g.verifySignupCode({email:credentials.email,token:'123456'});assert.deepEqual(sent,{type:'email',email:'fixture@example.invalid',token:'123456'});assert.equal(result.student.role,'student');
});
test('SDK confirmation refuses unconfirmed remote users before calling the account API',async()=>{
  const g=createSupabaseGateway(sdkClient({verifyOtp:async()=>({error:null}),getUser:async()=>({data:{user:{id:'synthetic-user'}}})}),publicConfig);await assert.rejects(g.verifySignupCode({email:credentials.email,token:'123456'}),error=>error.code==='email_not_confirmed');
});
test('SDK confirmation refuses a session for a different email',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({display_name:'Student',role:'student'}));const g=createSupabaseGateway(sdkClient({verifyOtp:async()=>({error:null})}),publicConfig);await assert.rejects(g.verifySignupCode({email:'another@example.invalid',token:'123456'}),/does not match/);
});
test('SDK never submits malformed codes or invalid resend addresses',async()=>{
  const g=createSupabaseGateway(sdkClient(),publicConfig);await assert.rejects(g.verifySignupCode({email:credentials.email,token:'bad'}));await assert.rejects(g.resendSignupCode('bad'));
});
test('existing recovery remains a separate SDK action with the permanent callback',async t=>{
  browserBase(t);
  let sent;const g=createSupabaseGateway(sdkClient({resetPasswordForEmail:async(...args)=>{sent=args;return {error:null};}}),publicConfig);await g.requestPasswordReset('fixture@example.invalid');assert.deepEqual(sent,['fixture@example.invalid',{redirectTo:'http://localhost/reset-password.html'}]);
});
test('error presentation never includes raw backend text, tokens or account metadata',()=>{
  for(const context of ['register','login','verify','resend'])assert.doesNotMatch(authErrorMessage({message:'OTP 654321 password PRIVATE',code:'unknown'},context),/654321|PRIVATE/);
});
test('verification view escapes supplied text and rejects unsafe return destinations',()=>{
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const views=createLaunchViews({link:()=>'',title:()=>'',notice:()=>'',escape,connected:true,access:{snapshot:{status:'anonymous',verification:{email:'"><img src=x>',resendSeconds:60},fieldErrors:{token:'<svg onload=x>'}}}});
  const html=views.verifyEmail(new URLSearchParams('next=https://evil.invalid'));assert.doesNotMatch(html,/<img|<svg|evil.invalid/);assert.match(html,/data-next="account"/);assert.match(html,/autocomplete="one-time-code"/);assert.match(html,/aria-invalid="true"/);
});
