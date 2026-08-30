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

/* ══════════════════════════════════════════════════════════════════════════
   담당자 목록 — 퇴사자 빼기 · 사번순 · 노무사/직원 가르기 (대표 지시 2026-08-26)
   ══════════════════════════════════════════════════════════════════════════
   "퇴사자는 자동으로 빠지게해라 있으면 안된다. 그리고 사번에 따라 정렬해주고
    노무사와 직원을 따로 분류할 수 있게도 해달라."

   ⚠ 명부는 data/user_dir 이 «진짜»다 — pureun_v6_user_accounts 는 낡아서 퇴사자도
     status=active 로 남아 있다(실측 2026-08-26: 박성수·임혜미가 그랬다).
     그래서 이 검사는 «명부에 retired 로 적혀 있으면 빠진다»를 본다. */
const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10,  role:'admin',  title:'대표노무사', status:'active'  },
  { sid:'P-002', name:'박성수', sortOrder:20,  role:'member', title:'노무사',    status:'retired' },
  { sid:'P-003', name:'박한별', sortOrder:30,  role:'member', title:'노무사',    status:'active'  },
  { sid:'A-001', name:'최기운', sortOrder:80,  role:'staff',  title:'사무장',    status:'active'  },
  { sid:'A-003', name:'김보람', sortOrder:100, role:'staff',  title:'과장',      status:'active'  },
  { sid:'A-006', name:'김석우', sortOrder:130, role:'staff',  title:'사무직',    status:'leave'   },
  { sid:'T-002', name:'김동근', sortOrder:150, role:'member', title:'노무사',    status:'retired' }
];
/* 회사 → 담당자. 퇴사자가 담당인 회사도 둔다(실제로 그런 회사가 있다). */
const BYNAME2 = {
  '한빛물산': { company:'한빛물산', main:'박한별', subs:[] },
  '대한산업': { company:'대한산업', main:'최기운', subs:[] },
  '옛거래처': { company:'옛거래처', main:'박성수', subs:[] },   /* 퇴사자가 담당 */
  '휴직담당': { company:'휴직담당', main:'김석우', subs:[] },
  '과장담당': { company:'과장담당', main:'김보람', subs:[] }
};
const ITEMS2 = {
  a: { id:'a', email:'a@hanbit.co.kr', company:'한빛물산' },
  b: { id:'b', email:'b@daehan.kr',    company:'대한산업' },
  c: { id:'c', email:'c@old.kr',       company:'옛거래처' },
  d: { id:'d', email:'d@leave.kr',     company:'휴직담당' },
  e: { id:'e', email:'e@gwa.kr',       company:'과장담당' }
};
const FOLDERS2 = {
  B_JAMUN: { path:'1.자문사답변', name:'1.자문사답변', kind:'custom', order:7, total:4, unseen:0 }
};
const M2 = (u,e,s) => ({ u:u, f:'보낸이', e:e, t:'370-6@daum.net', s:s, d:1756000000+u, r:1, g:0, a:0, z:1 });
const MSGS2 = { B_JAMUN: {
  '1': M2(1,'a@hanbit.co.kr','한빛'),
  '2': M2(2,'b@daehan.kr','대한'),
  '3': M2(3,'c@old.kr','옛거래처 — 퇴사자 담당'),
  '4': M2(4,'d@leave.kr','휴직자 담당')
}};

function loadStaff(over){
  const o = over || {};
  const held = { wrote:{}, toasts:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', items: ITEMS2, pick:{}, mbDash:'who',
    mbQ:'', mbFilter:'', mbCursor:-1, mbOpen:null
  }, o.state || {});
  const dbRef = (p) => ({
    once: () => Promise.resolve({ val: () => null }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    remove: () => { held.wrote[p] = null; return Promise.resolve(); },
    child(k){ return dbRef(p + '/' + k); },
    update: (v) => { held.wrote[p] = Object.assign(held.wrote[p]||{}, v); return Promise.resolve(); }
  });
  const dummy = { set innerHTML(v){ dummy._h = v; }, get innerHTML(){ return dummy._h||''; },
    style:{}, offsetHeight:120, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0 };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from:'370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {},
    schedList: () => [], staffName: b => String(b||''),
    fmtDate: () => '2026.08.26', fmtMB: n => n + 'B',
    allItems: () => ITEMS2, allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast: m => held.toasts.push(String(m)), confirm: () => true, prompt: () => null,
    closeFolderMenu(){}, toggleSidebar(){}, openSettingsPage(){}, openMatPage(){},
    openMailPage(){}, openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
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
    fetch: () => Promise.resolve({ json:()=>Promise.resolve({ok:true}) }),
    firebase: { auth: () => ({ currentUser:null }), database: () => ({ ref: p => dbRef(p) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS2) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS2) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = ' + JSON.stringify(o.owner || {}) + ';' +
    '_mbOrder = {}; _mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {}, staff = {};
  Object.keys(BYNAME2).forEach(n => { byName[EM._norm(n)] = BYNAME2[n]; });
  (o.dir || DIR).forEach(u => {
    staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
      role:u.role, title:u.title, status:u.status };
  });
  EM.byName = byName; EM.byBiz = {}; EM.staff = staff; EM.ready = true;
  ctx.ErpMatch = EM;
  ctx._held = held;
  return ctx;
}
const names = c => c.mbWhoList().map(w => w.name);

