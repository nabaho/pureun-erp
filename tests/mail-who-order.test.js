/* 푸른 메일 — 담당자 목록 (대표 지시 2026-08-29)
   "업무별과 담당자를 통일감 있게 … 계속 움직이는 느낌이다.
    이름옆에 사람 아이콘 보다 차라리 업무별의 점표시의 위치를 통일 시키는게 좋을것 같다.
    내메일은 굳이 아래의 사람과 중간에 자르는것 보다 노무사 직원 구분하는것없이
    사번순서로만 하고 나는 가장위에 올라가게 하는형태로 했으면 좋겠다.
    사람이름 순서를 개인이 위치이동 가능하게 하는게 좋을것 같다."

   지키는 것 다섯.
   ① 담당자 아이콘 = 업무 칸의 «점» (사람 모양은 무거워 눈이 그쪽으로 끌린다)
   ② 갈래 머리줄이 없다 — 사번 순 한 줄
   ③ 「나」는 맨 위 붙박이(끌 수 없다)
   ④ 나머지는 끌어서 차례를 옮길 수 있고, 그 차례가 사번순보다 이긴다
   ⑤ 옆줄의 «모든 줄»이 같은 칸 차례로 선다 — 두 대시보드를 함께 본다

   ⚠ 마지막 것이 이 검사의 핵심이다. 담당자 쪽만 보다가 업무 칸이 다른 것을
     여러 번 놓쳤다 — 이름 x 는 재면 0px 로 같은데, 손을 얹으면 손잡이가
     «다른 자리»에서 나타나 눈에는 계속 어긋나 보인다. */
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

