/* 푸른 메일 — ① 단추줄 틀고정 ② 담당자 고르기는 «재직자만» (대표 지시 2026-08-30)
     「이부분 틀고정해라」
     「퇴사자가 나온다 퇴사자는 완전히 배제시켜라 푸른이알피에 재직자만 나오게 해라」

   ⚠ ②에서 «휴직자는 뺀 것이 아니다» — 돌아오는 사람이고 옆줄에 칸도 그대로 서 있다.
     여기서만 빼면 「칸은 있는데 고를 수는 없는」 이상한 자리가 된다
     (기존 검사 `mail-owner-dash` 가 휴직자를 지킨다 — 그것과 어긋나면 안 된다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
/* 주석을 걷는다 — 규칙 위의 설명이 선택자 자리에 묻어 들어온다 */
const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

/* ── 명부: 재직 셋 · 휴직 하나 · 퇴사 둘 ── */
const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10,  role:'admin',  title:'대표노무사', status:'active'  },
  { sid:'P-002', name:'하윤서', sortOrder:20,  role:'member', title:'노무사',     status:'active'  },
  { sid:'P-003', name:'김석우', sortOrder:30,  role:'member', title:'노무사',     status:'leave'   },
  { sid:'A-001', name:'나래',   sortOrder:100, role:'staff',  title:'과장',       status:'active'  },
  /* ⚠ 퇴사자가 «담당으로 적힌 채» 남아 있다 — 실제로 그래서 목록에 나왔다 */
  { sid:'P-009', name:'박성수', sortOrder:40,  role:'member', title:'노무사',     status:'retired' },
  { sid:'A-009', name:'김정현', sortOrder:110, role:'staff',  title:'대리',       status:'retired' },
];
const BYNAME = {
  '하윤사': { company:'하윤사', main:'하윤서', subs:[], left:false },
  '떠난사': { company:'떠난사', main:'박성수', subs:[], left:false },   /* 퇴사자가 담당 */
  '쉬는사': { company:'쉬는사', main:'김석우', subs:[], left:false },   /* 휴직자가 담당 */
};
const ITEMS = {
  i1:{ id:'i1', email:'a@hy.kr', company:'하윤사' },
  i2:{ id:'i2', email:'b@gone.kr', company:'떠난사' },
  i3:{ id:'i3', email:'c@rest.kr', company:'쉬는사' },
};
const FOLDERS = { B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:3, unseen:1 } };
const M = (u,e)=>({ u:u, f:'보낸이', e:e, t:'x@daum.net', s:'제목', d:1756000000+u, r:0, g:0, a:0, z:1 });
const MSGS = { B1: { '1':M(1,'a@hy.kr'), '2':M(2,'b@gone.kr'), '3':M(3,'c@rest.kr') } };

function load(over){
  const o = over || {};
  const held = { wrote:{} };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'who',
    items: ITEMS, mbMineOpen:true
  }, o.state || {});
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const dbRef = (p) => ({ once: () => Promise.resolve({ val: () => null }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    remove: () => Promise.resolve(),
    update: (v) => { held.wrote[p] = Object.assign(held.wrote[p]||{}, v); return Promise.resolve(); },
    orderByKey(){ return this; }, limitToLast(){ return this; } });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: () => 0, clearTimeout(){}, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from:'x@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta:{}, _matLoaded:true,
    loadMaterials(){}, schedList: () => [],
    staffName: e => (String(e||'') === 'p001@pureun.kr' ? '권형하' : String(e||'')),
    fmtDate: () => '2026.08.30', fmtMB: n => n+'B',
    allItems: () => ITEMS, allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast(){}, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    mailWriteHtml: () => '', wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderMailPage(){},
    document: { getElementById: el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    $: el,
    firebase: { auth: () => ({ currentUser:{ uid:'U1', email:'p001@pureun.kr' } }),
      database: () => ({ ref: dbRef }) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok:true }) })
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbSucc = {};' +
    '_mbOwner = ' + JSON.stringify(o.owner || {}) + ';' +
    '_mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {};' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {}, staff = {};
  Object.keys(BYNAME).forEach(n => { byName[EM._norm(n)] = BYNAME[n]; });
  if(!o.noStaff) DIR.forEach(u => { staff[EM._norm(u.name)] = { sid:u.sid, name:u.name,
    ord:u.sortOrder, role:u.role, title:u.title, status:u.status }; });
  EM.byName = byName; EM.byBiz = {}; EM.staff = staff; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM;
  ctx.myEmail = 'p001@pureun.kr';
  EM.nameByEmail = { 'p001@pureun.kr': '권형하' };
  ctx._held = held;
  return ctx;
}

/* ══════ ① 단추줄·안내줄 틀고정 ══════ */

