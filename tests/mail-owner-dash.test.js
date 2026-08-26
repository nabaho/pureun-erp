/* 담당자 대시보드 — 같은 메일을 «사람»으로도 본다 (대표 지시 2026-08-26)
   "푸른분류는 대시보드 두개로 나누어서 담당자, 업무별 로 나눠서 보게" (「안 1 걸러 보기」)
   "이메일정보 입력함도"

   ★ 여기서 지키는 것은 «모양»이 아니라 이 다섯이다.
     1. 담당자 칸은 «자리»가 아니라 «거르개»다 — 업무 칸 통수가 줄지 않는다
     2. 사람이 정해 준 것이 기계보다 «늘 먼저»다 — 기계가 사람을 덮으면 고칠 길이 없다
     3. 공용 도메인(naver 등)은 도메인으로 잇지 않는다 — 온 세상이 한 사람 것이 된다
     4. 이어도 다음메일에는 아무것도 쓰지 않는다
     5. 「담당 모름」을 줄일 길이 «목록 안»에 있다 — 딴 화면에 있으면 아무도 안 한다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

const FOLDERS = {
  B_INBOX: { path:'INBOX', name:'INBOX', kind:'inbox', order:1, total:1, unseen:0 },
  B_JAMUN: { path:'1.자문사답변', name:'1.자문사답변', kind:'custom', order:7, total:4, unseen:1 },
  B_PAY:   { path:'2.급여', name:'2.급여', kind:'custom', order:7, total:1, unseen:0 },
  B_AD:    { path:'기타광고', name:'기타광고', kind:'custom', order:7, total:1, unseen:1 }
};
const M = (u,e,s,r) => ({ u:u, f:'보낸이', e:e, t:'370-6@daum.net', s:s, d:1756000000+u, r:r, g:0, a:0, z:1 });
const MSGS = {
  B_INBOX: { '1': M(1,'noreply@x.com','받은 것',1) },
  B_JAMUN: {
    '10': M(10,'a@hanbit.co.kr','한빛 문의',1),      /* 명함 → 박한별 */
    '11': M(11,'b@hanbit.co.kr','한빛 추가 문의',0), /* 도메인 → 박한별 */
    '12': M(12,'kim@naver.com','개인 주소에서',1),   /* 아무 데도 없다 */
    '13': M(13,'c@daehan.kr','대한 문의',1)          /* 명함 → 김혜민 */
  },
  B_PAY: { '20': M(20,'a@hanbit.co.kr','급여 자료',1) },
  B_AD:  { '30': M(30,'ad@spam.kr','광고',0) }
};
/* 기업정보함(items) — 주소와 회사가 든 명함 */
const ITEMS = {
  i1: { id:'i1', email:'a@hanbit.co.kr', company:'한빛물산' },
  i2: { id:'i2', email:'c@daehan.kr',    company:'대한산업' }
};
/* ErpMatch 자리 — 회사 → 담당 노무사 */
const BYNAME = {
  '한빛물산': { company:'한빛물산', main:'박한별', subs:[] },
  '대한산업': { company:'대한산업', main:'김혜민', subs:[] }
};

