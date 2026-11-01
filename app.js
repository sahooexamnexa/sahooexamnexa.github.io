import {formatScore} from './attempt-policy.js';
import { exams, subjects, questions, tests, gradeTest } from './data.js';
import {subjectPlans,premiumTests,getPlan,money,validateTestPrice} from './commerce.js';
import {createCommerceViews} from './commerce-views.js';
import {createManagementViews} from './management-views.js';
import {createLaunchAccess,launchGateway,safeChannelUrl} from './launch-access.js';
import {createLaunchViews} from './launch-views.js';
import {createBackendUI} from './backend-ui.js';
import {siteRoute} from './site-path.js';
import {homeTitle,homeDescription,indexableHome} from './public-seo.js';
const access=createLaunchAccess(launchGateway);

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const state = { examFilter: 'All exams', examSearch: '', testFilter: 'All tests', testSearch: '', accessFilter: 'all', session: null, result: null, attempts: [], syllabus: new Set(), drafts: {}, adminSearch: '' };
let timer;
let verificationCountdown;
let currentRoute = '';
let modalOpener;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9', book:'M12 5v16M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z',
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
  building:'M4 21V6h16v15M2 21h20M8 10h1m6 0h1M8 14h1m6 0h1M10 21v-4h4v4', landmark:'m3 8 9-5 9 5H3m2 3v7m5-7v7m4-7v7m5-7v7M3 21h18',
  map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16m6-14v16', check:'m5 12 4 4L19 6', arrow:'M5 12h14m-5-5 5 5-5 5', chevron:'m9 5 7 7-7 7',
  clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', chart:'M4 3v18h17M8 16v-4m5 4V8m5 8V5', file:'M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h6',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8',
  spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z', calculator:'M5 2h14v20H5zM8 5h8v4H8zM8 13h1m6 0h1m-8 4h1m6 0h1',
  globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18', pen:'m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z',
  monitor:'M3 3h18v14H3zM8 21h8m-4-4v4', search:'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', menu:'M4 6h16M4 12h16M4 18h16',
  target:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0M12 11v2', lock:'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
  heart:'M12 21 3 12C-2 5 7-1 12 6 17-1 26 5 21 12z', upload:'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6', flag:'M5 22V3h14l-3 5 3 5H5', logout:'M9 3H3v18h6m5-15 6 6-6 6m-7-6h13'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
const link = (href, label, cls = 'btn', ico = '') => `<a class="${cls}" href="#/${escape(href)}">${label}${ico ? icon(ico) : ''}</a>`;
const notice = (text, warning = false) => `<div class="notice${warning ? ' warning' : ''}">${text}</div>`;
const empty = (title, text, action = '') => `<div class="empty">${icon('book')}<h3>${title}</h3><p>${text}</p>${action}</div>`;
const title = (eyebrow, name, text) => `<div class="page-title"><div class="eyebrow">${eyebrow}</div><h1>${name}</h1><p>${text}</p></div>`;
const sectionHead = (name, text, href, action) => `<div class="section-head"><div><h2>${name}</h2>${text ? `<p>${text}</p>` : ''}</div>${href ? link(href, action, 'text-link', 'arrow') : ''}</div>`;
const launch=createLaunchViews({icon,link,title,notice,escape,access,connected:launchGateway.connected});
const live=createBackendUI({gateway:launchGateway,access,launch,link,title,notice,escape,render,onResult:showServerResult});
const commerce=createCommerceViews({icon,link,title,notice,empty,escape,exams,getLaunchPolicy:()=>access.snapshot.policy,youtubePromotion:launch.youtubePromotion});
const management=createManagementViews({icon,link,title,notice,empty,escape,exams});
const catalog=[...tests,...premiumTests];
const navigation = [['exams','pen','Topic-wise Mock Tests'],['home','home','Overview'],['subjects','book','Subject subscriptions'],['tests','grid','Free & premium tests'],['syllabus','file','Syllabus'],['pyqs','clock','Previous year papers']];

function shell(content, page) {
  const adminLink = launchGateway.realBackend && access.snapshot.status === 'authenticated' && access.snapshot.user?.role === 'admin' ? link('admin','Private Admin','nav-item') : '';
  const pageBrand = `<div class="page-brand${state.session && page==='test' ? ' live-test-brand' : ''}"><img src="sahoo-examnexa-logo.png" alt="" width="1448" height="1086"><span>Sahoo ExamNexa</span></div>`;
  const active = page === 'exam' ? 'exams' : page === 'test' ? 'tests' : ['subject','topic'].includes(page) ? 'subjects' : page==='purchase' ? 'orders' : page;
  const nav = (items) => items.map(([route, ico, label]) => `<a href="#/${route}" class="nav-item ${active === route ? 'active' : ''}" ${active === route ? 'aria-current="page"' : ''}>${icon(ico)}${label}${active === route ? '<span class="nav-dot"></span>' : ''}</a>`).join('');
  return `<div class="layout"><button class="mobile-shade" aria-label="Close navigation" tabindex="-1"></button><aside class="sidebar" id="site-navigation"><a class="brand" href="#/home"><img src="sahoo-examnexa-logo.png" alt="" width="1448" height="1086"><span>Sahoo ExamNexa<small>Learn. Practise. Achieve.</small></span></a><div class="nav-label">YOUR PREPARATION</div><nav class="nav-list" aria-label="Preparation">${nav(navigation)}</nav><div class="nav-label">YOUR SPACE</div><nav class="nav-list" aria-label="Student">${nav([['dashboard','chart','My dashboard'],['results','target','Results & insights'],['orders','lock','My subjects & orders'],['account','users','My account'],['help','users','Help & support']])}</nav><div class="sidebar-bottom"><div class="study-note">${icon('spark')}<b>A little progress, every day.</b><p>Your next chapter begins with today’s practice.</p></div>${adminLink}</div></aside><div class="workspace"><header class="topbar"><button class="menu-button" aria-label="Open navigation" aria-controls="site-navigation" aria-expanded="false">${icon('menu')}</button><a class="mobile-brand" href="#/home" aria-label="Sahoo ExamNexa overview"><img src="sahoo-examnexa-logo.png" alt="" width="1448" height="1086"></a><div class="breadcrumb">Your learning journey <span>/ ${escape(page === 'home' ? 'Overview' : page === 'admin' ? 'Admin' : page.charAt(0).toUpperCase() + page.slice(1))}</span></div><div class="top-actions"><span class="pill"><span class="live-dot"></span> Made for Odisha aspirants</span>${access.snapshot.status==='authenticated'?link('account','My account','text-link')+'<button class="btn secondary small" data-logout>Log out</button>':link('login','Log in','text-link')+link('register','Register','btn small','arrow')}</div></header><div id="connection-status">${navigator.onLine ? '' : offlineNotice()}</div><main class="main" id="main" tabindex="-1">${pageBrand}${content}</main><footer class="footer"><span>© ${new Date().getFullYear()} Sahoo ExamNexa. Every step counts.</span><div class="footer-links">${link('pricing','Subject pricing','')}${link('help','Help & support','')}${link('about','About','')}${link('privacy','Privacy','')}</div><div class="footer-social">${commerce.socialStrip()}</div></footer></div></div>`;
}
function examCard(e) {
  return `<article class="card exam-card"><div class="card-top"><div class="icon-box ${e.color}">${icon(e.icon)}</div><span class="card-label">${e.group}</span></div><h3>${e.name}</h3><p>${e.label}</p><div class="card-divider"></div><div class="card-bottom"><span>Syllabus · Practice · Mock tests</span>${link(`exam/${e.id}`,'Explore','text-link','arrow')}</div></article>`;
}
function testRow(t) {
  return `<div class="test-row"><div class="icon-box ${t.color}">${icon('pen')}</div><div><h3>${t.title}</h3><p>${t.ids.length} sample questions &nbsp;·&nbsp; ${t.minutes} min &nbsp;·&nbsp; ${t.type}</p></div>${link(`test/${t.id}`,'Try free','btn secondary small','arrow')}</div>`;
}
function home() {
 return `<div class="intro"><p>Sahoo ExamNexa · Odisha competitive-exam preparation</p><span class="pill neutral">FOCUSED TOPIC PRACTICE</span></div><section class="hero"><div><span class="pill orange">${icon('target')} FOCUSED PRACTICE. REAL AMBITION.</span><h1>Topic-wise<br><em>Mock Tests</em></h1><p>Choose your exam, find your subject, and practise topic by topic. Unlock all included mock tests in a subject with three months of access.</p><div class="hero-buttons">${link('exams','Choose your exam','btn','arrow')}${link('tests?access=free','Try a free sample','btn secondary')}</div><div class="hero-foot">${icon('check')} Subject subscriptions ${icon('check')} 3-month access</div>${launch.youtubePromotion()}</div><div class="journey"><div class="eyebrow">TOPIC-WISE MOCK TESTS → EXAM → SUBJECT → TOPIC → FREE / PREMIUM</div><h3>A clear path.<br>A focused way to practise.</h3>${[['01','Choose your exam','Find the preparation pathway for your goal.'],['02','Pick a subject and topic','Focus on one part of the syllabus at a time.'],['03','Try free or explore premium','Free samples now. Subject access after verified payment.']].map(([n,h,p])=>`<div class="journey-step"><span class="step-num">${n}</span><div><b>${h}</b><small>${p}</small></div>${icon('check')}</div>`).join('')}<div class="journey-bottom">${icon('lock')} Premium content unlocks after payment verification.</div></div></section><div class="benefits">${[['map','Odisha exam pathways'],['book','Topic-wise preparation'],['clock','Three-month subject access'],['chart','Practice. Review. Improve.']].map(([i,t])=>`<div class="benefit">${icon(i)}${t}</div>`).join('')}</div><section class="section home-exams">${sectionHead('Start with your exam.','Then follow your subject and topic pathway.','exams','All exams')}<div class="grid cols-3">${exams.slice(0,3).map(examCard).join('')}</div></section><section class="section">${sectionHead('Your subject. Your next chapter.','All included topic-wise mock tests, with three months of subject access.','subjects','All subjects')}<div class="grid cols-3">${subjectPlans.slice(0,3).map(p=>commerce.subjectCard(p)).join('')}</div></section><section class="section split"><div>${sectionHead('Try the experience. It’s free.','FREE samples. Registration and access checks required.','tests?access=free','Free samples')}<div class="card">${tests.slice(0,2).map(testRow).join('')}</div></div><aside class="quote-card"><div class="eyebrow">THREE MONTHS. ONE SUBJECT.</div><h2>Small daily sessions.<br>Stronger foundations.</h2><p>Start with a free sample. Review available tests and payment details before choosing subject access.</p>${link('pricing','See subject pricing','text-link','arrow')}</aside></section>${commerce.socialStrip()}${notice('Preview catalog: subject prices and premium test specifications are illustrative. Sign-in and test access require a connection to the configured service; every test start checks eligibility.')}`;
}

