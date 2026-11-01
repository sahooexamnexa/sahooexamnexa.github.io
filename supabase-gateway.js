// Public client uses only the Supabase project URL and publishable key.
// Auth tokens are managed by the official SDK. Authorization remains server-side.
import {siteBase} from './site-path.js';
import {normalizeEmail,validEmail,validateEmailCode} from './auth-forms.js';
export function validPublicConfig(c){return !!c&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url)&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.publishableKey);}
export async function configuredGateway(){
  if(typeof document==='undefined')return null;
  try{const r=await fetch(new URL('public-config.json',siteBase()),{cache:'no-store'});if(!r.ok)return null;const config=await r.json();if(!validPublicConfig(config))return null;const {createClient}=await import('./supabase-vendor.js');return createSupabaseGateway(createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}),config);}catch{return null;}
}
export function createSupabaseGateway(client,config){
  const call=async(action,payload={})=>{
    const headers={'content-type':'application/json',apikey:config.publishableKey};
    if(!['policy','catalog'].includes(action)){const {data,error}=await client.auth.getSession();if(error||!data.session)throw new Error('Log in to continue');headers.authorization='Bearer '+data.session.access_token;}
    const response=await fetch(config.url+'/functions/v1/academy-api',{method:'POST',headers,body:JSON.stringify({action,payload:{...payload,clientPolicyVersion:2}}),signal:AbortSignal.timeout(action==='adminImportHtml'?60000:25000)});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'Service unavailable');return body;
  };
  async function getSession(){const {data:{session},error}=await client.auth.getSession();if(error)throw error;if(!session)return {status:'anonymous'};const {data:{user},error:userError}=await client.auth.getUser();if(userError)throw userError;if(!user?.email_confirmed_at)throw Object.assign(new Error('Confirm your email and log in'),{code:'email_not_confirmed'});const profile=await call('account');return {status:'authenticated',student:{id:user.id,displayName:profile.display_name,email:user.email,emailVerified:true,role:profile.role},expiresAt:new Date(session.expires_at*1000).toISOString()};}
  return {connected:true,realBackend:true,call,getSession,
    async register({displayName,email,password}){const {data,error}=await client.auth.signUp({email:normalizeEmail(email),password,options:{data:{displayName:typeof displayName==='string'?displayName.trim():''},emailRedirectTo:siteBase().href}});if(error)throw error;return data.session?getSession():{status:'email_confirmation_required'};},
    async login({email,password}){const {error}=await client.auth.signInWithPassword({email:normalizeEmail(email),password});if(error)throw error;return getSession();},
    async verifySignupCode({email,token}){email=normalizeEmail(email);if(Object.keys(validateEmailCode({email,token})).length)throw Object.assign(new Error('Invalid verification input'),{code:'validation_failed'});const {error}=await client.auth.verifyOtp({email,token:token.trim(),type:'email'});if(error)throw error;const session=await getSession();if(session.status!=='authenticated'||normalizeEmail(session.student.email)!==email)throw new Error('Confirmed session does not match');return session;},
    async resendSignupCode(email){email=normalizeEmail(email);if(!validEmail(email))throw Object.assign(new Error('Invalid verification email'),{code:'validation_failed'});const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:siteBase().href}});if(error)throw error;},
    async requestPasswordReset(email){const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL("reset-password.html",siteBase()).href});if(error)throw error;},
    async logout(){const {error}=await client.auth.signOut({scope:'global'});if(error)throw error;},
    getMyAccount:()=>call('account'),getLaunchPolicy:()=>call('policy'),beginSocialLink:()=>call('beginSocialLink'),verifyFreeAccess:testId=>call('verify',{testId}),startAttempt:payload=>call('start',payload),getSubjectAccess:subjectId=>call('access',{subjectId}),
    saveAttempt:payload=>call('saveAttempt',payload),submitAttempt:payload=>call('submitAttempt',payload),
    updateLaunchPolicy:record=>call('adminSave',{entity:'admin_settings',record}),updateSubjectOffer:record=>call('adminSave',{entity:'subjects',record}),updateTestAccess:record=>call('adminSave',{entity:'tests',record})
  };
}