function load(over){
  const o = over || {};
  const held = { wrote:{}, fetched:0, toasts:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'who', items: ITEMS
  }, o.state || {});
  const dbRef = (p) => ({
    once: () => Promise.resolve({ val: () => null }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    update: (v) => { held.wrote[p] = Object.assign(held.wrote[p]||{}, v); return Promise.resolve(); },
    remove: () => { held.wrote[p] = null; return Promise.resolve(); }
  });
  const dummy = { set innerHTML(v){ dummy._h = v; }, get innerHTML(){ return dummy._h||''; },
    style:{}, offsetHeight:120, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0 };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' },
    matMailCfg: () => ({ from:'370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {},
    schedList: () => [], staffName: b => String(b||''),
    fmtDate: () => '2026.08.26', fmtMB: n => n + 'B',
    allItems: () => ITEMS, allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast: m => held.toasts.push(String(m)), confirm: () => true, prompt: () => null,
    closeFolderMenu(){}, DB_ROOT:'pucards',
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: (sel,id) => !!(sel && sel[id]),
    pickList: (sel,ids) => (ids||[]).filter(i => !!(sel && sel[i])),
    pickAllOn: (sel,ids) => !!(ids&&ids.length) && ids.every(i => !!(sel&&sel[i])),
    pickClear: k => { state.pick[k] = {}; },
    pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    renderPCSide(){}, renderMailPage(){}, render(){},
    document: { getElementById: () => null, addEventListener(){}, removeEventListener(){} },
    $: () => dummy,
    window: { innerWidth:1600, innerHeight:900 },
    /* ★ 다음메일에 손대는 유일한 길 — 여기가 울리면 원본이 바뀐 것이다 */
    fetch: () => { held.fetched++; return Promise.resolve({ json:()=>Promise.resolve({ok:true}) }); },
    firebase: {
      auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('T') } }),
      database: () => ({ ref: (p) => dbRef(p) })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(o.folders || FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(o.msgs || MSGS) + ';' +
    '_mbBins = {}; _mbPut = {};' +
    '_mbHide = ' + JSON.stringify(o.hide || {}) + ';' +
    '_mbOwner = ' + JSON.stringify(o.owner || {}) + ';' +
    '_mbOrder = {};' +
    '_mbMeta = { at: 1, ok: true };', ctx);
  /* ⚠ 덩어리 안의 const 는 밖에서 못 만진다(lexical) — 안에서 꺼내 온다 */
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {};
  Object.keys(BYNAME).forEach(n => { byName[EM._norm(n)] = BYNAME[n]; });
  EM.byName = byName; EM.byBiz = {}; EM.ready = true;
  EM.companies = Object.keys(BYNAME).map(n => ({ name:n, managerMain:BYNAME[n].main }));
  ctx.ErpMatch = EM;
  ctx._held = held;
  ctx.__owner = () => vm.runInContext('JSON.stringify(_mbOwner)', ctx);
  return ctx;
}
const boxN = (c, id) => { c.state.mbBox = id; return c.mbAllRows().length; };
/* ⚠ 배열로 견주지 않는다 — 덩어리 안에서 만든 배열은 바깥과 «다른 종류»다(vm 의 결) */
const subjects = (c, id) => { c.state.mbBox = id; return c.mbAllRows().map(v=>v.s).sort().join(' | '); };

/* ══════ 하나 — 담당자 칸은 «거르개»다 ══════ */

test('★ 담당자로 갈라도 업무 칸 통수는 줄지 않는다 — 이것이 「안 1」의 요점', () => {
  const c = load();
  const before = boxN(c, '~B_JAMUN');
  assert.ok(boxN(c, '@박한별') > 0, '담당자 칸이 비어 있다');
  assert.equal(boxN(c, '~B_JAMUN'), before, '담당자 칸을 본 뒤 업무 칸이 줄었다');
  assert.ok(subjects(c, '~B_JAMUN').indexOf('한빛 문의') >= 0, '메일이 업무 칸에서 빠졌다');
});

test('★ 한 통을 두 눈으로 본다 — 주제로도, 사람으로도', () => {
  const c = load();
  assert.ok(subjects(c, '@박한별').indexOf('한빛 문의') >= 0, '사람 칸에 없다');
  assert.ok(subjects(c, '~B_JAMUN').indexOf('한빛 문의') >= 0, '주제 칸에 없다');
});

test('★ 담당자 칸은 «여러 업무 칸을 가로지른다» — 한 폴더만 보면 늘 0통이 된다', () => {
  const c = load();
  const s = subjects(c, '@박한별');
  assert.ok(s.indexOf('한빛 문의') >= 0 && s.indexOf('급여 자료') >= 0,
    '다른 업무 칸에 있는 그 사람 메일이 안 보인다');
});

/* ══════ 둘 — 누가 담당인지 어떻게 아나 ══════ */

test('★ 기업정보함 주소로 담당자를 짚는다', () => {
  const c = load();
  assert.equal(c.mbWhoOfRow({ e:'a@hanbit.co.kr' }), '박한별');
  assert.equal(c.mbWhoOfRow({ e:'c@daehan.kr' }), '김혜민');
});

test('★ 회사 도메인으로도 짚는다 — 사람이 바뀌어도 회사는 그대로다', () => {
  const c = load();
  assert.equal(c.mbWhoOfRow({ e:'b@hanbit.co.kr' }), '박한별', '같은 회사 다른 사람을 못 짚었다');
});

