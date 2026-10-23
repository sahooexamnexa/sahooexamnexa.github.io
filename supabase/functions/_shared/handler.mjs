// Dependency-injected transport. All authorization and Telegram calls run on the server.
import {stageSources,reviewItem,filterBatch} from '../../../scripts/smart-import.mjs';
export const PUBLIC_ACTIONS=new Set(['policy','catalog']);
const ACTIONS=new Set([...PUBLIC_ACTIONS,'account','updateProfile','access','orders','createOrder','submitPayment','results','result','saveAttempt','submitAttempt','beginSocialLink','verify','start','adminOrderList','adminReorder','adminDeletePreview','adminDelete','adminQuestions','adminSaveQuestion','adminReviewQuestions','adminList','adminSave','adminReviewPayment','adminAccess','adminImportHtml','adminImportDetail','adminVerifyContent']);
export const sha256=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
async function boundedText(request,limit){
  if(Number(request.headers.get('content-length'))>limit)throw new Error('REQUEST_TOO_LARGE');
  if(!request.body)return '';const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('REQUEST_TOO_LARGE');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
export const isMember=r=>['creator','administrator','member'].includes(r?.status)||(r?.status==='restricted'&&r.is_member===true);
export async function checkTelegram({token,chatId,userId,fetcher=fetch}){
  if(!token||!chatId||!userId) return {status:'unavailable',verified:false};
  async function member(id){const r=await fetcher(`https://api.telegram.org/bot${token}/getChatMember`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,user_id:id}),signal:AbortSignal.timeout(8000)});const j=await r.json();if(!r.ok||!j.ok)throw new Error('Telegram unavailable');return j.result;}
  try{const bot=await member(Number(token.split(':')[0]));if(!['administrator','creator'].includes(bot.status))return {status:'unavailable',verified:false};const verified=isMember(await member(userId));return {status:verified?'verified':'not_member',verified};}catch{return {status:'unavailable',verified:false};}
}
export function makeHandler({rpc,getUser,config,inspectHtml,fetcher=fetch}){
  for(const action of ['adminSmartUpload','adminSmartList','adminSmartDetail','adminSmartReview','adminSmartFilter','adminSmartFinalize'])ACTIONS.add(action);
  return async request=>{
    const origin=request.headers.get('origin');const allowed=config.origins.includes(origin);
    const headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin',...(allowed?{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-allow-methods':'POST, OPTIONS'}:{})};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(origin&&!allowed)return reply(403,{error:'Origin not allowed'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{error:'Use POST'});
    try{
      const raw=await boundedText(request,2*1024*1024);
      const {action,payload={}}=JSON.parse(raw);if(!ACTIONS.has(action)||!payload||typeof payload!=='object'||Array.isArray(payload))return reply(400,{error:'Unsupported request'});
      const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
      let user=null;if(bearer){try{user=await getUser(bearer);}catch{}if(!user?.id||!user.email_confirmed_at)return reply(401,{error:'Please log in with a confirmed email'});}
      if(!PUBLIC_ACTIONS.has(action)&&!user)return reply(401,{error:'Please log in'});
      const actor=user?.id??null;
      if(PUBLIC_ACTIONS.has(action)){const data=await rpc(actor,action,{});return reply(200,action==='policy'?{...data,attemptPolicyTransport:2}:data);}
      if(action.startsWith('admin')){const profile=await rpc(actor,'account',{});if(profile.role!=='admin')return reply(403,{error:'Admin authorization required'});}
      if(['start','verify','beginSocialLink','createOrder'].includes(action))await rpc(actor,'rateLimit',{});
      if(action==='beginSocialLink'){
        if(!config.botUsername||!config.botToken||!config.webhookSecret)return reply(503,{error:'Telegram configuration is pending'});
        const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
        await rpc(actor,'telegramBegin',{nonceHash:await sha256(nonce)});
        return reply(200,{authorizationUrl:`https://t.me/${config.botUsername}?start=${nonce}`});
      }
      if(['start','verify'].includes(action)){
        const catalog=await rpc(actor,'catalog',{});
        const test=catalog.tests.find(t=>t.id===payload.testId);
        if(!test)return reply(200,{status:'denied',reason:'test_unavailable'});
        // Premium authorization is independent of all Telegram configuration/API state.
        if(test.access==='paid')return reply(200,await rpc(actor,action,{testId:payload.testId,idempotencyKey:payload.idempotencyKey,clientPolicyVersion:payload.clientPolicyVersion===2?2:1,expectedScoringVersion:payload.expectedScoringVersion}));
        const gate=await rpc(actor,'gateContext',{testId:payload.testId});
        const required=gate.required===true;
        let check={status:'not_required',verified:false},linked=false;
        if(required){const state=await rpc(actor,'telegramState',{});linked=!!state.telegram_id;check=linked?await checkTelegram({token:config.botToken,chatId:gate.channelId,userId:state.telegram_id,fetcher}):{status:'not_linked',verified:false};await rpc(actor,'telegramRecord',{member:check.verified});}
        const freeAccess={testId:payload.testId,policyVersion:gate.policyVersion,status:!required||check.verified?'eligible':check.status==='unavailable'?'verification_unavailable':'requirements_unmet',checks:[{provider:'telegram',required,status:check.status,linked,checkedAt:new Date().toISOString()}],checkedAt:new Date().toISOString()};
        if(required&&!check.verified)return reply(200,action==='verify'?freeAccess:{status:'denied',reason:freeAccess.status,freeAccess});
        // Never forward caller-supplied verification flags, user IDs or policy version.
        const data=await rpc(actor,action,{testId:payload.testId,idempotencyKey:payload.idempotencyKey,clientPolicyVersion:payload.clientPolicyVersion===2?2:1,expectedScoringVersion:payload.expectedScoringVersion,telegramVerified:check.verified,telegramChatId:gate.channelId,policyVersion:gate.policyVersion});
        if(data.status==='denied')return reply(200,action==='verify'?{...freeAccess,status:'requirements_unmet',checks:[{provider:'telegram',required:true,status:'unavailable',linked}]}:{...data,freeAccess:{...freeAccess,status:'verification_unavailable',checks:[{provider:'telegram',required:true,status:'unavailable',linked}]}});
        if(action==='verify')return reply(200,data.status==='eligible'?freeAccess:{...freeAccess,status:'test_unavailable'});
        return reply(200,data);
      }
      if(action==='adminSmartUpload'){
        const state=await stageSources(payload.files);
        return reply(200,await rpc(actor,'adminSmartCreate',{testId:payload.testId,state}));
      }
      if(action==='adminSmartReview'||action==='adminSmartFilter'){
        const batch=await rpc(actor,'adminSmartDetail',{batchId:payload.batchId});
        if(batch.revision!==payload.expectedRevision)return reply(409,{error:'Batch changed; reload before review'});
        const state=action==='adminSmartReview'?reviewItem(batch.state,payload):filterBatch(batch.state,payload.filter);
        return reply(200,await rpc(actor,'adminSmartUpdate',{batchId:batch.id,expectedRevision:batch.revision,state}));
      }
      if(action==='adminImportHtml'){
        if(typeof payload.html!=='string'||!Number.isInteger(payload.expectedCount)||payload.expectedCount<1)return reply(400,{error:'HTML and exact expected question count required'});
        let imported;try{imported=inspectHtml(payload.html,payload.expectedCount);}catch{return reply(400,{error:'Invalid static question array or canonical HTML. Check the exact count, unique IDs, four options, zero-based correct index, chapter and explanation. Dynamic data is unsupported. Nothing imported.'});}
        if(imported.audit.importedQuestions!==payload.expectedCount||!imported.audit.countMatch)return reply(400,{error:'Count mismatch. Nothing added or removed; nothing imported.'});
        return reply(200,await rpc(actor,'adminImport',{testId:payload.testId,html:payload.html,import:imported}));
      }
      return reply(200,await rpc(actor,action,payload));
    }catch(error){if(error?.code==='P0002')return reply(409,{error:'The test rules have been updated. Refresh the website before starting, editing timers or reviewing this attempt.'});return reply(error?.message==='REQUEST_TOO_LARGE'?413:error?.code==='42501'?403:400,{error:error?.message==='REQUEST_TOO_LARGE'?'Maximum request size is 2 MB':error?.code==='42501'?'Access denied':'Request could not be completed. Check the fields, current access and existing record status.'});}
  };
}
export function makeWebhook({rpc,secret}){return async request=>{
  if(request.method!=='POST'||!secret||await sha256(request.headers.get('x-telegram-bot-api-secret-token')||'')!==await sha256(secret))return new Response('Forbidden',{status:403});
  try{const raw=await boundedText(request,20000);const {message}=JSON.parse(raw);if(message?.chat?.type!=='private'||message?.from?.is_bot||message?.chat?.id!==message?.from?.id)return new Response('OK');const match=message.text?.match(/^\/start(?:@[A-Za-z0-9_]+)? ([a-f0-9]{48})$/);if(!match)return new Response('OK');const data=await rpc(null,'telegramConsume',{nonceHash:await sha256(match[1]),telegramId:String(message.from.id)});return Response.json({method:'sendMessage',chat_id:message.chat.id,text:data.linked?'Sahoo ExamNexa account linked. Return to the website and select Verify access.':'This link has expired or was already used. Connect Telegram again from your account.'});}catch{return new Response('Retry later',{status:503});}
};}
