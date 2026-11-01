// Local browser + the pinned official SDK. Every Auth/API response is synthetic.
// All non-local/non-fixture requests are blocked; no real account or email exists.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),port=Number(process.env.AUTH_TEST_PORT||4277),base=`http://127.0.0.1:${port}/`,project='https://fixture.supabase.co';
const email='student@fixture.invalid',password='Synthetic password 123!',id='10000000-0000-4000-8000-000000000001';
const user=()=>({id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{role:'admin',displayName:'DO NOT TRUST THIS ROLE'}});
const session=()=>{const exp=Math.floor(Date.now()/1000)+3600,b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return {access_token:b({alg:'HS256',typ:'JWT'})+'.'+b({sub:id,exp,role:'authenticated'})+'.synthetic-signature',token_type:'bearer',expires_in:3600,expires_at:exp,refresh_token:'synthetic-only',user:user()};};
const checks=[],errors=[],unexpected=[],server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),PUBLIC_SUPABASE_URL:project,PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},stdio:['ignore','pipe','pipe']});
let browser,serverError='';server.stderr.on('data',data=>{serverError+=String(data);});
const check=async(name,run)=>{await run();checks.push(name);};
async function scenario(){
  const state={signupError:null,verifyError:null,resendError:null,loginError:null,role:'student',calls:{signup:0,verify:0,resend:0,login:0,logout:0},signupBody:null,verifyBody:null,resendBody:null,redirects:[]};
  const context=await browser.newContext({viewport:{width:320,height:900},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===new URL(base).origin)return route.continue();
    if(url.origin!==project){unexpected.push(url.origin);return route.abort();}
    const headers={'access-control-allow-origin':new URL(base).origin,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,PUT,OPTIONS','x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const failure=error=>route.fulfill({status:error.status||400,json:{code:error.code,msg:'Synthetic rejected request',message:'Synthetic rejected request'},headers});
    if(url.pathname==='/auth/v1/signup'){
      state.calls.signup++;state.signupBody=request.postDataJSON();state.redirects.push(url.searchParams.get('redirect_to'));
      if(state.signupError)return failure(state.signupError);
      return route.fulfill({json:{user:{...user(),email_confirmed_at:null},session:null},headers});
    }
    if(url.pathname==='/auth/v1/verify'){
      state.calls.verify++;state.verifyBody=request.postDataJSON();
      if(state.verifyError)return failure(state.verifyError);
      return route.fulfill({json:session(),headers});
    }
    if(url.pathname==='/auth/v1/resend'){
      state.calls.resend++;state.resendBody=request.postDataJSON();state.redirects.push(url.searchParams.get('redirect_to'));
      if(state.resendError)return failure(state.resendError);
      return route.fulfill({json:{},headers});
    }
    if(url.pathname==='/auth/v1/token'){
      state.calls.login++;
      if(state.loginError)return failure(state.loginError);
      return route.fulfill({json:session(),headers});
    }
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:user(),headers});
    if(url.pathname==='/auth/v1/logout'){state.calls.logout++;return route.fulfill({status:204,headers});}
    if(url.pathname==='/functions/v1/academy-api'){
      const {action}=request.postDataJSON();
      if(action==='policy')return route.fulfill({json:{version:1,loginRequired:true,recheckFreeAccessEveryAttempt:true,telegramRequired:false,defaultValidityCalendarMonths:3},headers});
      if(action==='account')return route.fulfill({json:{display_name:'ସାହୁ Student',role:state.role},headers});
      if(action==='catalog')return route.fulfill({json:{exams:[],subjects:[],topics:[],tests:[]},headers});
      if(action==='results'||action==='orders'||action==='attempts')return route.fulfill({json:[],headers});
    }
    unexpected.push(url.pathname);return route.fulfill({status:500,json:{error:'Unexpected synthetic endpoint'},headers});
  });
  const go=async path=>{await page.goto(base+'#/'+path);await page.locator('#main').waitFor();await page.waitForFunction(()=>{const status=document.querySelector('#app')?.dataset.authStatus;return typeof status==='string'&&status!=='checking';});};
  const fill=async(confirm=password)=>{await page.locator('#full-name').fill('ସାହୁ Student');await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('#confirm-password').fill(confirm);};
  return {context,page,state,go,fill};
}
try{
  let ready=false;
  for(let i=0;i<60;i++){
    if(server.exitCode!==null)throw new Error('Synthetic server failed: '+serverError);
    try{const r=await fetch(base);if(r.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Local synthetic server is available');
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const a=await scenario(),{page,state,go,fill}=a;
  await go('register');
  await check('320px signup has four labelled fields and no horizontal overflow',async()=>{
    for(const label of ['Full name','Email address','Password','Confirm password'])assert.equal(await page.getByLabel(label,{exact:true}).count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await page.locator('#confirm-password').getAttribute('autocomplete'),'new-password');
  });
  await check('empty fields fail locally with accessible errors and focus',async()=>{
    await page.locator('#auth-form button').click();await page.locator('[role=alert]').waitFor();assert.equal(state.calls.signup,0);assert.equal(await page.evaluate(()=>document.activeElement.id),'full-name');assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');
  });
  await check('Confirm Password mismatch sends no signup and retains only safe fields',async()=>{
    await fill('Different synthetic password');await page.locator('#auth-form button').click();await page.getByText('The passwords do not match.',{exact:true}).waitFor();assert.equal(state.calls.signup,0);assert.equal(await page.evaluate(()=>document.activeElement.id),'confirm-password');assert.equal(await page.locator('#password').inputValue(),'');assert.equal(await page.locator('#email').inputValue(),email);
  });
  await check('successful signup uses official transport and stays anonymous on verification screen',async()=>{
    await fill();await page.locator('#auth-form button').click();await page.getByRole('heading',{name:'Verify your email',exact:true}).waitFor();assert.equal(state.calls.signup,1);assert.equal(state.signupBody.data.displayName,'ସାହୁ Student');assert.equal('confirmPassword' in state.signupBody,false);assert.equal('role' in state.signupBody.data,false);assert.equal(state.redirects[0],base);assert.equal(await page.locator('#app').getAttribute('data-auth-status'),'anonymous');assert.ok(await page.locator('[data-resend-code]').isDisabled());assert.equal(new URL(page.url()).search,'');assert.doesNotMatch(page.url(),/student@|123456|password/i);
  });
  await check('verification is private/noindex and retains confirmation-link alternative',async()=>{
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow');assert.match(await page.locator('main').innerText(),/confirmation link/);assert.equal(await page.locator('#verification-code').getAttribute('autocomplete'),'one-time-code');
  });
  await page.clock.install();
  await check('countdown updates without destroying a typed OTP',async()=>{
    await page.locator('#verification-code').fill('123456');await page.clock.fastForward(3000);assert.equal(await page.locator('#verification-code').inputValue(),'123456');assert.match(await page.locator('[data-resend-code]').textContent(),/Resend code in/);
  });
  await check('incorrect OTP is blocked and its value is removed from the form',async()=>{
    state.verifyError={code:'otp_expired',status:403};await page.locator('#email-verification-form button[type=submit],#email-verification-form button:not([type])').click();await page.locator('#verification-code-error').filter({hasText:/invalid or expired/}).waitFor();assert.equal(await page.locator('#app').getAttribute('data-auth-status'),'anonymous');assert.equal(await page.locator('#verification-code').inputValue(),'');assert.equal(state.verifyBody.type,'email');
  });
  await check('expired OTP remains anonymous and actionable',async()=>{
    await page.locator('#verification-code').fill('654321');await page.getByRole('button',{name:'Verify email',exact:true}).click();await page.locator('#verification-code-error').filter({hasText:/invalid or expired/}).waitFor();assert.equal(state.calls.verify,2);assert.equal(await page.locator('#app').getAttribute('data-auth-status'),'anonymous');
  });
  await check('resend becomes available after cooldown and uses signup, not auto-signup',async()=>{
    await page.clock.fastForward(61000);await page.getByRole('button',{name:'Resend code',exact:true}).click();await page.locator('main').getByText(/If this account needs confirmation, a new email/).waitFor();assert.equal(state.calls.resend,1);assert.equal(state.resendBody.type,'signup');assert.equal(state.resendBody.email,email);assert.equal(state.calls.signup,1);assert.ok(await page.locator('[data-resend-code]').isDisabled());
  });
  await check('successful OTP checks the remote account and lands on the account page',async()=>{
    state.verifyError=null;await page.locator('#verification-code').fill('123456');await page.getByRole('button',{name:'Verify email',exact:true}).click();await page.getByRole('heading',{name:'Signed-in student',exact:true}).waitFor();assert.equal(await page.locator('#app').getAttribute('data-auth-status'),'authenticated');assert.match(await page.locator('main').innerText(),/ସାହୁ Student/);
  });
  await check('email OTP does not grant Admin from hostile user_metadata',async()=>{
    await go('admin');await page.getByRole('heading',{name:'Admin sign-in required',exact:true}).waitFor();assert.equal(await page.locator('a[href="#/admin"]').count(),0);
  });
  await check('reload restores the official SDK session without password/OTP storage',async()=>{
    await go('account');await page.reload();await page.getByRole('heading',{name:'Signed-in student'}).waitFor();const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert.doesNotMatch(stored,/Synthetic password|confirmPassword|123456|654321/);
  });
  await check('logout and password login remain compatible',async()=>{
    await page.locator('.top-actions [data-logout]').click();await page.getByRole('heading',{name:'Not signed in'}).waitFor();assert.equal(state.calls.logout,1);await go('login');await page.locator('#email').fill(email);await page.locator('#password').fill('old123');await page.locator('#auth-form button').click();await page.getByRole('heading',{name:'Signed-in student'}).waitFor();assert.equal(state.calls.login,1);
  });
  await a.context.close();
  const b=await scenario();
  await check('duplicate-account error stays generic and does not authenticate',async()=>{
    b.state.signupError={code:'user_already_exists'};await b.go('register');await b.fill();await b.page.locator('#auth-form button').click();await b.page.getByRole('heading',{name:'Verify your email'}).waitFor();assert.equal(await b.page.locator('#app').getAttribute('data-auth-status'),'anonymous');assert.match(await b.page.locator('main').innerText(),/If you already have an account/);
  });
  await b.context.close();
  const c=await scenario();
  await check('signup delivery failure is visible without a fake authenticated account',async()=>{
    c.state.signupError={code:'unexpected_failure',status:500};await c.go('register');await c.fill();await c.page.locator('#auth-form button').click();await c.page.locator('main').getByText(/Registration could not be completed/).waitFor();assert.notEqual(await c.page.locator('#app').getAttribute('data-auth-status'),'authenticated');
  });
  await c.context.close();
  const d=await scenario();
  await check('failed resend is honest and retains cooldown',async()=>{
    d.state.resendError={code:'unexpected_failure',status:500};await d.go('verify-email');await d.page.locator('#verification-email').fill(email);await d.page.getByRole('button',{name:'Resend code',exact:true}).click();await d.page.locator('main').getByText(/confirmation email could not be sent/).waitFor();assert.equal(d.state.calls.resend,1);assert.ok(await d.page.locator('[data-resend-code]').isDisabled());
  });
  await d.context.close();
  const e=await scenario();
  await check('server 429 keeps resend disabled and reports the limit',async()=>{
    e.state.resendError={code:'over_email_send_rate_limit',status:429};await e.go('verify-email');await e.page.locator('#verification-email').fill(email);await e.page.getByRole('button',{name:'Resend code',exact:true}).click();await e.page.locator('main').getByText(/Too many requests/).waitFor();assert.ok(await e.page.locator('[data-resend-code]').isDisabled());
  });
  await e.context.close();
  const f=await scenario();
  await check('unconfirmed password login offers verification without another signup',async()=>{
    f.state.loginError={code:'email_not_confirmed'};await f.go('login');await f.page.locator('#email').fill(email);await f.page.locator('#password').fill(password);await f.page.locator('#auth-form button').click();await f.page.getByRole('heading',{name:'Verify your email'}).waitFor();assert.equal(f.state.calls.signup,0);assert.equal(await f.page.locator('#app').getAttribute('data-auth-status'),'anonymous');
  });
  await check('320px verification and desktop registration remain usable',async()=>{
    assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await fs.mkdir(new URL('../test-artifacts/',import.meta.url),{recursive:true});await f.page.screenshot({path:new URL('../test-artifacts/registration-otp-mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});await f.page.setViewportSize({width:1440,height:1000});await f.go('register');assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await f.page.screenshot({path:new URL('../test-artifacts/registration-desktop.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  });
  await f.context.close();
  const g=await scenario();
  await check('existing confirmation links still establish a verified SDK session',async()=>{
    const s=session();await g.page.goto(base+'#access_token='+s.access_token+'&refresh_token='+s.refresh_token+'&expires_in=3600&token_type=bearer&type=signup');await g.page.waitForFunction(()=>document.querySelector('#app')?.dataset.authStatus==='authenticated');await g.go('account');await g.page.getByRole('heading',{name:'Signed-in student'}).waitFor();assert.equal(g.state.calls.signup,0);assert.equal(g.state.calls.verify,0);
  });
  await check('unsafe return destinations are rejected on signup and verification',async()=>{
    await g.go('register?next='+encodeURIComponent('https://evil.invalid'));assert.equal(await g.page.locator('#auth-form').getAttribute('data-next'),'account');
  });
  await g.context.close();
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  const result={passed:checks.length,failed:0,checks,errors,unexpectedRequests:unexpected,realEmailsSent:0,productionRequests:0};
  await fs.mkdir(new URL('../test-artifacts/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../test-artifacts/registration-browser-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{
  await browser?.close();server.kill();
}