test('★ 공용 도메인은 «절대» 도메인으로 잇지 않는다 — naver 를 주면 온 세상이 한 사람 것이 된다', () => {
  const items = Object.assign({}, ITEMS, { i9:{ id:'i9', email:'boss@naver.com', company:'한빛물산' } });
  const c = load({ state:{ items } });
  assert.equal(c.mbWhoOfRow({ e:'boss@naver.com' }), '박한별', '적어 둔 그 주소는 짚어야 한다');
  assert.equal(c.mbWhoOfRow({ e:'someone-else@naver.com' }), '', 'naver 를 통째로 한 사람에게 줬다');
});

test('★ 사람이 정해 준 것이 «늘 먼저»다 — 기계가 사람을 덮으면 고칠 길이 없다', () => {
  const c = load({ owner: { 'a@hanbit,co,kr': '김혜민' } });
  assert.equal(c.mbWhoOfRow({ e:'a@hanbit.co.kr' }), '김혜민', '기계가 사람의 판단을 덮었다');
});

test('★ 열쇠 규칙이 포털과 같다 — 점을 그대로 쓰면 서버가 400 으로 거절한다', () => {
  const c = load();
  assert.equal(c.mbWhoKey('A.b@Han.co.kr'), 'a,b@han,co,kr');
  assert.ok(c.mbWhoKey('x@y.kr').indexOf('.') < 0, '점이 남아 있다');
  ['#','$','[',']','/'].forEach(ch =>
    assert.ok(c.mbWhoKey('a'+ch+'b@c.kr').indexOf(ch) < 0, ch + ' 이 남아 있다'));
});

test('짚지 못하면 「담당 모름」으로 간다 — 조용히 아무 데나 넣지 않는다', () => {
  const c = load();
  assert.equal(c.mbWhoOfRow({ e:'kim@naver.com' }), '');
  assert.ok(subjects(c, '@?').indexOf('개인 주소에서') >= 0, '담당 모름에 없다');
});

/* ══════ 셋 — 울타리 ══════ */

test('★ 담당자 칸은 «업무 칸에 든 것»만 본다 — 받은메일함까지 넣으면 담당 모름이 광고로 찬다', () => {
  const c = load();
  assert.ok(subjects(c, '@?').indexOf('받은 것') < 0, '받은메일함 메일이 담당 모름에 들어왔다');
});

test('★ 숨긴 칸은 담당자 대시보드에도 안 나온다 — 치운 것이 딴 데서 되살아나면 안 된다', () => {
  const a = load();
  const b = load({ hide: { B_AD: true } });
  assert.ok(a.mbWhoNoneCount().n > b.mbWhoNoneCount().n, '숨긴 칸의 광고가 담당 모름에 남았다');
  assert.ok(subjects(b, '@?').indexOf('광고') < 0, '숨긴 칸의 메일이 담당 모름에 있다');
});

/* ══════ 넷 — 이어도 다음메일은 그대로 ══════ */

test('★ 담당자를 이어도 다음메일 서버를 부르지 않는다', () => {
  const c = load();
  c.mbWhoSet('kim@naver.com', '박재원', false);
  assert.equal(c._held.fetched, 0, '다음메일 서버를 불렀다');
  Object.keys(c._held.wrote).forEach(p => assert.ok(p.indexOf('mailbox') < 0,
    '다음메일 자리에 적으려 했다: ' + p));
  assert.match(c.__owner(), /박재원/, '이은 것이 안 적혔다');
  assert.equal(c.mbWhoOfRow({ e:'kim@naver.com' }), '박재원', '이었는데 안 잡힌다');
});

test('★ 이어도 업무 칸 통수는 그대로 — 담당자 칸만 는다', () => {
  const c = load();
  const before = boxN(c, '~B_JAMUN');
  const naBefore = c.mbWhoNoneCount().n;
  c.mbWhoSet('kim@naver.com', '박재원', false);
  assert.equal(boxN(c, '~B_JAMUN'), before, '업무 칸이 줄었다');
  assert.equal(c.mbWhoNoneCount().n, naBefore - 1, '담당 모름이 안 줄었다');
});

test('정한 것을 지우면 다시 기계가 짚는다 — 되돌릴 길이 있어야 한다', () => {
  const c = load({ owner: { 'a@hanbit,co,kr': '김혜민' } });
  assert.equal(c.mbWhoOfRow({ e:'a@hanbit.co.kr' }), '김혜민');
  c.mbWhoSet('a@hanbit.co.kr', '', false);
  assert.equal(c.mbWhoOfRow({ e:'a@hanbit.co.kr' }), '박한별', '기계 판단으로 안 돌아갔다');
});