function examList() {
  return title('TOPIC-WISE MOCK TESTS','Choose your exam','Next, choose a subject and topic to find free samples and premium tests.') + `<div class="toolbar"><div class="search-wrap">${icon('search')}<label class="sr-only" for="exam-search">Search exams</label><input id="exam-search" type="search" placeholder="Search for your exam…" value="${escape(state.examSearch)}"></div><label class="sr-only" for="exam-group">Exam organization</label><select id="exam-group">${['All exams','Odisha Police','OSSSC','OPSC','OSSC'].map(x=>`<option ${state.examFilter === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="grid cols-3" id="exam-results">${filteredExams()}</div>${notice('These are preparation pathways, not recruitment announcements. Exam-specific official syllabi and notifications will be added after verification.')}`;
}
function filteredExams() {
  const found = exams.filter(e => (state.examFilter === 'All exams' || e.group === state.examFilter) && `${e.name} ${e.label}`.toLowerCase().includes(state.examSearch.toLowerCase()));
  return found.length ? found.map(examCard).join('') : empty('No matching exams','Try another exam name or organization.');
}
function examDetail(id) {
  const e = exams.find(x=>x.id===id);
  if (!e) return notFound();
  return `${link('exams','← All exams','text-link')}${title(e.group,e.name,e.desc)}<div class="grid cols-3">${[['subjects','book','Choose your subject','Three-month access to included topic-wise mock tests.'],['syllabus','file','Make a study plan','Explore an illustrative subject checklist.'],['pyqs','clock','Learn from past papers','Browse the planned PYQ library.']].map(([r,i,h,p])=>`<article class="card"><div class="icon-box ${e.color}">${icon(i)}</div><h3 class="mt">${h}</h3><p>${p}</p>${link(`${r}?exam=${e.id}`,'Explore','text-link','arrow')}</article>`).join('')}</div>${notice('Preparation preview: the subjects below are illustrative. They are not a verified or complete syllabus for this exam. Official eligibility, pattern, dates and marking rules are not yet published here.',true)}<section class="section">${sectionHead('Choose your subject','Then choose a topic to explore free and premium mock tests.')}<div class="grid cols-3">${subjectPlans.map(s=>`<article class="card"><div class="icon-box ${s.color}">${icon(s.icon)}</div><h3 class="mt">${s.name}</h3><p>${s.topics.length} illustrative topics</p>${link(`subject/${s.id}?exam=${e.id}`,'View topics','text-link','arrow')}</article>`).join('')}</div></section>`;
}
function subjectPage(params) {
 const selected=params.get('subject');
 return selected ? commerce.subjectDetail(selected,params)||notFound() : commerce.subjectStore(params);
}

function topicPage(id, params) {
  const s = subjectPlans.find(s=>s.id===id), topic = params.get('name');
  if (!s || !s.topics.includes(topic)) return notFound();
  const ready = topic === 'Percentages';
  return `${link(`subject/${id}${exams.some(e=>e.id===params.get('exam'))?'?exam='+params.get('exam'):''}`,'← Back to subject','text-link')}${title(s.name,escape(topic),'A focused space to learn, practise and review.')}${commerce.topicTests(id,topic,params,ready ? tests.find(t=>t.id==='percentages') : null)}<div class="grid cols-2"><article class="card"><span class="pill neutral">LEARNING NOTES</span><h2 class="mt">${ready ? 'Understand the basics' : 'Your next learning chapter'}</h2>${ready ? '<p>A percentage expresses a quantity out of 100. To find a percentage of a number, divide the percentage by 100, then multiply by the number.</p><p><strong>Example:</strong> 15% of 200 = 15 ÷ 100 × 200 = 30.</p><p>For a discount, subtract the discount amount from the original price. Start with the whole quantity, calculate the fraction, then check that your answer makes sense.</p>' : '<p>Reviewed learning notes are not available for this topic yet. This page is ready for approved lessons and linked questions.</p>'}</article><article class="card"><span class="pill">PRACTICE</span><h2 class="mt">Put your understanding to work.</h2><p>${ready ? 'Try two original percentage questions, then review the explanations.' : 'Dedicated practice for this topic is coming later. Explore the available mixed sample in the meantime.'}</p>${link(ready ? 'test/percentages' : 'tests',ready ? 'Start topic practice' : 'Explore available tests','btn','arrow')}</article></div>`;
}
function syllabus(params) {
  const totalTopics=subjects.reduce((n,s)=>n+s.topics.length,0);
  const e = exams.find(e=>e.id===params.get('exam'));
  return title('YOUR STUDY ROADMAP',e ? `${e.name}: study outline` : 'A little structure goes a long way.','Use this sample checklist to plan your learning. Your ticks last only while this page session stays open.') + notice('Illustrative preparation outline only. This is not an official exam syllabus. Verified exam-specific documents and source links are awaiting upload.',true) + `<div class="card"><div class="section-head"><h2>Your session checklist</h2><span id="syllabus-count">${state.syllabus.size} / ${totalTopics} topics</span></div><progress id="syllabus-progress" value="${state.syllabus.size}" max="${totalTopics}" aria-label="Topics checked"></progress></div><section class="section">${subjects.map((s,i)=>`<details ${i===0 ? 'open' : ''}><summary>${s.name} <span class="muted">· ${s.topics.length} topics</span></summary><div class="details-body">${s.topics.map((t,n)=>`<label class="check-row"><input type="checkbox" data-check="${s.id}-${n}" ${state.syllabus.has(`${s.id}-${n}`) ? 'checked' : ''}>${escape(t)}</label>`).join('')}</div></details>`).join('')}</section>`;
}
function testCard(t) {
 const paid=t.access==='paid',plan=paid?getPlan(t.planId):null;
 return `<article class="card ${paid?'premium-card':''}"><div class="card-top"><div class="icon-box ${t.color}">${icon(paid?'lock':'pen')}</div><span class="pill ${paid?'premium':''}">${paid?'PAID / PREMIUM · LOCKED':'FREE SAMPLE'}</span></div><span class="eyebrow">${t.type}</span><h3>${t.title}</h3><p>${t.desc}</p><div class="card-bottom"><span>${paid?t.questionCount:t.ids.length} ${paid?'planned':'sample'} questions</span><span>${t.minutes} minutes</span></div>${paid?`<div class="mt"><b>${money(plan.pricePaise)}</b><span class="price-term"> / 3 months of ${plan.name}</span><p class="price-disclaimer">Illustrative subject price · Not a per-test purchase</p></div>`:'<p class="mt">₹0 · Registration and verification required</p>'}<div class="card-divider"></div>${link(`test/${t.id}`,paid?'View locked test':'View instructions','text-link','arrow')}</article>`;
}

function testList(params=new URLSearchParams()) {
 if(params.has('access'))state.accessFilter=['free','paid'].includes(params.get('access'))?params.get('access'):'all';
 return title('TOPIC-WISE MOCK TESTS','Small topics. Strong preparation.','Free samples for everyone. Premium topic-wise tests included with three-month subject subscriptions.')+`<div class="toolbar"><div class="search-wrap">${icon('search')}<label class="sr-only" for="test-search">Search tests</label><input id="test-search" type="search" placeholder="Search topics, tests or subjects…" value="${escape(state.testSearch)}"></div><label class="sr-only" for="test-access">Access type</label><select id="test-access">${[['all','All access types'],['free','Free samples'],['paid','Paid / Premium']].map(([v,l])=>`<option value="${v}" ${state.accessFilter===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="chips" aria-label="Filter tests">${['All tests','Topic-wise','Mixed','Full mock'].map(t=>`<button class="chip ${state.testFilter===t?'active':''}" data-test-filter="${t}" aria-pressed="${state.testFilter===t}">${t}</button>`).join('')}</div><div id="test-results" class="grid cols-3 mt">${filteredTests()}</div>${notice('Paid tests require an active subscription to their subject. The full/mixed free previews remain available as secondary formats. Premium cards contain metadata only; actual questions are not in the public bundle.')}`;
}

function filteredTests() {
  const found = catalog.filter(t=>(state.accessFilter==='all' || t.access===state.accessFilter) && (state.testFilter==='All tests' || t.type===state.testFilter) && `${t.title} ${t.subject}`.toLowerCase().includes(state.testSearch.toLowerCase()));
  return found.length ? found.map(testCard).join('') : empty('No matching tests','Try another search or test type.');
}
function testPage(id,params=new URLSearchParams()) {
  const premium=commerce.premiumDetail(id,params);if(premium)return premium+launch.premiumStatus()+launch.stateGuide();
  const t = tests.find(t=>t.id===id);
  if (!t) return notFound();
  if (state.session?.test.id === id) return testRunner();
  return `${link('tests','← Back to mock tests','text-link')}${title(`${t.type} · Free sample`,t.title,'A quiet moment to focus. Read the instructions before you begin.')}<div class="grid cols-3">${[[t.ids.length,'Original sample questions'],[`${t.minutes} min`,'Total time'],['+1 / 0','Correct / incorrect marks']].map(([v,l])=>`<div class="card"><span class="stat-value">${v}</span><span class="stat-label">${l}</span></div>`).join('')}</div><div class="card mt"><h2>A few things to know</h2><ul class="feature-list"><li>${icon('check')}One correct answer per question. No negative marking in this sample.</li><li>${icon('check')}Move between questions, clear an answer or flag it for review.</li><li>${icon('check')}The timer starts when you begin. Your test submits when time runs out.</li><li>${icon('check')}You can submit early. Unanswered questions receive zero marks.</li><li>${icon('check')}Answers and results stay in memory for this session; refreshing clears them.</li></ul>${notice('This is an unproctored public sample. Scores are for practice only, with no ranking or certification.')}${launch.freeGate(t,params)}</div>`;
}
function testRunner() {
  const s=state.session, q=s.items[s.index];
  return `<div class="test-banner"><div><div class="eyebrow">${s.remote?(s.test.access==='paid'?'PREMIUM':'FREE'):'FREE SAMPLE'} · ${s.test.type}</div><h2>${escape(s.test.title)}</h2>${s.remote?`<p class="attempt-scoring">This attempt: +1 correct / ${s.scoringVersion===2?'−0.25':'0'} incorrect / 0 unanswered</p>`:''}</div><button class="btn ghost" data-action="exit-test">Exit test</button></div><div class="test-layout"><section class="card live-question"><div class="section-head"><span class="pill neutral">Question ${s.index+1} of ${s.items.length}</span><span class="card-label">${escape(q.subject)}</span></div><h1 class="question-text" id="question-heading">${escape(q.text)}</h1><fieldset style="border:0;padding:0;margin:0"><legend class="sr-only">Choose one answer</legend>${q.options.map((o,i)=>`<label class="answer-option"><input type="radio" name="answer" value="${i}" ${s.answers[q.id]===i ? 'checked' : ''}><span>${String.fromCharCode(65+i)}.</span>${escape(o)}</label>`).join('')}</fieldset><div class="test-controls"><button class="btn ghost small" data-action="clear-answer">Clear Response</button><button class="btn ghost small" data-action="flag-answer" aria-pressed="${s.flags.has(q.id)}">${icon('flag')}${s.flags.has(q.id) ? 'Unflag question' : 'Mark for Review'}</button><div><button class="btn secondary small" data-question="${s.index-1}" ${s.index===0 ? 'disabled' : ''}>Previous</button> <button class="btn small" data-question="${s.index+1}" ${s.index===s.items.length-1 ? 'disabled' : ''}>Save & Next ${icon('arrow')}</button></div></div></section><aside class="card test-side"><div class="test-timer"><span class="stat-label">Time remaining</span><strong class="timer" id="timer" role="timer" aria-label="Time remaining">${timeLeft()}</strong></div><div class="test-navigation"><div class="question-grid">${s.items.map((q,i)=>`<button data-question="${i}" class="${Number.isInteger(s.answers[q.id]) ? 'answered' : ''} ${i===s.index ? 'current' : ''} ${s.flags.has(q.id) ? 'flagged' : ''}" aria-label="Question ${i+1}${Number.isInteger(s.answers[q.id]) ? ', answered' : ', unanswered'}${s.flags.has(q.id) ? ', flagged' : ''}" ${i===s.index ? 'aria-current="step"' : ''}>${i+1}</button>`).join('')}</div><p><span id="answered-count">${Object.keys(s.answers).length}</span> of ${s.items.length} answered<br>Green: answered · Underlined: flagged</p><button class="btn wide" data-action="submit-test">Finish & review</button><p class="mt">${s.remote?'Answers save to your account. Reload or resume the same attempt from My dashboard; the timer keeps running.':'Sample session only. Refreshing clears this attempt.'}</p></div></aside></div>`;
}
function timeLeft() {
  const seconds = Math.max(0,Math.ceil((state.session.deadline-Date.now())/1000));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
async function startTest(id,resumeKey) {
  let t;
  try{t=launchGateway.realBackend?(live.getTest(id)||(resumeKey?(await launchGateway.call('catalog')).tests.find(t=>t.id===id):null)):tests.find(t=>t.id===id);}
  catch{announce('Unable to load this test. Reconnect and resume from My dashboard.');return;}
  if (!t || access.snapshot.busy) return;
  const key=resumeKey||crypto.randomUUID();
  const routeAtStart=currentRoute;const pending=access.start(id,key);render();
  const authorization=await pending;
  if(!authorization || currentRoute!==routeAtStart){render();return;}
  if(launchGateway.realBackend){
    const p=authorization.page;
    if(!Array.isArray(p.questions)||!p.questions.length||p.questions.some(q=>'correctOptionId' in q||'explanation' in q))return announce('Invalid protected question response.');
    state.session={remote:true,scoringVersion:p.scoringVersion||1,attemptId:p.attemptId,resumeKey:key,test:{...t,type:'Topic-wise',minutes:(p.durationSeconds??t.duration_seconds)/60},items:p.questions.map(q=>({id:q.id,text:q.text,options:q.options.map(o=>o.text),optionIds:q.options.map(o=>o.id),subject:q.subjectLabel,tags:q.sourceTags})),answers:{},flags:new Set(),index:0,started:Date.now(),deadline:Date.now()+Date.parse(p.deadline)-Date.parse(p.serverNow)};
    state.session.answers=Object.fromEntries(p.questions.filter(q=>p.answers?.[q.id]!==undefined).map(q=>[q.id,q.options.findIndex(o=>o.id===p.answers[q.id])]));
    state.session.flags=new Set(p.flags||[]);
  }else state.session={test:t,items:t.ids.map(id=>questions.find(q=>q.id===id)),answers:{},flags:new Set(),index:0,started:Date.now(),deadline:Date.now()+t.minutes*60000};
  state.session.route=location.hash;
  rememberAttempt();
  render();
  document.querySelector('#question-heading').setAttribute('tabindex','-1');
  document.querySelector('#question-heading').focus({preventScroll:true});
  clearInterval(timer);
  timer=setInterval(()=>{
    if(!state.session) return;
    if(Date.now()>=state.session.deadline){ if(modal.open) modal.close(); finishTest(true); return; }
    const el=document.querySelector('#timer'); if(el) el.textContent=timeLeft();
  },1000);
}
// Only an owner-scoped resume handle is stored; never questions or answer keys.
const resumeStorageKey='examnexa-active-attempt';
function rememberAttempt(){try{const s=state.session;if(s?.remote)sessionStorage.setItem(resumeStorageKey,JSON.stringify({testId:s.test.id,key:s.resumeKey,userId:access.snapshot.user.id,route:s.route}));}catch{}}
function forgetAttempt(){try{sessionStorage.removeItem(resumeStorageKey);}catch{}}
async function restoreAttempt(){
  let saved;try{saved=JSON.parse(sessionStorage.getItem(resumeStorageKey));}catch{}
  if(!saved||saved.userId!==access.snapshot.user?.id||saved.route!==location.hash)return;
  try{await startTest(saved.testId,saved.key);}catch{announce('Unable to resume. Open My dashboard to retry or finalize saved answers.');}
}
let saveQueue=Promise.resolve();
function answerPayload(s){return {attemptId:s.attemptId,answers:Object.fromEntries(Object.entries(s.answers).map(([id,index])=>[id,s.items.find(q=>q.id===id).optionIds[index]])),flags:[...s.flags]};}
function saveCurrent(){const s=state.session;if(!s?.remote)return;const payload=answerPayload(s);saveQueue=saveQueue.catch(()=>{}).then(()=>launchGateway.saveAttempt(payload)).catch(()=>{announce('Answer save failed. Keep this page open and retry submission when online.');});}
function showServerResult(r){
  const items=r.review.map(q=>({id:q.id,text:q.text,options:q.options.map(o=>o.text),answer:q.options.findIndex(o=>o.id===q.correctOptionId),subject:q.topic,explanation:q.explanation,tags:q.tags}));
  const answers=Object.fromEntries(r.review.filter(q=>q.chosenOptionId!==null).map(q=>[q.id,q.options.findIndex(o=>o.id===q.chosenOptionId)]));
  state.result={remote:true,items,answers,score:r.score,scoringVersion:r.scoringVersion||1,positiveMarks:r.positiveMarks??r.correct,negativeMarks:r.negativeMarks??0,title:r.title,testId:r.testId,total:r.total,correct:r.correct,incorrect:r.incorrect,skipped:r.unattempted,attempted:r.total-r.unattempted,percentage:Math.round(r.score/r.total*100),accuracy:r.total-r.unattempted?Math.round(r.correct/(r.total-r.unattempted)*100):0,elapsed:r.elapsedSeconds,date:new Date(r.submittedAt).toLocaleDateString('en-IN')};
  forgetAttempt();state.session=null;clearInterval(timer);live.clear();location.hash='/results';render();
}
async function finishTest(expired=false) {
  const s=state.session;if(!s)return;
  if(s.remote){if(s.finishing)return;s.finishing=true;clearInterval(timer);try{await saveQueue;if(state.session!==s)return;const r=await launchGateway.submitAttempt(answerPayload(s));if(state.session===s)showServerResult(r);}catch{announce('Submission failed. Reconnect and press Finish & review to retry. Saved answers can also be finalized from My dashboard.');s.finishing=false;}return;}
  const result={...gradeTest(s.items,s.answers),items:s.items,answers:{...s.answers},title:s.test.title,testId:s.test.id,elapsed:Math.min(Math.round((Date.now()-s.started)/1000),s.test.minutes*60),expired,date:new Date().toLocaleDateString('en-IN')};
  state.result=result;state.attempts.push(result);state.session=null;clearInterval(timer);location.hash='/results';
}
function resultPage() {
  const r=state.result;
  if(!r) return title('REFLECT. LEARN. GROW.','Your progress starts with practice.','Complete a free sample test to see your score, subject performance and detailed answer review.')+empty('Your first insight is one test away','Results are calculated from your actual sample answers and remain available for this browser session.',link('tests','Take a sample test','btn','arrow'));
  return title('YOUR SESSION RESULTS',escape(r.title),'Every answer is a chance to learn. Here’s how this sample attempt went.')+(r.expired ? notice('Time ran out and your test was automatically submitted.') : '')+`<div class="grid cols-2"><div class="card result-score"><div class="score-ring"><b>${formatScore(r.score??r.correct,r.scoringVersion)}/${r.total}</b><span>Final score</span></div><div><h2>${r.percentage>=70 ? 'A strong step forward.' : 'You’ve found your next focus.'}</h2><p>${r.percentage}% of available marks · ${r.elapsed} seconds<br>+1 per correct answer · ${r.scoringVersion>=2?'−0.25 per incorrect answer':'No negative marks (original attempt policy)'}</p><dl class="score-breakdown"><dt>Correct</dt><dd>${r.correct}</dd><dt>Incorrect</dt><dd>${r.incorrect}</dd><dt>Unanswered</dt><dd>${r.skipped}</dd><dt>Positive marks</dt><dd>${formatScore(r.positiveMarks??r.correct,r.scoringVersion)}</dd><dt>Negative marks deducted</dt><dd>−${formatScore(r.negativeMarks??0,r.scoringVersion)}</dd></dl>${link(`test/${r.testId}`,'Practise again','text-link','arrow')}</div></div><div class="grid cols-2"><div class="card"><span class="stat-value">${r.accuracy}%</span><span class="stat-label">Accuracy across attempted questions</span></div><div class="card"><span class="stat-value">${r.attempted}/${r.total}</span><span class="stat-label">Attempted · ${r.skipped} unattempted · ${r.correct} correct · ${r.incorrect} incorrect</span></div></div></div><section class="section card"><h2>Subject breakdown</h2>${[...new Set(r.items.map(q=>q.subject))].map(subject=>{const items=r.items.filter(q=>q.subject===subject),g=gradeTest(items,r.answers);return `<div class="performance-row"><div><span>${escape(subject)}</span><b>${g.correct} / ${g.total} correct</b></div><progress value="${g.correct}" max="${g.total}" aria-label="${escape(subject)} correct answers"></progress></div>`;}).join('')}</section><section class="section card"><h2>Understand every answer</h2>${r.items.map((q,i)=>`<article class="review-item"><span class="pill ${r.answers[q.id]===q.answer ? '' : 'orange'}">${r.answers[q.id]===q.answer ? 'Correct' : r.answers[q.id]===undefined ? 'Skipped' : 'Incorrect'}</span><h3 class="mt">${i+1}. ${escape(q.text)}</h3><ol class="review-options" type="A">${q.options.map(o=>`<li>${escape(o)}</li>`).join('')}</ol><p>Your answer: <strong>${r.answers[q.id]===undefined ? 'Not answered' : escape(q.options[r.answers[q.id]])}</strong></p><p class="correct">Correct answer: <strong>${escape(q.options[q.answer])}</strong></p><p>${escape(q.explanation)}</p>${q.tags?.length?`<p>Source tags: ${q.tags.map(escape).join(' · ')}</p>`:''}</article>`).join('')}</section>${notice(r.remote?'This result was scored and saved by the server.':'These practice results live only in this open page session. Durable history and server-validated scores will be connected later.')}`;
}
function dashboard() {
  const total=state.attempts.length, avg=total ? Math.round(state.attempts.reduce((a,r)=>a+r.percentage,0)/total) : 0;
  return commerce.socialStrip()+title('YOUR LEARNING SPACE','Make progress, at your own pace.',access.snapshot.status==='authenticated'?'Signed-in account view · Durable saved results require the backend.':'Log in before attempting tests. No student account is connected.')+`<div class="account-banner"><div><strong>Subject subscriptions & saved results</strong><p>Three-month access, purchases and renewals will be linked to your secure account.</p></div>${link('orders','My subjects & orders','btn secondary')}</div><div class="grid cols-4 mt">${[[total,'Sample tests completed','pen'],[`${avg}%`,'Average sample score','chart'],[state.attempts.reduce((a,r)=>a+r.attempted,0),'Questions attempted','target'],[state.syllabus.size,'Topics checked this session','book']].map(([n,l,i])=>`<div class="card stat-card">${icon(i)}<span class="stat-value">${n}</span><span class="stat-label">${l}</span></div>`).join('')}</div><section class="section split"><div class="card"><h2>Your practice history</h2>${total ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Sample test</th><th>Score</th><th>Action</th></tr></thead><tbody>${state.attempts.map((r,i)=>`<tr><td>${r.title}<small>${r.date}</small></td><td>${r.correct}/${r.total}</td><td><button class="btn secondary small" data-result="${i}">Review</button></td></tr>`).join('')}</tbody></table></div>` : empty('Your story is just beginning','Start a short sample test and your session activity will appear here.',link('tests','Find your first test','btn'))}</div><aside class="quote-card"><div class="eyebrow">YOUR NEXT SMALL STEP</div><h2>Give your study time<br>a little direction.</h2><p>Break the preparation outline into topics you can tackle one by one.</p>${link('syllabus','Open your checklist','text-link','arrow')}</aside></section>${notice('Account syncing, saved study plans, purchases and cross-device history are unavailable until authentication and database services are connected.')}`;
}
function pyqs(params) {
  const selected=params.get('exam') || '';
  return title('LOOK BACK. MOVE FORWARD.','Previous year question papers','A dedicated library for verified papers, answer keys and exam-wise practice.')+`<form id="pyq-filter" class="toolbar"><label class="sr-only" for="pyq-exam">Exam</label><select id="pyq-exam"><option value="">All exams</option>${exams.map(e=>`<option value="${e.id}" ${selected===e.id ? 'selected' : ''}>${e.name}</option>`).join('')}</select><label class="sr-only" for="pyq-year">Year</label><select id="pyq-year"><option>All years</option>${[2025,2024,2023,2022].map(y=>`<option>${y}</option>`).join('')}</select><button class="btn" type="submit">Find papers ${icon('search')}</button></form><div id="pyq-results">${empty('Verified papers are on their way','No official previous-year papers have been uploaded. We’ll add source details, exam years and reviewed answer keys with every paper.',link('tests','Try original sample questions','btn secondary'))}</div>${notice('The sample mock questions are original demonstrations, not previous-year questions. No official papers or answer keys are claimed in this preview.')}`;
}
let recoveryMessage='',recoveryBusy=false;
function forgotPassword(){return title('STUDENT ACCOUNT','Forgot password?','We will email a secure link to reset your existing account password.')+`<section class="card auth-mvp"><p role="status">${escape(recoveryMessage)}</p><form id="forgot-password-form"><div class="field"><label for="recovery-email">Account email</label><input id="recovery-email" name="email" type="email" autocomplete="email" required></div><button class="btn wide" ${!launchGateway.realBackend||recoveryBusy?'disabled':''}>Send recovery email</button></form>${!launchGateway.realBackend?notice('Connect Supabase Auth to send recovery emails.'):''}${link('login','Return to login','text-link')}</section>`;}
function auth(register,params){return launch.auth(register,params);}

function pricing(){return commerce.pricing();}

const adminSections=['Overview','Exams','Subjects','Topics','Questions','Tests','Uploads','HTML imports','Pricing','Discounts','Orders','Payments','Access','Students','Support','Reviews','Launch settings','Settings','Analytics'];
const adminConfig={
  Exams:{singular:'exam',fields:[['Name','text'],['Organization','text'],['Publication status','select',['Draft','Published','Hidden']],['Description','textarea']],rows:exams.map(e=>[e.name,e.group,'Illustrative'])},
  Subjects:{singular:'subject',fields:[['Name','text'],['Exam pathway','select',exams.map(e=>e.name)],['Publication status','select',['Draft','Published','Hidden']],['Description','textarea']],rows:subjects.map(s=>[s.name,`${s.topics.length} topics`,'Illustrative'])},
  Topics:{singular:'topic',fields:[['Name','text'],['Subject','select',subjects.map(s=>s.name)],['Publication status','select',['Draft','Published','Hidden']],['Learning notes','textarea']],rows:subjects.flatMap(s=>s.topics.map(t=>[t,s.name,'Illustrative']))},
  Questions:{singular:'question',fields:[['Question','textarea'],['Subject','select',subjects.map(s=>s.name)],['Topic','text'],['PYP / source tags','textarea'],['Option A','text'],['Option B','text'],['Option C','text'],['Option D','text'],['Correct option','select',['A','B','C','D']],['Explanation','textarea']],rows:questions.map(q=>[q.text,q.subject,'Public sample'])},
  Tests:{singular:'test',fields:[['Name','text'],['Format','select',['Topic-wise','Mixed','Full mock']],['Subject','select',subjectPlans.map(p=>p.name)],['Access','select',['Free sample','Paid / Premium']],['Timer override in minutes (optional)','number'],['Publication status','select',['Draft','Published','Hidden']],['Instructions','textarea']],rows:catalog.map(t=>[t.title,t.access==='paid'?`${t.subject} subscription`:`${t.ids.length} sample questions`,t.access==='paid'?'Premium · Locked':'Free sample'])},
  Pricing:{singular:'subject price',fields:[['Subject','select',subjectPlans.map(p=>p.name)],['Current price in INR','number'],['Discount note','textarea']],rows:subjectPlans.map(p=>[p.name,`${money(p.pricePaise)} / 3 months`,'Illustrative'])}
};
function admin(section='overview') {
  const name=adminSections.find(s=>s.toLowerCase().replaceAll(' ','-')===section);
  if(!name)return notFound();
  let body='';
  if(name==='Overview') body=`<div class="grid cols-4">${[[exams.length,'Illustrative exam pathways'],[subjects.length,'Sample subjects'],[questions.length,'Public sample questions'],[tests.length,'Free samples · Login required']].map(([n,l])=>`<div class="card"><span class="stat-value">${n}</span><span class="stat-label">${l}</span></div>`).join('')}</div><div class="card mt"><h2>A workspace for the next stage.</h2><p>Explore the content structure, preview a draft and plan the publishing workflow. Drafts are temporary in-memory demonstrations. No student, financial or production data is connected.</p><div class="grid cols-3">${[['HTML imports','Upload & verify HTML'],['Access','Manage subject access'],['Payments','Review UPI payments']].map(([s,t])=>`<div>${link(`admin/${s.toLowerCase().replaceAll(' ','-')}`,t,'text-link','arrow')}</div>`).join('')}</div></div>`;
  else if(adminConfig[name]) body=adminCollection(name);
  else if(name==='Uploads') body=`<div class="card"><h2>Resource uploads</h2><p>Prepare question imports, syllabus PDFs and verified previous-year papers.</p><div class="form-grid"><div class="field"><label for="upload-type">Resource type</label><select id="upload-type"><option>Question bank (CSV)</option><option>Syllabus document (PDF)</option><option>Previous-year paper (PDF)</option></select></div><div class="field"><label for="upload-file">Choose a file to inspect its metadata</label><input id="upload-file" type="file" accept=".csv"></div></div><div id="upload-preview" role="status"></div><button class="btn" disabled>Upload unavailable</button>${notice('Selecting a file only displays its name, type and size locally. File contents are not read, transmitted or stored. Server-side validation and private storage must be connected before uploads are enabled.')}</div>`;
  else if(name==='Payments') body=commerce.adminPayments();
  else if(name==='Orders') body=commerce.adminOrders();
  else if(name==='HTML imports') body=management.importer();
  else if(name==='Access') body=management.access();
  else if(name==='Discounts') body=management.discounts();
  else if(name==='Launch settings') body=launch.adminSettings();
  else if(name==='Settings') body=launch.adminSettings()+management.settings();
  else if(name==='Support') body=management.support(true);
  else if(name==='Reviews') body=management.reviews();
  else if(name==='Students') body=`<div class="card"><h2>Student directory</h2><p>View authorized student profiles, enrolments and access status after the backend is connected.</p><div class="field"><label for="student-search">Find a student</label><input id="student-search" placeholder="Search unavailable until secure setup" disabled></div>${empty('No student records connected','This public UI preview contains no real student information. Student search, suspension and access changes are unavailable.')}</div>`;
  else body=`<div class="grid cols-3">${['Active students','Revenue','Test completions'].map(l=>`<div class="card"><span class="stat-value">—</span><span class="stat-label">${l} · No data source</span></div>`).join('')}</div><div class="card mt"><h2>Learning & business analytics</h2><div class="field"><label for="analytics-period">Reporting period</label><select id="analytics-period"><option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option></select></div>${empty('Insights need a trusted data source','Engagement, completion trends and payment summaries will appear after authorized reporting endpoints are connected.')}</div>`;
  return title('CONTENT WORKSPACE','Admin panel preview','A public interface demonstration for the future Sahoo ExamNexa management workspace.')+notice('No admin access is granted here. All displayed records are public examples. Real administration requires server-side authorization; draft previews are never published.',true)+`<nav class="chips admin-nav" aria-label="Admin sections">${adminSections.map(s=>link(`admin/${s.toLowerCase().replaceAll(' ','-')}`,s,`chip ${s===name ? 'active' : ''}`)).join('')}</nav>${body}`;
}
function adminCollection(name) {
  const c=adminConfig[name];
  return `<section class="card"><div class="section-head"><div><h2>${name}</h2><p>Public examples and temporary session drafts</p></div><button class="btn small" data-new-draft="${name}">+ Preview ${c.singular} draft</button></div><div class="toolbar"><div class="search-wrap">${icon('search')}<label class="sr-only" for="admin-search">Search ${name.toLowerCase()}</label><input id="admin-search" type="search" data-collection="${name}" placeholder="Search ${name.toLowerCase()}…" value="${escape(state.adminSearch)}"></div></div><div id="admin-table">${adminTable(name)}</div><div id="draft-form"></div></section>`;
}
function adminTable(name) {
  const c=adminConfig[name],rows=[...c.rows,...(state.drafts[name] || []).map(d=>[d[0], 'Session draft','Not published'])].filter(r=>r.join(' ').toLowerCase().includes(state.adminSearch.toLowerCase()));
  return rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>${c.singular}</th><th>Details</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map((x,i)=>`<td>${i===2 ? `<span class="pill neutral">${escape(x)}</span>` : escape(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty('No matching records','Try a different search.');
}
function draftForm(name) {
  const c=adminConfig[name];
  return `<form id="admin-draft" class="admin-form" data-collection="${name}"><h3>Preview a ${c.singular} draft</h3><p>This demonstrates data entry only. Use sample information only; never paste a real premium question bank here. Nothing is saved to a database. Real access and publication changes require authorized server actions.</p>${c.fields.map(([label,type,options],i)=>`<div class="field"><label for="draft-${i}">${label}</label>${type==='textarea' ? `<textarea id="draft-${i}" name="field-${i}" required maxlength="2000"></textarea>` : type==='select' ? `<select id="draft-${i}" name="field-${i}">${options.map(o=>`<option>${o}</option>`).join('')}</select>` : `<input id="draft-${i}" name="field-${i}" type="${type}" ${label.startsWith('Timer override')?'placeholder="Default: questions ÷ 4 minutes"':'required'} ${type==='number' ? `min="${label.startsWith('Timer override')?0.25:name==='Pricing'?0.01:0}" max="100000" step="${label.startsWith('Timer override')?0.25:name==='Pricing'?0.01:1}"` : 'maxlength="180"'}>`}</div>`).join('')}<button type="submit" class="btn">Preview draft</button> <button type="button" class="btn secondary" data-action="cancel-draft">Cancel</button><div class="form-message" id="draft-message" role="status"></div></form>`;
}
function info(page) {
  const content={
    about:['A clearer path to your ambition.','Sahoo ExamNexa is a preparation platform for Odisha competitive-exam aspirants. Our approach is simple: organize the learning journey, practise intentionally and reflect on every attempt.','This local frontend includes public sample exercises and the structure for future learning services. Official exam resources and account features are still to be connected.'],
    privacy:['Your information, treated thoughtfully.','This frontend does not create accounts, collect payments, send form data or use analytics trackers. Sample answers, checklist ticks and draft previews are kept only in page memory and disappear on refresh.','Login fields are disabled. Local file selection displays metadata only. A production privacy policy, retention rules and account controls must be established before any backend service is enabled.'],
    help:['A little guidance for your next step.','Start with Explore exams, use the sample syllabus checklist, or try a free mock test. After submitting a sample test, open Results & insights for explanations and My dashboard for your session history.','For now, refreshing the page clears sample progress. Accounts, official PYQs, uploads and paid plans are not available. A verified support contact will be added before launch.']
  }[page];
  return `<div class="about-copy">${title('SAHOO EXAMNEXA',content[0],content[1])}<div class="card"><p>${content[2]}</p>${link('exams','Explore the platform','text-link','arrow')}</div></div>`;
}
function notFound(){return title('PAGE NOT FOUND','Let’s get you back on track.','This page or resource is not available.')+link('home','Back to overview','btn','arrow');}
function offlineNotice(){return '<div class="offline-banner" role="status">You’re offline. New attempts require an online eligibility check. Offline reloading is not enabled yet.</div>';}
function render() {
  clearInterval(verificationCountdown);
  const raw=siteRoute(location,document.baseURI);
  const [path,query]=raw.split('?');const [page,id]=path.split('/');const params=new URLSearchParams(query || '');
  const pages={'forgot-password':forgotPassword,'verify-email':()=>launch.verifyEmail(params),home,exams:examList,exam:()=>examDetail(id),subjects:()=>subjectPage(params),subject:()=>commerce.subjectDetail(id,params)||notFound(),purchase:()=>commerce.purchase(id,params)||notFound(),orders:()=>commerce.orders()+launch.stateGuide(),account:()=>launch.account(),support:()=>management.support(),topic:()=>topicPage(id,params),syllabus:()=>syllabus(params),tests:()=>testList(params),test:()=>testPage(id,params),results:resultPage,dashboard,pyqs:()=>pyqs(params),login:()=>auth(false,params),register:()=>auth(true,params),pricing,admin:()=>admin(id),about:()=>info('about'),privacy:()=>info('privacy'),help:()=>info('help')};
  const connectedView=state.session&&page==='test'?testRunner():state.result&&page==='results'?resultPage():live.view(page,id,params);
  let content=connectedView??(pages[page] ? pages[page]() : notFound());
  if(['exams','exam','topic','tests','dashboard'].includes(page)&&!content.includes('youtube-promotion'))content=launch.youtubePromotion()+content;
  if(page==='home'&&launchGateway.realBackend)content=content.replace('<div class="grid cols-3">',launch.youtubePromotion()+'<div class="grid cols-3">');
  app.innerHTML=shell(content,page);
  app.dataset.authStatus=access.snapshot.status;
  document.querySelector('.sidebar').inert=window.innerWidth<=700;
  document.title=`${({home:'Your next chapter starts here',exams:'Explore exams',test:'Sample test',admin:'Private Admin',pyqs:'Previous year papers'}[page] || page.charAt(0).toUpperCase()+page.slice(1))} | Sahoo ExamNexa`;
  const h1=document.querySelector('main h1');
  if(h1)document.title=h1.textContent.trim()+' | Sahoo ExamNexa';
  document.querySelector('meta[name="description"]').content=(document.querySelector('.page-title p')?.textContent || 'Sahoo ExamNexa: Odisha topic-wise mock tests, free samples and three-month subject subscriptions.').slice(0,180);
  if(page==='home'){
    document.title=homeTitle;
    document.querySelector('meta[name="description"]').content=homeDescription;
  }
  const robots=document.querySelector('meta[name="robots"]');
  if(robots)robots.content=robots.dataset.publicHome==='true'&&indexableHome(location,document.baseURI)?'index, follow':'noindex, nofollow';
  const changed=currentRoute!==raw;currentRoute=raw;
  if(changed){window.scrollTo(0,0);document.querySelector('#main').focus({preventScroll:true});}
  if(page==='verify-email')verificationCountdown=setInterval(updateVerificationCountdown,1000);
}
function updateVerificationCountdown(){
  const button=document.querySelector('[data-resend-code]');if(!button)return;
  const s=access.snapshot,remaining=s.verification?.resendSeconds||0;
  button.disabled=!launchGateway.connected||s.busy||remaining>0;
  button.textContent=remaining>0?`Resend code in ${remaining}s`:'Resend code';
  const status=document.querySelector('[data-resend-status]');if(status)status.textContent=remaining>0?'Please wait before requesting another email.':'Did not receive an email? Check spam or request another confirmation.';
}
function focusAuthError(){document.querySelector('#auth-form [aria-invalid="true"],#email-verification-form [aria-invalid="true"]')?.focus();}
function announce(message){document.querySelector('#announcer').textContent=message;}
function showModal(heading,body,buttons) {
  modalOpener=document.activeElement;
  modal.innerHTML=`<h2 id="modal-title">${heading}</h2>${body}<div class="dialog-actions">${buttons}</div>`;
  modal.showModal();
}
modal.addEventListener('close',()=>modalOpener?.isConnected && modalOpener.focus());
function exitTest(next) {
  showModal('Leave this test?',state.session?.remote?'<p>Saved answers and the timer remain on your account. Resume from My dashboard before the deadline.</p>':'<p>Your current sample attempt will be discarded.</p>',`<button class="btn secondary" data-action="close-modal">Keep practising</button><button class="btn" id="confirm-exit">Leave test</button>`);
  document.querySelector('#confirm-exit').onclick=()=>{forgetAttempt();state.session=null;clearInterval(timer);modal.close();location.hash=next;render();};
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('button,a');if(!el)return;
  if(el.matches('.skip-link')){e.preventDefault();document.querySelector('#main').focus();document.querySelector('#main').scrollIntoView();return;}
  if(el.matches('.menu-button')){const open=!document.querySelector('.sidebar').classList.contains('open');document.querySelector('.sidebar').classList.toggle('open',open);document.querySelector('.sidebar').inert=!open;document.querySelector('.mobile-shade').classList.toggle('open',open);el.setAttribute('aria-expanded',String(open));if(open)document.querySelector('.sidebar a').focus();return;}
  if(el.matches('.mobile-shade')){closeMenu();return;}
  if(el.hasAttribute('data-resend-code')){e.preventDefault();if(access.snapshot.busy)return;const form=el.closest('form'),email=new FormData(form).get('email');const pending=access.resendCode(email);render();await pending;render();focusAuthError();announce(access.snapshot.message);return;}
  if(el.tagName==='A' && el.getAttribute('href')?.startsWith('#/') && state.session && el.hash!==state.session.route){e.preventDefault();exitTest(el.hash);return;}
  if(el.dataset.orderTab){document.querySelectorAll('[data-order-tab]').forEach(b=>{const active=b===el;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});document.querySelector('#purchase-tab-content').innerHTML=commerce.orderTab(el.dataset.orderTab);return;}
  if(el.dataset.importAction==='load'){management.loadDemo();return;}
  if(el.dataset.importEdit!==undefined){management.editDemo(el.dataset.importEdit);return;}
  if(el.hasAttribute('data-logout')){forgetAttempt();state.session=null;state.result=null;state.attempts=[];live.clear();clearInterval(timer);const pending=access.logout();render();await pending;location.hash='/account';render();return;}
  if(el.dataset.verifyFree){await startTest(el.dataset.verifyFree);return;}
  if(el.dataset.socialLink){if(el.dataset.socialLink!=='telegram')return;try{const result=await launchGateway.beginSocialLink('telegram');const url=new URL(result.authorizationUrl);if(url.protocol!=='https:'||url.hostname!=='t.me'||url.username||url.password)throw new Error();showModal('Connect your Telegram account',`<p>Open the bot and press Start, then return here and verify access. This private link expires in ten minutes.</p><a class="btn" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Open Telegram bot</a>`,`<button class="btn secondary" data-action="close-modal">Return to test</button>`);}catch{announce('Telegram account linking requires configured backend secrets.');}return;}
  if(el.dataset.resumeTest){history.replaceState(null,'','#/test/'+encodeURIComponent(el.dataset.resumeTest));render();await startTest(el.dataset.resumeTest,el.dataset.resumeKey);return;}
  if(el.dataset.start){await startTest(el.dataset.start);return;}
  if(el.dataset.question!==undefined && state.session){const n=Number(el.dataset.question);if(n>=0 && n<state.session.items.length){state.session.index=n;render();document.querySelector('#question-heading').setAttribute('tabindex','-1');document.querySelector('#question-heading').focus();}return;}
  if(el.dataset.testFilter){state.testFilter=el.dataset.testFilter;render();document.querySelector(`[data-test-filter="${state.testFilter}"]`).focus();return;}
  if(el.dataset.result!==undefined){state.result=state.attempts[Number(el.dataset.result)];location.hash='/results';return;}
  if(el.dataset.newDraft){document.querySelector('#draft-form').innerHTML=draftForm(el.dataset.newDraft);document.querySelector('#draft-0').focus();return;}
  switch(el.dataset.action){
    case 'close-modal':modal.close();break;
    case 'exit-test':exitTest('#/tests');break;
    case 'clear-answer':if(state.session){delete state.session.answers[state.session.items[state.session.index].id];saveCurrent();render();document.querySelector('[data-action="clear-answer"]').focus();}break;
    case 'flag-answer':if(state.session){const s=state.session,q=s.items[s.index];s.flags.has(q.id) ? s.flags.delete(q.id) : s.flags.add(q.id);saveCurrent();render();document.querySelector('[data-action="flag-answer"]').focus();}break;
    case 'submit-test':{const s=state.session;if(!s)break;showModal('Ready to finish?',`<p>You have answered <strong>${Object.keys(s.answers).length} of ${s.items.length}</strong> questions. ${s.flags.size} flagged for review. Unanswered questions receive zero marks.</p>`,`<button class="btn secondary" data-action="close-modal">Keep practising</button><button class="btn" data-action="confirm-submit">Submit sample</button>`);break;}
    case 'confirm-submit':modal.close();finishTest();break;
    case 'cancel-draft':document.querySelector('#draft-form').innerHTML='';document.querySelector('[data-new-draft]').focus();break;
  }
});
function closeMenu(){document.querySelector('.sidebar')?.classList.remove('open');document.querySelector('.sidebar').inert=window.innerWidth<=700;document.querySelector('.mobile-shade')?.classList.remove('open');const b=document.querySelector('.menu-button');b?.setAttribute('aria-expanded','false');b?.focus();}
document.addEventListener('keydown',e=>{
  const sidebar=document.querySelector('.sidebar.open');
  if(e.key==='Escape' && sidebar)closeMenu();
  if(e.key==='Tab' && sidebar){const links=[...sidebar.querySelectorAll('a')];if(e.shiftKey && document.activeElement===links[0]){e.preventDefault();links.at(-1).focus();}else if(!e.shiftKey && document.activeElement===links.at(-1)){e.preventDefault();links[0].focus();}}
});
document.addEventListener('input',e=>{
  if(e.target.id==='exam-search'){state.examSearch=e.target.value;document.querySelector('#exam-results').innerHTML=filteredExams();announce(`${document.querySelectorAll('#exam-results article').length} exams found`);}
  if(e.target.id==='test-search'){state.testSearch=e.target.value;document.querySelector('#test-results').innerHTML=filteredTests();announce(`${document.querySelectorAll('#test-results article').length} tests found`);}
  if(e.target.id==='admin-search'){state.adminSearch=e.target.value;document.querySelector('#admin-table').innerHTML=adminTable(e.target.dataset.collection);}
});
document.addEventListener('change',e=>{
  if(e.target.id==='test-access'){state.accessFilter=e.target.value;history.replaceState(null,'', '#/tests');document.querySelector('#test-results').innerHTML=filteredTests();announce('Test access filter updated.');}
  if(e.target.id==='import-review-question'){management.editDemo(e.target.value);}
  if(e.target.id==='import-subject'){document.querySelector('#import-topic').innerHTML=getPlan(e.target.value).topics.map(t=>'<option>'+escape(t)+'</option>').join('');}
  if(e.target.id==='import-timer'){const n=Number(e.target.value);document.querySelector('#import-duration').textContent=e.target.value===''?'Default: total questions ÷ 4 minutes':n>0?'Timer override: '+n+' minutes':'Enter a positive timer override.';}

  if(e.target.id==='exam-group'){state.examFilter=e.target.value;document.querySelector('#exam-results').innerHTML=filteredExams();announce(`${document.querySelectorAll('#exam-results article').length} exams found`);}
  if(e.target.name==='answer' && state.session){const s=state.session;s.answers[s.items[s.index].id]=Number(e.target.value);saveCurrent();document.querySelector('#answered-count').textContent=Object.keys(s.answers).length;document.querySelector(`.question-grid [data-question="${s.index}"]`).classList.add('answered');document.querySelector(`.question-grid [data-question="${s.index}"]`).setAttribute('aria-label',`Question ${s.index+1}, answered${s.flags.has(s.items[s.index].id) ? ', flagged' : ''}`);}
  if(e.target.dataset.check){e.target.checked ? state.syllabus.add(e.target.dataset.check) : state.syllabus.delete(e.target.dataset.check);document.querySelector('#syllabus-count').textContent=`${state.syllabus.size} / ${subjects.reduce((n,s)=>n+s.topics.length,0)} topics`;document.querySelector('#syllabus-progress').value=state.syllabus.size;}
  if(e.target.id==='upload-type'){const f=document.querySelector('#upload-file');f.value='';f.accept=e.target.value.includes('CSV') ? '.csv' : '.pdf';document.querySelector('#upload-preview').textContent='';}
  if(e.target.id==='upload-file'){const f=e.target.files[0];const expected=document.querySelector('#upload-type').value.includes('CSV') ? '.csv' : '.pdf';document.querySelector('#upload-preview').textContent=f ? (f.size>10*1024*1024 ? 'Preview limit: 10 MB. Choose a smaller file.' : !f.name.toLowerCase().endsWith(expected) ? `Please select a ${expected} file for this resource type.` : `${f.name} · ${(f.size/1024).toFixed(1)} KB · Metadata preview only; not uploaded.`) : '';}
});
document.addEventListener('submit',async e=>{
  if(e.target.id==='forgot-password-form'){e.preventDefault();if(recoveryBusy)return;const email=new FormData(e.target).get('email').trim();recoveryBusy=true;recoveryMessage='';render();try{await launchGateway.requestPasswordReset(email);recoveryMessage='If this account is eligible, a recovery email has been sent. Check your inbox and spam folder; open only the newest link.';}catch{recoveryMessage='Recovery email could not be sent. Please wait before retrying or contact support.';}finally{recoveryBusy=false;render();}return;}
  if(e.target.id==='auth-form'){e.preventDefault();if(access.snapshot.busy)return;const form=e.target,values=Object.fromEntries(new FormData(form)),mode=form.dataset.mode,next=launch.destination(new URLSearchParams({next:form.dataset.next}));form.reset();live.clear();const pending=access.authenticate(mode,values);render();await pending;if(access.snapshot.status==='authenticated')location.hash='/'+next;else if(access.snapshot.verification&&!Object.keys(access.snapshot.fieldErrors||{}).length)location.hash='/verify-email?next='+encodeURIComponent(next);render();focusAuthError();announce(access.snapshot.message);return;}
  if(e.target.id==='email-verification-form'){e.preventDefault();if(access.snapshot.busy)return;const form=e.target,values=Object.fromEntries(new FormData(form)),next=launch.destination(new URLSearchParams({next:form.dataset.next}));form.reset();const pending=access.verifyEmail(values);render();await pending;if(access.snapshot.status==='authenticated')location.hash='/'+next;render();focusAuthError();announce(access.snapshot.message);return;}
  if(e.target.id==='import-edit-form'){e.preventDefault();management.saveDemo(e.target);announce('Demo edit applied. Structural verification repeated; content review remains pending.');return;}

  if(e.target.id==='admin-draft'){e.preventDefault();const name=e.target.dataset.collection;const values=[...new FormData(e.target).values()].map(v=>v.trim());if(values.some((v,i)=>!v && !adminConfig[name].fields[i][0].startsWith('Timer override'))){document.querySelector('#draft-message').textContent='Enter a non-empty value in every field.';return;}if(name==='Pricing'){const error=validateTestPrice('Paid / Premium',values[1]);if(error){document.querySelector('#draft-message').textContent=error;return;}}state.drafts[name] ||= [];state.drafts[name].push(values);document.querySelector('#admin-table').innerHTML=adminTable(name);document.querySelector('#draft-message').textContent='Draft preview added for this session. Nothing was published or saved to a database.';e.target.reset();}
  if(e.target.id==='pyq-filter'){e.preventDefault();const id=document.querySelector('#pyq-exam').value,year=document.querySelector('#pyq-year').value;const eName=exams.find(x=>x.id===id)?.name || 'all exams';document.querySelector('#pyq-results').innerHTML=empty('No verified papers available',`No papers are available for ${eName} · ${year}. Try the original sample mocks while the library is prepared.`,link('tests','Explore sample tests','btn secondary'));announce('No verified papers available for these filters.');}
});
window.addEventListener('hashchange',()=>{
  if(state.session && location.hash!==state.session.route){const next=location.hash;history.replaceState(null,'',state.session.route);render();exitTest(next);return;}
  state.adminSearch='';render();
});
window.addEventListener('resize',()=>{
  const sidebar=document.querySelector('.sidebar');if(!sidebar)return;
  const mobile=window.innerWidth<=700;
  if(!mobile){
    sidebar.classList.remove('open');
    document.querySelector('.mobile-shade')?.classList.remove('open');
    document.querySelector('.menu-button')?.setAttribute('aria-expanded','false');
  }
  sidebar.inert=mobile && !sidebar.classList.contains('open');
});
window.addEventListener('beforeunload',e=>{if(state.session){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{document.querySelector('#connection-status').innerHTML='';});
window.addEventListener('offline',()=>{document.querySelector('#connection-status').innerHTML=offlineNotice();});
render();
access.restore().then(async()=>{render();await restoreAttempt();});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState!=='visible')return;await access.restore();if(access.snapshot.status!=='authenticated'){state.session=null;state.result=null;state.attempts=[];live.clear();clearInterval(timer);}render();});