test('★★ 단추줄이 붙박여 있다 — 내려가도 늘 그 자리', () => {
  /* ⚠ 예전에는 단추줄 «과 안내줄»이 한 덩이였다. 2026-08-30 에 대표 지시로
       안내줄을 통째로 뺐다(「이 글자 필요 없다」) — 덩이 안에는 단추줄만 남는다.
       지킬 것은 그대로다: 「목록을 내려도 단추가 그 자리에 있는가」. */
  const c = load();
  const h = c.mbListHtml();
  const i = h.indexOf('dm-froze');
  assert.ok(i > 0, '붙박이 덩이(.dm-froze)가 없습니다 — 목록을 내리면 단추가 사라집니다');
  const tools = h.indexOf('dm-tools'), list = h.indexOf('dm-list');
  assert.ok(i < tools, '단추줄이 붙박이 덩이 밖에 있습니다');
  assert.ok(tools < list, '단추줄이 목록보다 아래에 있습니다');
  /* ⚠ 「뒤에 오는 첫 </div>」를 보면 안 된다 — 그것은 «그 줄 자신»의 닫음이라
       덩이를 안 닫아도 통과한다(2026-08-30 뮤테이션에서 잡음).
       붙박이 여는 곳부터 목록 여는 곳까지 «여닫이 수»를 센다. */
  const open = h.lastIndexOf('<div', i);
  const seg = h.slice(open, h.lastIndexOf(String.fromCharCode(60)+'div', list));
  const opens  = (seg.match(/<div/g)  || []).length;
  const closes = (seg.match(/<\/div>/g) || []).length;
  assert.equal(closes, opens,
    '붙박이 덩이가 목록까지 삼켰습니다 — 목록이 안 넘어갑니다 (여는 것 ' + opens
    + ' · 닫는 것 ' + closes + ')');
});