/* ══════ 다섯 — 화면 ══════ */

test('★ 옆줄에 대시보드 둘을 바꿔 끼우는 칩이 있다', () => {
  const c = load({ state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf("mbSetDash('who')") > 0, '담당자 칩이 없다');
  assert.ok(h.indexOf("mbSetDash('topic')") > 0, '업무별 칩이 없다');
});

test('★ 담당자 대시보드에 「담당 모름」과 「이메일 잇기」로 가는 길이 있다', () => {
  const c = load({ state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('담당 모름') > 0, '담당 모름 칸이 없다');
  assert.ok(h.indexOf('openWhoPage()') > 0, '이메일 잇는 화면으로 갈 길이 없다');
});

test('업무별 대시보드에서는 업무 칸이 나온다 — 칩이 실제로 갈라야 한다', () => {
  const c = load({ state:{ mbDash:'topic' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('1.자문사답변') > 0, '업무 칸이 안 나온다');
  assert.ok(h.indexOf("openMailBox('@") < 0, '업무별인데 담당자 칸이 섞여 있다');
});

test('★ 「담당 모름」을 줄일 길이 «목록 안»에 있다 — 딴 화면에 있으면 아무도 안 한다', () => {
  const c = load({ state:{ mbDash:'who', mbBox:'@?' } });
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('mbWhoAsk(') > 0, '줄에서 담당자를 정할 길이 없다');
});

test('★ 담당자 칸에서는 «어느 업무 칸의 메일인가»를 적어 준다 — 안 적으면 이름만 남는다', () => {
  const c = load({ state:{ mbDash:'who', mbBox:'@박한별' } });
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('1.자문사답변') > 0, '어느 업무 칸인지 안 나온다');
});

test('★ 업무 칸에서는 «누구 담당인가»를 적어 준다', () => {
  const c = load({ state:{ mbDash:'topic', mbBox:'~B_JAMUN' } });
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('박한별') > 0, '담당자가 안 나온다');
  assert.ok(h.indexOf('mbWhoAsk(') > 0, '모르는 것을 정할 길이 없다');
});

/* ══════ 여섯 — 자문사 이메일 잇기 화면 ══════ */

test('★ 「많이 온 주소부터」 늘어놓는다 — 21통짜리 하나가 363줄보다 크다', () => {
  const c = load();
  const list = c.whoUnknownSenders();
  assert.ok(list.length, '못 잡은 보낸이가 안 모인다');
  for(let i = 1; i < list.length; i++)
    assert.ok(list[i-1].n >= list[i].n, '많이 온 순이 아니다');
  assert.ok(list.every(o => o.e), '주소가 빈 줄이 있다');
});

test('★ 잇기 화면에 두 갈래가 다 있다 — 주소부터 · 자문사부터', () => {
  const c = load({ state:{ mailSent:'who', whoTab:'addr' } });
  const a = c.whoPageHtml();
  assert.ok(a.indexOf('mbWhoAsk(') > 0, '주소에서 담당자를 정할 길이 없다');
  assert.ok(a.indexOf("whoTab('co')") > 0, '자문사 갈래로 갈 길이 없다');
  c.state.whoTab = 'co';
  const b = c.whoPageHtml();
  assert.ok(b.indexOf('whoAddPrompt(') > 0, '자문사에 주소를 이을 길이 없다');
  assert.ok(b.indexOf('한빛물산') > 0, '자문사 목록이 안 나온다');
});

test('★ 이은 것은 우리 앱에만 남는다고 화면이 말해 준다 — 안 적으면 다음메일도 바뀌는 줄 안다', () => {
  const c = load({ state:{ mailSent:'who', whoTab:'addr' } });
  assert.match(c.whoPageHtml(), /우리 앱에만/, '어디까지 바뀌는지 안 적혀 있다');
});

test('잇기 화면에서 메일함으로 돌아갈 길이 있다 — 없으면 갇힌다', () => {
  const c = load({ state:{ mailSent:'who', whoTab:'addr' } });
  assert.ok(c.whoPageHtml().indexOf('openMailBox(') > 0, '돌아갈 길이 없다');
});