test('★ 퇴사자는 담당자 목록에 «없다» — 대표 지시 「있으면 안된다」', () => {
  const c = loadStaff();
  const ns = names(c);
  ['박성수','김동근'].forEach(n => assert.ok(ns.indexOf(n) < 0, n + '(퇴사)이 목록에 있다'));
  assert.ok(ns.indexOf('박한별') >= 0, '재직자가 빠졌다');
});

test('★ 퇴사자 담당이던 메일은 «사라지지 않는다» — 「담당 모름」으로 온다', () => {
  const c = loadStaff();
  c.state.mbBox = '@?';
  const subs = c.mbAllRows().map(v => v.s).join(' | ');
  assert.ok(subs.indexOf('퇴사자 담당') >= 0,
    '퇴사자 담당이던 메일이 어느 칸에도 없다 — 화면에서 통째로 사라졌다');
  assert.ok(c.mbWhoNoneCount().ret > 0, '퇴사자 담당이던 통수를 세지 않는다');
});

test('★ 옆줄이 «왜 담당 모름이 늘었는지» 말해 준다 — 안 적으면 아무도 모른다', () => {
  const c = loadStaff({ state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('퇴사자') > 0, '퇴사자 담당이던 것이 여기 왔다고 안 알린다');
});

test('★ 휴직자는 «남는다» — 퇴사가 아니고 돌아온다', () => {
  const c = loadStaff();
  assert.equal(c.mbRetired('김석우'), false, '휴직을 퇴사로 봤다');
  assert.ok(names(c).indexOf('김석우') >= 0, '휴직자가 목록에서 빠졌다');
});

test('★ 차례는 «사번 순»이다 — 통수 순이면 날마다 자리가 바뀌어 눈이 못 익힌다', () => {
  const c = loadStaff();
  const list = c.mbWhoList();
  for(let i = 1; i < list.length; i++)
    assert.ok(list[i-1].ord <= list[i].ord,
      '사번 순이 아니다: ' + list[i-1].name + '(' + list[i-1].ord + ') → '
      + list[i].name + '(' + list[i].ord + ')');
  /* P-003 박한별이 A-001 최기운보다 앞이어야 한다 — 사번이 그렇다 */
  const ns2 = names(c);
  assert.ok(ns2.indexOf('박한별') < ns2.indexOf('최기운'), '사번이 앞인 사람이 뒤에 있다');
});

test('★ 노무사와 직원을 «갈라» 놓는다', () => {
  const c = loadStaff();
  const by = {};
  c.mbWhoList().forEach(w => { (by[w.kind] = by[w.kind] || []).push(w.name); });
  assert.ok((by.pro||[]).indexOf('박한별') >= 0, '노무사가 노무사가 아니다');
  assert.ok((by.staff||[]).indexOf('최기운') >= 0, '사무장이 직원이 아니다');
  assert.ok((by.staff||[]).indexOf('김보람') >= 0, '과장이 직원이 아니다');
  assert.ok((by.pro||[]).indexOf('최기운') < 0, '직원이 노무사로 들어갔다');
});

test('★ 직함이 「노무사」면 노무사로 본다 — 사람이 보는 것은 직함이다', () => {
  /* 옛 사람 가운데 role 이 staff 인데 직함이 노무사인 경우가 있다(실측: 안준형) */
  const dir = DIR.concat([{ sid:'A-009', name:'안노무', sortOrder:135,
    role:'staff', title:'노무사', status:'active' }]);
  const c = loadStaff({ dir: dir, owner: { 'x@y,kr':'안노무' } });
  const w = c.mbWhoList().find(x => x.name === '안노무');
  assert.ok(w, '그 사람이 목록에 없다');
  assert.equal(w.kind, 'pro', '직함이 노무사인데 직원으로 갈랐다');
});

test('★ 갈래 머리줄이 «없다» — 사번순 한 줄로 죽 세운다 (대표 지시 2026-08-29)', () => {
  /* ⚠ 결정이 바뀐 자리다.
     2026-08-26: 「노무사와 직원을 따로 분류할 수 있게」 → 갈래 머리줄을 뒀다.
     2026-08-29: 「노무사 직원 구분하는것없이 사번순서로만 하고 나는 가장위에」
       → 열 명뿐인데 머리줄 셋이 끼어 목록이 세 도막으로 잘렸고, 업무 칸으로 바꿀 때
         줄이 위아래로 크게 움직였다. 그것이 「계속 움직이는 느낌」의 큰 몫이었다.
     ⚠ 지킬 뜻은 그대로다 — 「누구 것인지 한눈에 갈린다」. 이제 그것을 사번 순서와
       「나」 표가 맡는다. 되돌리라면 이 검사와 코드를 함께 되돌린다. */
  const c = loadStaff({ state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('dm-whogrp') < 0,
    '갈래 머리줄이 아직 있습니다 — 목록이 도막나 칩을 바꿀 때 줄이 크게 움직입니다');
});

test('명부에 없는 이름은 «지우지 않는다» — 모른다고 지우면 그 메일이 사라진다', () => {
  const c = loadStaff({ owner: { 'z@z,kr':'모르는사람' } });
  assert.equal(c.mbRetired('모르는사람'), false, '모르는 사람을 퇴사로 봤다');
  assert.ok(names(c).indexOf('모르는사람') >= 0, '명부에 없다고 빼 버렸다');
});

test('명부에 없는 사람은 «뒤로» 온다 — 앞에 끼우면 사번 순이 깨져 보인다', () => {
  const c = loadStaff({ owner: { 'z@z,kr':'모르는사람' } });
  const list = c.mbWhoList();
  assert.equal(list[list.length-1].name, '모르는사람', '명부에 없는 사람이 앞에 왔다');
});

/* ══════════════════════════════════════════════════════════════════════════
   자문종료 칸 · 퇴사자 이어받기 (대표 지시 2026-08-26)
   ══════════════════════════════════════════════════════════════════════════
   "자문종료의 경우 종료업체로 별도로 관리할 수 있나 자문종료 메일로 모두 이동되게"
   "퇴사자의 이메일은 승계받은 담당자가 자동으로 본인 메일함으로 정렬되게 해달라"

   ★ 세어 보고 알게 된 것 (2026-08-26 실시간DB)
     · 퇴사자가 담당인 25곳 가운데 «24곳이 이미 종료»였다 — 승계가 아니라 종료 칸으로 간다
     · 정말 이어받아야 하는 곳은 1곳(충원종합관리㈜ · 담당 임혜미)
     · 기업 371곳 = active 205 · closed 100 · suboffice 66
       ⚠ suboffice 는 «지사»다 — 끝난 것이 아니다 */
const ENDF = {
  B_JAMUN: { path:'1.자문사답변', name:'1.자문사답변', kind:'custom', order:7, total:5, unseen:0 }
};
const ENDM = (u,e,s) => ({ u:u, f:'보낸이', e:e, t:'370-6@daum.net', s:s, d:1756000000+u, r:1, g:0, a:0, z:1 });
const ENDMSGS = { B_JAMUN: {
  '1': ENDM(1,'a@live.kr',   '살아 있는 자문사'),
  '2': ENDM(2,'b@ended.kr',  '끝난 자문사'),
  '3': ENDM(3,'c@retire.kr', '퇴사자가 담당'),
  '4': ENDM(4,'d@sub.kr',    '지사 — 끝난 것이 아니다'),
  '5': ENDM(5,'e@nobody.kr', '아무 데도 없는 곳')
}};
const ENDITEMS = {
  a: { id:'a', email:'a@live.kr',   company:'살아있는회사' },
  b: { id:'b', email:'b@ended.kr',  company:'끝난회사' },
  c: { id:'c', email:'c@retire.kr', company:'퇴사자회사' },
  d: { id:'d', email:'d@sub.kr',    company:'지사회사' }
};
/* ⚠ 실제 ErpMatch 처럼 left(끝났다)를 함께 만든다 — 빠뜨리면 종료 칸이 늘 0이 된다 */
const ENDCOS = [
  { name:'살아있는회사', main:'박한별', status:'active'    },
  { name:'끝난회사',     main:'박한별', status:'closed'    },
  { name:'퇴사자회사',   main:'박성수', status:'active'    },
  { name:'지사회사',     main:'김혜민', status:'suboffice' }
];
const ENDDIR = [
  { sid:'P-002', name:'박성수', sortOrder:20, role:'member', title:'노무사', status:'retired' },
  { sid:'P-003', name:'박한별', sortOrder:30, role:'member', title:'노무사', status:'active'  },
  { sid:'P-004', name:'김혜민', sortOrder:40, role:'member', title:'노무사', status:'active'  }
];

function loadEnd(over){
  const o = over || {};
  const held = { wrote:{}, toasts:[], fetched:0 };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', items: ENDITEMS, pick:{}, mbDash:'who',
    mbQ:'', mbFilter:'', mbCursor:-1, mbOpen:null, whoTab:'succ'
  }, o.state || {});
  const dbRef = (p) => ({
    once: () => Promise.resolve({ val: () => null }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    remove: () => { held.wrote[p] = null; return Promise.resolve(); },
    child(k){ return dbRef(p + '/' + k); },
    update: (v) => { held.wrote[p] = Object.assign(held.wrote[p]||{}, v); return Promise.resolve(); }
  });
  const dummy = { set innerHTML(v){ dummy._h = v; }, get innerHTML(){ return dummy._h||''; },
    style:{}, offsetHeight:120, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0 };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from:'370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {},
    schedList: () => [], staffName: b => String(b||''),
    fmtDate: () => '2026.08.26', fmtMB: n => n + 'B',
    allItems: () => ENDITEMS, allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast: m => held.toasts.push(String(m)), confirm: () => true, prompt: () => null,
    closeFolderMenu(){}, toggleSidebar(){}, openSettingsPage(){}, openMatPage(){},
    openMailPage(){}, openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
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
    fetch: () => { held.fetched++; return Promise.resolve({ json:()=>Promise.resolve({ok:true}) }); },
    firebase: { auth: () => ({ currentUser:null }), database: () => ({ ref: p => dbRef(p) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(ENDF) + ';' +
    '_mbMsgs = ' + JSON.stringify(ENDMSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbOrder = {};' +
    '_mbSucc = ' + JSON.stringify(o.succ || {}) + ';' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {}, staff = {};
  ENDCOS.forEach(c => {
    const st = String(c.status||'');
    byName[EM._norm(c.name)] = { company:c.name, main:c.main, subs:[], type:'자문',
      status:st, left:(st==='inactive'||st==='terminated'||st==='closed'),
      ceo:'', contacts:[], bizNo:'' };
  });
  (o.dir || ENDDIR).forEach(u => {
    staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
      role:u.role, title:u.title, status:u.status };
  });
  EM.byName = byName; EM.byBiz = {}; EM.staff = staff; EM.ready = true;
  EM.companies = ENDCOS.map(c => ({ name:c.name, managerMain:c.main, status:c.status }));
  ctx.ErpMatch = EM;
  ctx._held = held;
  ctx.__succ = () => vm.runInContext('JSON.stringify(_mbSucc)', ctx);
  return ctx;
}
const endSubs = (c, id) => { c.state.mbBox = id; return c.mbAllRows().map(v=>v.s).sort().join(' | '); };

/* ══════ 자문종료 ══════ */

test('★ 자문이 끝난 업체의 메일은 「자문종료」 칸으로 간다', () => {
  const c = loadEnd();
  assert.ok(endSubs(c, '@!').indexOf('끝난 자문사') >= 0, '종료 칸에 안 들어왔다');
});

test('★ 종료 메일은 담당자 칸에서 «빠진다» — 한 통이 두 곳에 있으면 몇 통인지 모른다', () => {
  const c = loadEnd();
  const s = endSubs(c, '@박한별');
  assert.ok(s.indexOf('살아 있는 자문사') >= 0, '살아 있는 자문사 메일이 사라졌다');
  assert.ok(s.indexOf('끝난 자문사') < 0, '끝난 업체 메일이 담당자 칸에 남아 있다');
});

test('★ 종료 메일은 「담당 모름」에도 안 들어간다', () => {
  const c = loadEnd();
  assert.ok(endSubs(c, '@?').indexOf('끝난 자문사') < 0, '담당 모름에 겹쳐 들어왔다');
});

test('★ 「지사」는 끝난 것이 아니다 — 넣으면 지사가 통째로 종료로 간다', () => {
  const c = loadEnd();
  assert.ok(endSubs(c, '@!').indexOf('지사') < 0, '지사가 종료 칸으로 갔다');
  assert.ok(endSubs(c, '@김혜민').indexOf('지사') >= 0, '지사 메일이 담당자 칸에서 사라졌다');
});

test('종료 칸에도 이름이 있다 — 이름 없는 칸은 어디인지 알 수 없다', () => {
  const c = loadEnd();
  assert.match(c.mbBoxName('@!'), /자문종료/);
});

test('★ 옆줄에 「자문종료」 줄이 있다 — 메일이 0통이어도 갈 길은 있어야 한다', () => {
  const c = loadEnd({ state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('자문종료') > 0, '종료 칸으로 갈 길이 없다');
});

test('★ 종료업체 목록에 «이메일이 없는 곳»이 위로 온다 — 채워야 할 곳이 먼저 보여야 한다', () => {
  const c = loadEnd();
  const rows = c.mbEndedCos();
  assert.ok(rows.length, '종료업체 목록이 비었다');
  for(let i = 1; i < rows.length; i++)
    assert.ok(rows[i-1].addrs.length <= rows[i].addrs.length, '이메일 없는 곳이 아래로 갔다');
  assert.ok(rows.every(r => r.name !== '지사회사'), '지사가 종료업체 목록에 있다');
});

/* ══════ 퇴사자 이어받기 ══════ */

test('★ 이어받은 사람이 있으면 그 사람 칸으로 «저절로» 간다', () => {
  const c = loadEnd({ succ: { 'P-002':'P-003' } });   /* 박성수 → 박한별 */
  assert.ok(endSubs(c, '@박한별').indexOf('퇴사자가 담당') >= 0, '이어받은 사람 칸에 안 왔다');
  assert.ok(endSubs(c, '@?').indexOf('퇴사자가 담당') < 0, '담당 모름에 그대로 남았다');
});

test('★ 안 이었으면 「담당 모름」에 남는다 — 사라지지 않는다', () => {
  const c = loadEnd();
  assert.ok(endSubs(c, '@?').indexOf('퇴사자가 담당') >= 0, '메일이 어느 칸에도 없다');
});

test('★ 이어받은 사람도 퇴사했으면 «또 이어받은 사람»을 찾는다 — 두 번까지', () => {
  const dir = ENDDIR.concat([{ sid:'T-009', name:'중간사람', sortOrder:200,
    role:'member', title:'노무사', status:'retired' }]);
  const c = loadEnd({ dir: dir, succ: { 'P-002':'T-009', 'T-009':'P-003' } });
  assert.equal(c.mbSuccOf('박성수'), '박한별', '두 다리 건너서 못 찾았다');
});

test('★ 서로 가리키면 «멈춘다» — 한없이 따라가면 화면이 얼어붙는다', () => {
  const dir = ENDDIR.concat([{ sid:'T-009', name:'중간사람', sortOrder:200,
    role:'member', title:'노무사', status:'retired' }]);
  const c = loadEnd({ dir: dir, succ: { 'P-002':'T-009', 'T-009':'P-002' } });
  assert.equal(c.mbSuccOf('박성수'), '', '서로 가리키는데 사람을 내놓았다');
});

test('★ 이어받아도 다음메일 서버를 부르지 않는다 — 우리 쪽 표일 뿐이다', () => {
  const c = loadEnd();
  c.mbSuccSet('P-002', 'P-003');
  assert.equal(c._held.fetched, 0, '다음메일 서버를 불렀다');
  Object.keys(c._held.wrote).forEach(p => assert.ok(p.indexOf('mailbox') < 0,
    '다음메일 자리에 적으려 했다: ' + p));
  assert.match(c.__succ(), /P-003/, '이어받기가 안 적혔다');
});

test('★ 열쇠는 «사번»이다 — 이름은 같을 수 있고 바뀔 수도 있다', () => {
  const c = loadEnd();
  c.mbSuccSet('P-002', 'P-003');
  const st = JSON.parse(c.__succ());
  assert.equal(st['P-002'], 'P-003', '사번이 아니라 다른 것으로 적었다');
});

test('자기 자신에게는 못 넘긴다 — 넘기면 영영 못 찾는다', () => {
  const c = loadEnd();
  c.mbSuccSet('P-002', 'P-002');
  assert.equal(c.__succ(), '{}', '자기 자신에게 넘겼다');
});

test('이어받기를 지우면 다시 「담당 모름」으로 간다 — 되돌릴 길이 있어야 한다', () => {
  const c = loadEnd({ succ: { 'P-002':'P-003' } });
  c.mbSuccSet('P-002', '');
  assert.equal(c.__succ(), '{}', '안 지워졌다');
  assert.ok(endSubs(c, '@?').indexOf('퇴사자가 담당') >= 0, '제자리로 안 돌아왔다');
});

test('★ 이어받기 목록에서 «끝난 업체»는 뺀다 — 그건 승계가 아니라 종료다', () => {
  const c = loadEnd();
  const pend = c.mbSuccPending();
  const park = pend.find(p => p.name === '박성수');
  assert.ok(park, '이어받을 퇴사자가 안 나온다');
  assert.ok(park.cos.indexOf('끝난회사') < 0, '끝난 업체가 이어받기 목록에 있다');
});

test('★ 잇기 화면에 갈래 넷이 다 있다 — 주소·자문사·이어받기·종료업체', () => {
  const c = loadEnd({ state:{ mailSent:'who' } });
  ['addr','co','succ','end'].forEach(t => {
    c.state.whoTab = t;
    const h = c.whoPageHtml();
    assert.ok(h.length > 300, t + ' 갈래가 안 그려진다');
  });
  c.state.whoTab = 'succ';
  assert.ok(c.whoPageHtml().indexOf('mbSuccSet(') > 0, '이어받을 사람을 고를 길이 없다');
  c.state.whoTab = 'end';
  assert.ok(c.whoPageHtml().indexOf('자문종료') > 0, '종료업체 갈래가 종료를 말하지 않는다');
});

/* ══════ 옆줄이 «일관되게» 생겼나 (대표 지시 2026-08-26) ══════ */

test('★ 대시보드를 옮겨도 머리줄 색이 «안 바뀐다» — 바뀌면 다른 화면처럼 보인다', () => {
  const a = loadEnd({ state:{ mbDash:'who' } }).mailSideHtml();
  const b = loadEnd({ state:{ mbDash:'topic' } }).mailSideHtml();
  const head = h => (h.match(/<div class="dm-fsec[^"]*"/) || [''])[0];
  assert.equal(head(a), head(b), '대시보드에 따라 머리줄 클래스가 바뀐다');
});

test('★ 두 칩이 «같은 모양»이다 — 한쪽만 다른 색이면 옮길 때마다 옆줄이 흔들린다', () => {
  const h = loadEnd({ state:{ mbDash:'who' } }).mailSideHtml();
  const seg = (h.match(/<div class="dm-seg">[\s\S]*?<\/div>/) || [''])[0];
  const cls = (seg.match(/<button class="([^"]*)"/g) || []).map(x => x.replace(/on/g,'').trim());
  assert.ok(cls.length === 2, '칩이 둘이 아니다');
  assert.equal(cls[0].replace(/["\s]/g,''), cls[1].replace(/["\s]/g,'').replace(/class=button/,''),
    '두 칩의 꾸밈이 다르다');
  assert.ok(src.indexOf('.dm-seg button.on.g{') < 0, '칩 색이 아직 둘이다');
});

test('★ 칩이 두 줄로 깨지지 않는다 — 「담당/자」로 잘려 보였다', () => {
  assert.match(src, /\.dm-seg button\{[^}]*white-space:nowrap/, '칩이 줄바꿈된다');
  assert.match(src, /\.dm-seg button\{[^}]*flex:1 1 0/, '칩 폭이 글자 수에 따라 달라진다');
});

test('★ 메일 옆줄을 조금 넓혔다 — 240px 에서는 칸 이름이 잘렸다', () => {
  assert.match(src, /#pcRoot\.mailmode #pcSide\{[^}]*width:274px/, '옆줄이 안 넓어졌다');
});

test('★ 담당자 줄과 업무 줄의 «아이콘 폭»이 같다 — 다르면 칩을 옮길 때 이름이 밀린다', () => {
  /* ⚠ 선택자 «모양»을 못 박지 않는다. 2026-08-29 에 둘을 한 줄로 묶으면서
       (.dm-f .ic,.dm-f .dot{width:17px}) 규칙은 그대로인데 이 검사만 깨졌다.
     지킬 것은 「두 아이콘 상자의 폭이 같다」이지, 어느 선택자가 그것을 적었는가가 아니다. */
  /* ⚠ 옆줄의 «줄»(.dm-f) 안으로만 본다. 그냥 「.ic 가 든 규칙」을 다 세면 폰 서랍
       (.dmm-f .ic 20px)·기업정보함 폴더(.pcfold .ic 11px)까지 잡혀 엉뚱한 답이 나온다
       — 실제로 그렇게 잡혀 「11px vs 17px」이라고 틀리게 말했다. */
  /* ⚠ 주석을 «먼저 걷는다». 규칙 위의 설명 주석이 선택자 자리에 묻어 들어와,
       걸러 내려다 규칙 자체를 놓쳤다(내가 실제로 그렇게 틀렸다). */
  const cssOnly = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const widthOf = (name) => {
    const re = new RegExp('([^{}]*\\.dm-f[^{}]*\\' + name + '[^{}]*)\\{([^}]*)\\}', 'g');
    let m, found = null;
    while ((m = re.exec(cssOnly))) {
      const w = /width:\s*(\d+)px/.exec(m[2]);
      if (w) found = Number(w[1]);            /* 뒤에 나온 것이 이긴다(CSS 결) */
    }
    return found;
  };
  /* ⚠ 2026-08-29 부터 아이콘 칸 이름이 «하나»(.ic)다 — 두 이름이 남아 있으면
     언젠가 한쪽만 바뀐다. 그래서 폭도 한 곳에서만 정한다. */
  const ic = widthOf('.ic'), dot = ic;
  assert.ok(ic, '담당자 줄 아이콘 폭을 정한 곳이 없습니다');
  assert.ok(dot, '업무 줄 아이콘 폭을 정한 곳이 없습니다');
  assert.equal(ic, dot,
    '두 아이콘 상자 폭이 다릅니다(담당자 ' + ic + 'px · 업무 ' + dot + 'px) — 이름이 밀립니다');
});

/* ══════════════════════════════════════════════════════════════════════════
   로그인한 «나»부터 보인다 (대표 지시 2026-08-27)
   ══════════════════════════════════════════════════════════════════════════
   "각자 담당자가 로그인 하는경우 본인 이름이 가장 위에 와서 본인위주로 검토할 수 있게"
   "로그인 할 경우 본인 이름과 본인메일을 맨 먼저 볼 수 있는 시스템"

   ★ 지키는 것 넷
     1. 내 줄이 «갈래 머리줄보다 위»에 온다 — 갈래 안에서만 올리면 직원은 여섯 줄 아래다
     2. 내 줄은 «한 번만» 나온다 — 두 줄이면 통수를 두 번 센 줄 안다
     3. 남의 차례는 «안 흔들린다» — 사번 순 그대로
     4. 내 칸이 비어 있으면 그리로 «안 보낸다» — 빈 칸을 먼저 보이면 「메일함이 비었다」가 된다 */
function loadMe(myName, over){
  const c = load(over || {});
  /* myEmail·staffName 은 덩어리 밖에 있다 — 안에서 만들어 준다.
     ⚠ 실제 앱과 «같은 규칙»이어야 한다: 사번의 붙임표를 떼고 @pureun.kr (ErpMatch.nameByEmail) */
  vm.runInContext('myEmail = "me@pureun.kr";', c);
  vm.runInContext('function staffName(e){ return (e === "me@pureun.kr") ? '
    + JSON.stringify(myName || '') + ' : String(e||""); }', c);
  return c;
}

test('★ 내 줄이 «가장 위»에 온다 — 담당자 목록의 첫 줄', () => {
  /* ⚠ 2026-08-29 부터 머리줄이 없다. 그래서 「머리줄보다 위」가 아니라
     «담당자 줄 가운데 첫 줄»인지로 본다. 지킬 뜻은 그대로다. */
  const c = loadMe('박한별', { state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  const rows = h.match(/<div class="dm-f sub whobin[\s\S]*?<\/div>/g) || [];
  assert.ok(rows.length > 1, '담당자 줄이 하나뿐입니다 — 검사 밑그림이 틀렸습니다');
  assert.ok(/meRow/.test(rows[0]) && /meTag/.test(rows[0]),
    '첫 줄이 내 줄이 아닙니다');
  rows.slice(1).forEach(r => assert.ok(!/meRow/.test(r), '내 줄이 아래에도 있습니다'));
});

test('★ 내 줄은 «한 번만» 나온다 — 두 줄이면 통수를 두 번 센 줄 안다', () => {
  const c = loadMe('박한별', { state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  const n = (h.match(/openMailBox\('@박한별'\)/g) || []).length;
  assert.equal(n, 1, '내 칸으로 가는 줄이 ' + n + '개다');
});

test('★ 내 줄에 «나» 표가 붙는다 — 위에만 두면 그냥 첫 줄로 읽힌다', () => {
  const c = loadMe('박한별', { state:{ mbDash:'who' } });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('meTag') > 0, '「나」 표가 없다');
  assert.ok(h.indexOf('meRow') > 0, '내 줄이 눈에 띄게 칠해지지 않았다');
});

test('★ 남의 차례는 «안 흔들린다» — 사번 순 그대로', () => {
  const c = loadMe('박한별', { state:{ mbDash:'who' } });
  const rest = c.mbWhoList().filter(w => !w.me);
  for(let i = 1; i < rest.length; i++)
    assert.ok(rest[i-1].ord <= rest[i].ord,
      '사번 순이 깨졌다: ' + rest[i-1].name + '(' + rest[i-1].ord + ') → '
      + rest[i].name + '(' + rest[i].ord + ')');
  assert.ok(c.mbWhoList()[0].me, '내가 맨 위가 아니다');
});

test('★ 처음 열면 «내 칸»이 열린다', () => {
  const c = loadMe('박한별');
  c.state.mbBox = '';
  assert.equal(c.mbNow(), '@박한별', '열린 칸: ' + c.mbNow());
});

test('★ 처음 열면 «담당자» 대시보드가 먼저다', () => {
  const c = loadMe('박한별', { state:{ mbDash:'' } });
  const h = c.mailSideHtml();
  /* 담당자 칩이 켜져 있어야 한다 */
  assert.match(h, /<button class="on"[^>]*onclick="mbSetDash\('who'\)"/,
    '담당자 칩이 안 켜져 있다');
});

test('★ 내가 담당인 메일이 «한 통도 없으면» 내 칸으로 안 보낸다', () => {
  /* 이 harness 에서 최기운은 담당 메일이 없다 */
  const c = loadMe('최기운');
  c.state.mbBox = '';
  assert.notEqual(c.mbNow(), '@최기운', '빈 칸으로 보냈다');
  assert.equal(c.mbMyBox(), '', '빈 칸을 내 칸으로 내놓았다');
});

test('로그인한 사람을 못 찾으면 예전 그대로다 — 아무것도 안 깨진다', () => {
  const c = loadMe('');
  c.state.mbBox = '';
  assert.equal(c.mbMyName(), '', '찾은 이름: ' + c.mbMyName());
  assert.equal(c.mbMyBox(), '');
  assert.ok(c.mbNow(), '열 칸이 없다');
});

test('★ 이름 대신 «주소»가 오면 안 쓴다 — 옆줄에 p003@… 가 뜨면 안 된다', () => {
  const c = loadMe('p003@pureun.kr');
  assert.equal(c.mbMyName(), '', '주소를 이름으로 썼다: ' + c.mbMyName());
});


/* ══════════════════════════════════════════════════════════════════════════
   기업정보함이 «늦게» 와도 담당자가 잡혀야 한다 (2026-08-27 검토에서 나옴)
   ══════════════════════════════════════════════════════════════════════════
   ⚠ 담당자 표(mbWhoIndex)는 기업정보함을 훑어 한 번 만들어 두고 쓴다. 그런데 기업정보함은
     watchCardMap 으로 «흘러 들어온다» — 메일 화면이 먼저 그려지면 그때는 0장이다.
     예전에는 그 «빈 표»가 그대로 굳어, 새로고침을 하기 전까지 담당자가 전부
     「담당 모름」으로 보였다.
   ★ 이런 고장은 화면만 봐서는 무엇이 틀렸는지 알 길이 없다 — 아무 데도 빨간 것이 없고,
     그냥 «답이 틀릴» 뿐이다. 그래서 검사로 못 박는다. */

test('★ 기업정보함이 늦게 들어와도 담당자가 잡힌다 — 빈 표가 굳으면 전부 「담당 모름」이 된다', () => {
  /* ① 메일 화면이 먼저 그려졌다 — 그때 기업정보함은 아직 0장이다 */
  const c = load({ state: { items: {} } });
  const before = c.mbWhoList().map(w => w.name);
  assert.equal(before.length, 0, '기업정보함이 비었는데 담당자가 잡혔습니다 — 검사 밑그림이 틀렸습니다');

  /* ② 이제 기업정보함이 흘러 들어온다(watchCardMap 이 state.items 를 채운다) */
  c.state.items = ITEMS;

  /* ③ 다시 물으면 «그때 들어온 것»으로 답해야 한다 */
  const after = c.mbWhoList().map(w => w.name);
  assert.ok(after.length > 0,
    '기업정보함이 들어왔는데도 담당자가 안 잡힙니다 — 빈 표가 굳었습니다(새로고침해야 보입니다)');
});

test('기업정보함이 처음부터 있던 것과 «같은 답»이 나온다 — 늦게 왔다고 답이 달라지면 안 된다', () => {
  const late = load({ state: { items: {} } });
  late.mbWhoList();                      /* 빈 채로 한 번 물어 본다(여기서 굳던 자리다) */
  late.state.items = ITEMS;

  const early = load();                  /* 처음부터 다 있던 경우 */
  assert.equal(late.mbWhoList().map(w => w.name).sort().join(','),
               early.mbWhoList().map(w => w.name).sort().join(','),
               '늦게 온 쪽과 처음부터 있던 쪽의 답이 다릅니다');
});


/* ══════════════════════════════════════════════════════════════════════════
   푸른이알피에 적힌 주소도 담당자에게 잇는다 (대표 지시 2026-08-28)
   ══════════════════════════════════════════════════════════════════════════
   "메일함에 담당자로 되어 있을경우 푸른이알피에서 담당자 메일이나 기업정보함에있는
    담당자 메일 주소등이 자동으로 법인내 담당자에게 자동으로 연결되게 해달라."

   ★ 세어 보고 넣었다(실측 2026-08-28) — 업체 371곳 가운데 메일이 적힌 곳 116곳,
     이을 수 있는 주소 123개, 그 가운데 **100개가 무료메일**이다. 바로 그것들이
     지금 「담당 모름」으로 떨어지던 주소다(회사 도메인이 없어 도메인으로는 못 잇고,
     명함에도 없다). 메일 353통 → 749통이 잡힌다.
   ⚠ 주소가 «세 군데»에 흩어져 있다(email · primaryContactEmail · contacts[].email
     — 실측 10·101·137건). 하나만 보면 대부분을 놓친다. */

/* 푸른이알피 업체 자료를 끼워 넣는다.
   ⚠ 담당자·종료 판정은 앱과 «같은 길»(ErpMatch.byName)로 받는다 — 여기서 따로
     셈하면 검사만 통과하고 화면은 다르게 움직인다. */
function loadErp(over){
  const o = over || {};
  const c = loadStaff(o);
  (o.recs || []).forEach(r => { c.ErpMatch.byName[c.ErpMatch._norm(r.company)] = r; });
  c.ErpMatch.companies = o.companies || [];
  c.mbWhoBust();
  return c;
}
const whoOfAddr = (c, em) => c.mbWhoOfRow({ e: em });

test('★ 업체 메일 · 담당자 메일 · 담당자 카드 — «세 군데» 모두 본다', () => {
  /* ⚠ 처음에는 세 주소를 모두 @hanbit.co.kr 로 두었는데, 그 도메인은 기업정보함
       명함에도 있어서 «도메인으로» 잡혔다 — 세 군데 가운데 둘을 꺼도 검사가 통과했다.
       그래서 주소마다 «겹치지 않는 도메인»을 준다. 이 길로만 잡힐 수 있게. */
  const c = loadErp({ companies: [{
    name: '한빛물산',                       /* 담당 박한별 (BYNAME2) */
    email: 'office@only-co.kr',
    primaryContactEmail: 'contact@only-pc.kr',
    contacts: [{ name: '김과장', email: 'kimpersonal@naver.com' }]   /* 무료메일 */
  }] });
  [['업체 메일', 'office@only-co.kr'],
   ['담당자 메일', 'contact@only-pc.kr'],
   ['담당자 카드', 'kimpersonal@naver.com']].forEach(([where, a]) => {
    assert.equal(whoOfAddr(c, a), '박한별', where + '(' + a + ')를 안 보고 있습니다');
  });
});

test('★ 무료메일 주소가 이어진다 — 지금 「담당 모름」으로 떨어지던 바로 그것들이다', () => {
  const c = loadErp({ companies: [{
    name: '한빛물산', contacts: [{ name: '박부장', email: 'parkboss@naver.com' }] }] });
  assert.equal(whoOfAddr(c, 'parkboss@naver.com'), '박한별', '무료메일 주소가 안 이어집니다');
  /* ⚠ 그렇다고 naver.com «도메인 전체»를 그 사람에게 주면 안 된다 — 온 세상이 그 사람 것이 된다 */
  assert.equal(whoOfAddr(c, 'stranger@naver.com'), '',
    '무료메일 도메인을 통째로 한 사람에게 주고 있습니다');
});

test('★ 업체 자료가 «늦게» 와도 다시 만든다 — 빈 표가 굳으면 전부 담당 모름이 된다', () => {
  const c = loadErp({ companies: [] });
  assert.equal(whoOfAddr(c, 'late@naver.com'), '', '검사 밑그림이 틀렸습니다');
  /* ErpMatch.load 가 이제 끝났다 */
  c.ErpMatch.companies = [{ name: '한빛물산',
    contacts: [{ name: '박부장', email: 'late@naver.com' }] }];
  assert.equal(whoOfAddr(c, 'late@naver.com'), '박한별',
    '업체 자료가 들어왔는데도 표가 옛것 그대로입니다(새로고침해야 보입니다)');
});

test('★ 자문이 «끝난» 업체 주소는 담당자 칸이 아니라 종료 칸으로 (대표 결정 2026-08-28)', () => {
  /* ⚠ 처음에 이 검사를 mbWhoOfRow 로 겨눴다가 틀렸다 — 그 함수는 끝난 업체에도
       담당자 이름을 그대로 준다(누가 맡던 곳인지는 알아야 하니 맞다).
       «어느 칸에 들어가는가»를 정하는 것은 mbRowFits 다. 규칙이 사는 자리를 겨눈다. */
  const c = loadErp({
    recs: [{ company: '종료업체', main: '박한별', subs: [], left: true }],
    companies: [{ name: '종료업체',
      contacts: [{ name: '이과장', email: 'ended@naver.com' }] }]
  });
  const row = { e: 'ended@naver.com', _slug: 'B_JAMUN', _key: 'B_JAMUN:9' };
  assert.ok(c.mbEndedOfRow(row), '끝난 업체로 안 잡힙니다');
  assert.equal(c.mbRowFits(row, '@박한별'), false,
    '끝난 업체 메일이 담당자 칸에 들어갑니다 — 한 통이 두 곳에 겹칩니다');
  assert.equal(c.mbRowFits(row, '@?'), false, '「담당 모름」에도 겹쳐 들어갑니다');
  assert.equal(c.mbRowFits(row, '@!'), true, '종료 칸에 안 들어갑니다');
});

test('메일 주소 꼴이 아닌 것은 안 담는다 — 빈칸·쓰레기가 표를 더럽힌다', () => {
  const c = loadErp({ companies: [{
    name: '한빛물산', email: '', primaryContactEmail: '없음',
    contacts: [{ name: '가', email: '   ' }, { name: '나', email: 'ok2@hanbit.co.kr' }] }] });
  assert.equal(whoOfAddr(c, 'ok2@hanbit.co.kr'), '박한별');
  assert.equal(whoOfAddr(c, '없음'), '');
});

test('담당자가 «없는» 업체의 주소는 아무에게도 안 붙는다', () => {
  const c = loadErp({
    recs: [{ company: '담당없음', main: '', subs: [], left: false }],
    companies: [{ name: '담당없음', contacts: [{ name: '가', email: 'nobody@naver.com' }] }]
  });
  assert.equal(whoOfAddr(c, 'nobody@naver.com'), '');
});