test('★★ 붙박이에 «붙는 규칙»과 «바탕»이 둘 다 있다 — 하나만 있으면 글자가 겹친다', () => {
  const m = css.match(/#pcMail \.dm-froze\{([^}]*)\}/);
  assert.ok(m, '붙박이 규칙(#pcMail .dm-froze)이 없습니다');
  assert.ok(/position:\s*sticky/.test(m[1]), '붙는 규칙(position:sticky)이 없습니다');
  assert.ok(/top:\s*0/.test(m[1]), '어디에 붙을지(top)가 없습니다');
  /* ⚠ 바탕이 없으면 줄이 «비쳐» 단추 글자와 겹친다 — 고장으로 보이지도 않아 더 나쁘다 */
  assert.ok(/background:/.test(m[1]), '바탕색이 없습니다 — 줄이 비쳐 글자가 겹칩니다');
  assert.ok(/z-index:\s*[1-9]/.test(m[1]), 'z-index 가 없습니다 — 줄이 단추를 덮습니다');
});

test('★ 붙박이는 «PC 에서만» — 폰은 화면이 좁아 목록이 그만큼 줄어든다', () => {
  assert.ok(!/^\.dm-froze\{/m.test(css),
    '#pcMail 밖에도 붙박이 규칙이 있습니다 — 폰에서도 붙습니다');
});

/* ══════ ② 담당자 고르기는 «재직자만» ══════ */

test('★★ 퇴사자는 고르는 목록에 «없다» (대표 지시 2026-08-30)', () => {
  const c = load();
  const ns = c.mbWhoNames();
  ['박성수', '김정현'].forEach(n =>
    assert.ok(ns.indexOf(n) < 0, '퇴사자 「' + n + '」 가 아직 나옵니다: ' + ns.join(' · ')));
});

test('★★ 퇴사자가 «담당으로 적힌» 업체가 있어도 안 나온다 — 그것이 나오던 까닭이었다', () => {
  /* 떠난사의 주담당이 박성수다. 예전 목록은 「담당으로 적힌 사람」을 세어 그대로 나왔다. */
  const c = load();
  const idx = c.mbWhoIndex();
  assert.equal(idx.byAddr['b@gone.kr'], '박성수', '밑그림이 틀렸습니다 — 퇴사자가 담당이어야 합니다');
  assert.ok(c.mbWhoNames().indexOf('박성수') < 0, '담당으로 적힌 퇴사자가 그대로 나옵니다');
});

test('★★ 휴직자는 «남는다» — 옆줄에 칸이 서 있는데 고를 수만 없으면 이상하다', () => {
  const c = load();
  assert.ok(c.mbWhoNames().indexOf('김석우') >= 0, '휴직자가 목록에서 빠졌습니다');
  assert.ok(c.mbWhoList().map(w=>w.name).indexOf('김석우') >= 0, '옆줄에서도 빠졌습니다');
});

test('★★ 아직 아무것도 안 맡은 재직자도 «고를 수 있다» — 새로 온 사람', () => {
  /* 나래는 어느 주소도 안 맡고 있다. 예전 목록은 「맡은 사람」만 세어 못 골랐다. */
  const c = load();
  const idx = c.mbWhoIndex();
  assert.ok(Object.keys(idx.byAddr).map(k=>idx.byAddr[k]).indexOf('나래') < 0,
    '밑그림이 틀렸습니다 — 나래는 아무것도 안 맡아야 합니다');
  assert.ok(c.mbWhoNames().indexOf('나래') >= 0, '새로 온 사람을 고를 수 없습니다');
});

test('★ 차례는 옆줄과 «같은 사번 순»이다 — 여기만 이름순이면 눈이 두 번 익힌다', () => {
  const c = load();
  const ns = c.mbWhoNames();
  assert.ok(ns.indexOf('권형하') < ns.indexOf('하윤서'), '사번 순이 아닙니다: ' + ns.join(' · '));
  assert.ok(ns.indexOf('하윤서') < ns.indexOf('나래'), '사번 순이 아닙니다: ' + ns.join(' · '));
});

test('★★ 명부가 «아직 안 왔으면» 목록을 비우지 않는다 — 빈 목록이 그대로 굳는다', () => {
  const c = load({ noStaff:true, owner:{ 'a_hy_kr':'하윤서' } });
  assert.ok(c.mbWhoNames().length > 0,
    '명부를 기다리는 동안 고를 사람이 하나도 없습니다 — 담당자를 못 정합니다');
});

test('★ 「누구 담당입니까」 창이 그 목록을 그대로 쓴다 — 두 벌이면 한쪽만 고쳐진다', () => {
  const c = load();
  let html = '';
  c.$ = () => ({ set innerHTML(v){ html = v; }, get innerHTML(){ return html; },
    style:{}, classList:{ add(){}, remove(){}, toggle(){}, contains:()=>false },
    getBoundingClientRect: () => ({ top:0, left:0, bottom:0, right:0, width:0, height:0 }) });
  /* 창을 «어디에 놓을지»는 브라우저 일이라 여기서는 안 본다 — 무엇이 적혔는지만 본다 */
  c.window = { innerWidth:1400, innerHeight:900, scrollX:0, scrollY:0 };
  c.mbWhoAsk('cust13@naver.com', null);
  assert.ok(html.indexOf('누구 담당입니까') >= 0, '그 창이 아닙니다');
  assert.ok(html.indexOf('박성수') < 0, '창에 퇴사자가 나옵니다');
  assert.ok(html.indexOf('하윤서') >= 0, '창에 재직자가 안 나옵니다');
});

/* ══════ ③ 목록 안내줄 — 설명만 뺐다 (대표 지시 2026-08-30 「이 내용이 필요한가?」) ══════ */

test('★★ 「방향키로 이동, 스페이스로 선택」 안내가 «없다» — 한 번 읽고 다시 안 읽는다', () => {
  /* ⚠ 이 줄은 이제 늘 붙박여 있다(틀고정). 한 번 읽고 마는 설명이 자리를 영영 차지했다. */
  const h = load().mbListHtml();
  assert.ok(h.indexOf('방향키로 이동') < 0, '안내가 아직 있습니다');
  assert.ok(h.indexOf('스페이스로 선택') < 0, '안내가 아직 있습니다');
});

test('★★ 안내만 뺐고 «방향키·스페이스는 그대로 된다» — 길까지 없애면 안 된다', () => {
  /* ⚠ 설명을 빼는 것과 길을 없애는 것은 다르다. 예전에는 반대로 「적어 두고 안 되게」
       두었다가 그 줄이 거짓말이 됐다 — 이번에는 「되는데 안 적는다」다. */
  const c = load();
  assert.equal(typeof c.mbKeyNav, 'function', '방향키로 옮기는 길이 사라졌습니다');
  const i = src.indexOf('function mbKeyNav');
  assert.ok(i > 0, '방향키 다루는 자리를 못 찾았습니다');
  const seg = src.slice(i, i + 2500);
  ['ArrowDown', 'ArrowUp'].forEach(k =>
    assert.ok(seg.indexOf(k) > 0, k + ' 를 안 봅니다 — 방향키가 죽었습니다'));
  assert.ok(/Space|' '/.test(seg), '스페이스로 고르는 길이 사라졌습니다');
});

test('★★ 목록 위 안내줄이 «통째로» 없다 (대표 지시 2026-08-30 「이 글자 필요 없다」)', () => {
  /* ⚠ 2026-08-30 아침에는 이 검사가 반대였다 — 「통수·마지막 동기화는 남는다」.
       그날 저녁 대표 지시로 뒤집혔다. 이 줄은 틀고정으로 늘 붙박여 있어, 한 번 읽고
       마는 글이 자리를 영영 차지했다.
     ⚠ 값이 사라진 것은 아니다 — 통수는 옆줄 칸마다 붙어 있고, 마지막 동기화는
       [새로고침 ↻] 을 누르면 그때 알려 준다. */
  const h = load().mbListHtml();
  assert.ok(!/통 보는 중/.test(h), '안내줄이 아직 있습니다');
  assert.ok(h.indexOf('class="dm-hint"') < 0, '안내줄 자리가 아직 있습니다');
});