/* 사번이 뒤섞인 밑그림 — 「사번 순으로 선다」를 실제로 보려면 이름순과 달라야 한다 */
const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10,  role:'admin',  title:'대표노무사', status:'active' },
  { sid:'P-002', name:'하윤서', sortOrder:20,  role:'member', title:'노무사',   status:'active' },
  { sid:'P-003', name:'가온',   sortOrder:30,  role:'member', title:'노무사',   status:'active' },
  { sid:'A-001', name:'나래',   sortOrder:100, role:'staff',  title:'과장',     status:'active' },
];
const BYNAME = {
  '하윤사': { company:'하윤사', main:'하윤서', subs:[], left:false },
  '가온사': { company:'가온사', main:'가온',   subs:[], left:false },
  '나래사': { company:'나래사', main:'나래',   subs:[], left:false },
  '대표사': { company:'대표사', main:'권형하', subs:[], left:false },
  /* ⚠ 자문이 «끝난» 업체 — 없으면 자문종료 줄이 늘 0통이라 그 줄을 못 잰다 */
  '끝난사': { company:'끝난사', main:'하윤서', subs:[], left:true },
};
const ITEMS = {
  i1:{ id:'i1', email:'a@hy.kr', company:'하윤사' },
  i2:{ id:'i2', email:'b@ga.kr', company:'가온사' },
  i3:{ id:'i3', email:'c@nr.kr', company:'나래사' },
  i4:{ id:'i4', email:'d@dp.kr', company:'대표사' },
  i5:{ id:'i5', email:'e@en.kr', company:'끝난사' },
};
/* ⚠ 업무 칸이 «둘» 이어야 끌어 옮길 자리가 생긴다 — 하나면 그 검사가 헛돈다 */
const FOLDERS = {
  B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:7, total:5, unseen:2 },
  B2:{ path:'2.칸', name:'2.칸', kind:'custom', order:7, total:1, unseen:0 },
};
const M = (u,e)=>({ u:u, f:'보낸이', e:e, t:'x@daum.net', s:'제목', d:1756000000+u, r:0, g:0, a:0, z:1 });
const MSGS = {
  B1: { '1':M(1,'a@hy.kr'), '2':M(2,'b@ga.kr'), '3':M(3,'c@nr.kr'), '4':M(4,'d@dp.kr'),
        '5':M(5,'e@en.kr') },
  B2: { '6':M(6,'a@hy.kr') },
};

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
    /* 「나」를 찾는 길 — mbMyName 이 staffName(myEmail) 을 본다 */
    staffName: e => (String(e||'') === 'p001@pureun.kr' ? '권형하' : String(e||'')),
    fmtDate: () => '2026.08.29', fmtMB: n => n+'B',
    allItems: () => ITEMS, allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [], coFTabCounts: () => ({all:0,byTab:{}}),
    _coFolders:{}, _coTagHidden:{},
    toast(){}, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
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
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {};' +
    '_mbOrder = ' + JSON.stringify(o.order || {}) + ';' +
    '_mbWhoOrder = ' + JSON.stringify(o.who || {}) + ';' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {}, staff = {};
  Object.keys(BYNAME).forEach(n => { byName[EM._norm(n)] = BYNAME[n]; });
  DIR.forEach(u => { staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
    role:u.role, title:u.title, status:u.status }; });
  EM.byName = byName; EM.byBiz = {}; EM.staff = staff; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM;
  /* 「나」 = 권형하 — mbMyName 이 보는 자리를 채운다 */
  ctx.myEmail = 'p001@pureun.kr';
  EM.nameByEmail = { 'p001@pureun.kr': '권형하' };
  ctx._held = held;
  ctx.__who = () => vm.runInContext('_mbWhoOrder', ctx);
  ctx.__order = () => vm.runInContext('_mbOrder', ctx);
  return ctx;
}
const names = c => c.mbWhoList().map(w => w.name);
const rowsOf = c => (c.mailSideHtml().match(/<div class="dm-f sub whobin[\s\S]*?<\/div>/g) || []);
/* 두 대시보드를 «둘 다» 그린다 — 한쪽만 보면 어긋남을 놓친다 */
function bothSides(c){
  c.state.mbDash = 'who';   const a = c.mailSideHtml();
  if (typeof c.mbMemoClear === 'function') c.mbMemoClear();
  c.state.mbDash = 'topic'; const b = c.mailSideHtml();
  c.state.mbDash = 'who';
  return a + b;
}

/* ══════ ① 아이콘 ══════ */

test('★ 담당자 아이콘이 업무 칸과 «같은 점»이다 — 사람 모양은 무거워 눈이 그쪽으로 끌린다', () => {
  const c = load();
  rowsOf(c).forEach(r => {
    assert.ok(r.indexOf(c.mbTopicIcoSvg()) >= 0, '담당자 줄이 업무 칸과 다른 아이콘을 씁니다');
    assert.ok(r.indexOf('\u{1F464}') < 0, '이모지 사람 아이콘이 남아 있습니다');
  });
});

test('★ 아이콘 칸 이름이 «하나»다 — 둘이면 언젠가 한쪽만 바뀐다', () => {
  /* ⚠ 예전에 .ic(아래 세 줄)와 .dot(사람·업무 칸) 두 이름이 같은 것을 가리켰다.
       CSS 로 묶어 두어도 마크업에서 갈라지면 그때부터 조용히 어긋난다. */
  assert.ok(src.indexOf('class="dot"') < 0,
    '아이콘 칸 이름이 아직 둘입니다 — class="dot" 이 남아 있습니다');
});

/* ══════ ② 갈래 없애기 · 사번 순 ══════ */

test('★★ 갈래 머리줄이 없다 — 목록이 도막나면 칩을 바꿀 때 줄이 크게 움직인다', () => {
  const c = load();
  assert.ok(c.mailSideHtml().indexOf('dm-whogrp') < 0, '갈래 머리줄이 아직 있습니다');
});

test('★ 「나」를 뺀 나머지는 «사번 순»이다 — 이름순이 아니다', () => {
  const c = load();
  const rest = names(c).slice(1);
  /* 사번 순: 하윤서(P-002) · 가온(P-003) · 나래(A-001).
     이름순이라면 「가온·나래·하윤서」가 된다 — 그것과 달라야 사번순임이 드러난다. */
  assert.deepEqual(rest, ['하윤서', '가온', '나래'],
    '사번 순이 아닙니다: ' + rest.join(' · '));
});

/* ══════ ③ 「나」는 맨 위 붙박이 ══════ */

test('★ 「나」가 첫 줄이고, 끌 수 없다 — 끌어 내리면 「내 메일이 어디 갔나」가 된다', () => {
  const c = load();
  assert.equal(names(c)[0], '권형하', '내 줄이 첫 줄이 아닙니다');
  const rows = rowsOf(c);
  assert.ok(/meRow/.test(rows[0]) && /meTag/.test(rows[0]), '첫 줄에 「나」 표가 없습니다');
  assert.ok(!/draggable="true"/.test(rows[0]), '「나」 줄이 끌립니다');
  rows.slice(1).forEach(r => assert.ok(/draggable="true"/.test(r), '다른 줄이 안 끌립니다'));
});

test('★ 끌어 옮긴 차례가 있어도 「나」는 맨 위 그대로', () => {
  /* 「나」에게 큰 번호를 억지로 매겨도 맨 위여야 한다 */
  const c = load({ who: { '권형하': 99, '나래': 0 } });
  assert.equal(names(c)[0], '권형하', '차례를 매겼더니 내 줄이 내려갔습니다');
});

/* ══════ ④ 끌어서 차례 옮기기 ══════ */

test('★★ 끌어 옮긴 차례가 사번순보다 «이긴다»', () => {
  const c = load({ who: { '나래': 0, '하윤서': 1, '가온': 2 } });
  assert.deepEqual(names(c).slice(1), ['나래', '하윤서', '가온'],
    '끌어 옮긴 차례를 안 따릅니다');
});

test('★ 끌어 놓으면 차례가 «남는다» — 다음에 열어도 그대로', () => {
  const c = load();
  c.state.mbDrag = { kind:'who', id:'나래' };
  c.mbWhoDrop({ preventDefault(){} }, '하윤서', null);
  const saved = c._held.wrote['pucards/config/mailWhoOrder'];
  assert.ok(saved, '차례를 저장하지 않았습니다');
  const k = c.mbWhoKey;
  assert.ok(Number(saved[k('나래')]) < Number(saved[k('가온')]),
    '옮긴 자리가 안 담겼습니다: ' + JSON.stringify(saved));
});

test('★★ 「나」는 차례 표에 «안 들어간다» — 넣으면 남을 나보다 위로 끌 때 그 사람이 사라진다', () => {
  const c = load();
  c.state.mbDrag = { kind:'who', id:'나래' };
  c.mbWhoDrop({ preventDefault(){} }, '하윤서', null);
  const saved = c._held.wrote['pucards/config/mailWhoOrder'] || {};
  assert.ok(!(c.mbWhoKey('권형하') in saved),
    '「나」가 차례 표에 들어갔습니다: ' + JSON.stringify(saved));
});

test('★★ 업무 칸을 옮겨도 담당자 차례가 «안 지워진다» — 두 표는 따로 산다', () => {
  const c = load({ who: { '나래': 0, '하윤서': 1, '가온': 2 } });
  const bins = c.mbBins();
  assert.ok(bins.length > 1, '밑그림에 업무 칸이 둘 이상 있어야 합니다 (' + bins.length + '개)');
  c.state.mbDrag = { kind:'bin', id:bins[0].id };
  c.mbDrop({ preventDefault(){} }, bins[1].id, null);
  ['나래','하윤서','가온'].forEach(nm =>
    assert.ok(c.mbWhoKey(nm) in c.__who(),
      '업무 칸을 옮겼더니 담당자 차례(' + nm + ')가 지워졌습니다: ' + JSON.stringify(c.__who())));
});

test('메일을 사람 줄에 떨어뜨려도 차례는 «그대로»다', () => {
  /* ⚠ 이것은 «규칙을 못 박는» 검사다. 지금은 kind 가드를 떼도 아래 indexOf 가
     어차피 막아 준다(뮤테이션으로 확인 2026-08-30). 목록 만드는 법이 바뀌면
     그때는 이 검사만이 막는다 — 그러라고 둔다. */
  const c = load({ who: { '나래': 0, '하윤서': 1, '가온': 2 } });
  const before = JSON.stringify(c.__who());
  c.state.mbDrag = { kind:'mail', id:'1' };
  c.mbWhoDrop({ preventDefault(){} }, '하윤서', null);
  assert.equal(JSON.stringify(c.__who()), before, '메일을 떨어뜨렸는데 차례가 바뀌었습니다');
});

/* ══════ ⑤ 옆줄의 «모든 줄»이 같은 칸 차례 ══════
   ★ 앞서 브라우저로 재 보니(docs/mockups/mail-dash-align-live.html) «칸 차례가 같으면
     이름 시작 x 가 0px 로 맞는다». 그래서 여기서는 그 «구조»를 지킨다 —
     픽셀은 브라우저가 있어야 재지만, 구조는 여기서 늘 지킬 수 있다. */

test('★ 「담당 모름」·「자문종료」도 같은 자리에 선다 — 거기서 또 밀리면 안 된다', () => {
  const c = load();
  const h = c.mailSideHtml();
  /* ⚠ 자문종료는 «통수가 있을 때» 봐야 뜻이 있다 — 0통이면 무엇을 지워도 통과한다 */
  assert.ok(c.mbEndedCount().n > 0, '밑그림에 끝난 업체 메일이 없습니다');
  ['담당 모름', '자문종료'].forEach(nm => {
    const i = h.indexOf('>' + nm + '<');
    assert.ok(i > 0, nm + ' 줄이 없습니다');
    const row = h.slice(h.lastIndexOf('<div class="dm-f', i), h.indexOf('</div>', i) + 6);
    assert.ok(/class="grip ghost"/.test(row), nm + ' 줄에 손잡이 자리가 없습니다');
    assert.ok(/class="fmenu ghost"/.test(row), nm + ' 줄에 메뉴 자리가 없습니다');
    assert.ok(!/class="n">/.test(row), nm + ' 줄에 전체 통수가 붙어 있습니다(안읽음만)');
  });
});

test('★★ 옆줄의 모든 줄이 «같은 칸 차례»다 — 하나라도 다르면 그 줄에서 이름이 밀린다', () => {
  /* ⚠ «두 대시보드를 다» 본다. 한쪽만 보다가 반대쪽이 어긋난 것을 여러 번 놓쳤다. */
  const c = load();
  const rows = bothSides(c).match(/<div class="dm-f sub[^"]*"[\s\S]*?<\/div>/g) || [];
  assert.ok(rows.length >= 6, '옆줄 줄이 너무 적습니다 (' + rows.length + ') — 밑그림을 보세요');
  /* 각 줄이 가진 «칸»을 차례대로 뽑는다 */
  const shapeOf = r => (r.match(/<span class="(grip|ic|dot|nm|n|nu|fmenu)[^"]*"/g) || [])
    .map(x => x.replace(/<span class="/, '').replace(/[" ].*$/, ''))
    .filter(x => x !== 'nu' && x !== 'n');      /* 숫자는 있을 수도 없을 수도 */
  const shapes = rows.map(shapeOf);
  const first = shapes[0].join('>');
  const bad = [];
  shapes.forEach((s, i) => {
    if (s.join('>') !== first) bad.push('[' + i + '] ' + s.join('>') + '  ≠  ' + first);
  });
  assert.deepEqual(bad, [],
    '칸 차례가 다른 줄이 있습니다 — 그 줄에서 이름·숫자가 밀립니다:\n  ' + bad.join('\n  '));
});

test('★ 숫자는 어느 줄에도 «하나»뿐이다 — 둘이면 그 줄만 오른쪽이 어긋난다', () => {
  const c = load();
  const rows = bothSides(c).match(/<div class="dm-f sub[^"]*"[\s\S]*?<\/div>/g) || [];
  rows.forEach((r, i) => assert.ok(!/class="n">/.test(r),
    '[' + i + '] 줄에 전체 통수가 붙어 있습니다 — 안 읽은 수만 적습니다'));
});
