/* 푸른 메일 — 스스로 채운다 (대표 보고 2026-08-30)
   "시작할때 또는 로그인 때마다 왜 이렇게 동기화된 메일이 계속 없다고 나오나
    자동으로 나오게 하면 안되나?"

   ★ 무엇이었나 — 줄을 받아 오는 곳이 «문 하나»(openMailBox)뿐이었다. 그 문을 안
     거치고 화면이 그려지면 폴더·쪽수는 다 보이는데 목록만 빈 채로 굳었다. 화면은
     「동기화된 메일이 없습니다」라 말하지만 사실은 «아직 안 받아 온 것»이었다.

   지키는 것.
   ① 그릴 때 스스로 살펴 없으면 받아 온다 — 어느 길로 들어와도
   ② 칸마다 «한 번»만 — 아니면 받아오기 ↔ 그리기 로 끝없이 돈다
   ③ 이미 받아 둔 칸은 다시 안 받는다 — 빈 표({})도 「없더라」는 답이다
   ④ 로그인 전에는 아무것도 안 한다
   ⑤ 받아 오는 중이면 「읽고 있습니다」라고 말한다 — 「없습니다」가 아니라
   ⑥ 새로고침을 누르면 못 읽었던 칸도 다시 받아 본다 */
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

/* 서버에는 400통이 있다고 적혀 있다 — 그런데 우리 손에는 아직 한 줄도 없다 */
const FOLDERS = {
  IN:{ path:'받은편지함', name:'받은메일함', kind:'inbox',  order:1, total:400, unseen:0 },
  B1:{ path:'1.칸',      name:'1.칸',      kind:'custom', order:7, total:5,   unseen:1 },
};
const M = (u)=>({ u:u, f:'보낸이', e:'a@hy.kr', t:'x@daum.net', s:'제목'+u,
                  d:1756000000+u, r:1, g:0, a:0, z:1, p:'' });

function load(over){
  const o = over || {};
  const held = { got:[], user: o.user === undefined ? { uid:'U1' } : o.user };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'IN', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'topic',
    items:{}, mbMineOpen:true
  }, o.state || {});
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const dbRef = () => ({ once: () => Promise.resolve({ val: () => null }),
    set: () => Promise.resolve(), remove: () => Promise.resolve(), update: () => Promise.resolve(),
    orderByKey(){ return this; }, limitToLast(){ return this; } });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (f) => { if(typeof f==='function') f(); return 0; }, clearTimeout(){}, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from:'x@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta:{}, _matLoaded:true,
    loadMaterials(){}, schedList: () => [],
    staffName: e => String(e||''), fmtDate: () => '2026.08.30', fmtMB: n => n+'B',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast(){}, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    mailWriteHtml: () => '', wireMailWrite(){}, redrawCompose(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderPCSide(){},
    document: { getElementById: el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => false } } },   /* PC 아님 → renderMailPage 는 폰 길로 */
    $: el,
    firebase: { auth: () => ({ currentUser: held.user }),
      database: () => ({ ref: dbRef }) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok:true }) })
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(o.folders === undefined ? FOLDERS : o.folders) + ';' +
    '_mbMsgs = ' + JSON.stringify(o.msgs || {}) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {};' +
    '_mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {}; _mbBinRule = {};' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  EM.byName = {}; EM.byBiz = {}; EM.staff = {}; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr'; EM.nameByEmail = {};
  /* 받아 오기를 가로챈다 — «무엇을 몇 번» 받아 오는지 센다 */
  ctx.loadMailBox = (slug, n, cb) => {
    held.got.push(slug);
    if(o.fail){ if(cb) cb(); return; }          /* 못 읽었다 — 표는 안 채워진다 */
    vm.runInContext('_mbMsgs[' + JSON.stringify(slug) + '] = '
      + JSON.stringify(o.rows || { '1':M(1), '2':M(2) }) + ';', ctx);
    if(cb) cb();
  };
  ctx.renderMailPage = () => {};                 /* 되부름은 여기서 끊는다 */
  ctx._held = held;
  ctx.__msgs = () => vm.runInContext('_mbMsgs', ctx);
  return ctx;
}

/* ══════ ① 스스로 받아 온다 ══════ */

test('★★ 그릴 때 줄이 없으면 «스스로» 받아 온다 — 새로고침을 안 눌러도', () => {
  const c = load();
  assert.equal(c._held.got.length, 0, '아직 아무것도 안 받아 왔어야 합니다');
  c.mbAutoFill();
  assert.ok(c._held.got.indexOf('IN') >= 0,
    '스스로 안 받아 옵니다: ' + JSON.stringify(c._held.got));
  assert.ok(Object.keys(c.__msgs().IN || {}).length, '받아 온 줄이 안 담겼습니다');
});

test('★★ 그리는 자리가 «그 살핌»을 부른다 — 문(openMailBox)만 고치면 또 굳는다', () => {
  const body = cut('function renderMailPage(){', '\nfunction renderMailMobile');
  assert.ok(/mbAutoFill\(\)/.test(body),
    '그릴 때 안 살핍니다 — 문을 안 거치고 그려지면 목록이 빈 채로 굳습니다');
});

/* ══════ ②③④ 헛일·되돌이를 막는다 ══════ */

test('★★ 칸마다 «한 번»만 — 아니면 받아오기 ↔ 그리기 로 끝없이 돈다', () => {
  const c = load({ fail:true });        /* 못 읽는 칸 */
  c.mbAutoFill();
  c.mbAutoFill();
  c.mbAutoFill();
  const n = c._held.got.filter(x => x === 'IN').length;
  assert.equal(n, 1, '같은 칸을 ' + n + '번 받아 옵니다 — 끝없이 돕니다');
});

test('★★ 이미 받아 둔 칸은 «다시 안 받는다» — 빈 표도 「없더라」는 답이다', () => {
  const c = load({ msgs: { IN: {} } });   /* 받아 봤더니 한 줄도 없었다 */
  c.mbAutoFill();
  assert.equal(c._held.got.length, 0, '빈 표를 보고 또 받아 왔습니다 — 요금이 두 번 나갑니다');
});

test('★★ 로그인 전에는 «아무것도 안 한다» — 거절만 쌓인다', () => {
  const c = load({ user:null });
  c.mbAutoFill();
  assert.equal(c._held.got.length, 0, '로그인 전에 받아 오려 했습니다');
});

test('★ 폴더 목록이 아직 없으면 안 한다 — 무엇을 받아 올지 모른다', () => {
  const c = load({ folders:null });
  c.mbAutoFill();
  assert.equal(c._held.got.length, 0, '폴더도 모르는데 받아 오려 했습니다');
});

test('★ 메일 화면이 아니면 안 한다', () => {
  const c = load({ state:{ view:'list' } });
  c.mbAutoFill();
  assert.equal(c._held.got.length, 0, '메일 화면도 아닌데 받아 왔습니다');
});

/* ══════ ⑤ 무슨 말을 하나 ══════ */

test('★★ 받아 오는 중이면 «읽고 있습니다»라고 한다 — 「없습니다」가 아니라', () => {
  const c = load();
  assert.equal(c.mbLoadingBox(), true, '아직 안 받아 왔는데 다 받은 줄 압니다');
  const h = c.mbMobileHtml();
  assert.ok(h.indexOf('읽고 있습니다') >= 0,
    '아직 받아 오는 중인데 「없습니다」라고 합니다');
  assert.ok(h.indexOf('아직 동기화된 메일이 없습니다') < 0,
    '없다고 잘못 말합니다 — 새로고침을 눌러야만 나오는 줄 압니다');
});

test('★★ 정말로 «받아 봤더니 없을» 때만 「없습니다」라고 한다', () => {
  const c = load({ msgs: { IN: {} } });
  assert.equal(c.mbLoadingBox(), false, '다 받았는데 읽는 중이라 합니다');
  assert.ok(c.mbMobileHtml().indexOf('아직 동기화된 메일이 없습니다') >= 0,
    '정말 없을 때 그렇다고 안 말합니다');
});

test('★★ 두 화면(PC·폰)이 «같은 말»을 한다 — 한쪽만 고치면 다른 쪽에서 또 겪는다', () => {
  const pc  = cut('function mbListHtml(){', '\n/* ── 방향키로 이동');
  const ph  = cut('function mbMobileHtml(){', '\nfunction mbDrawer');
  [['PC', pc], ['폰', ph]].forEach(([nm, seg]) =>
    assert.ok(/mbLoadingBox\(\)/.test(seg),
      nm + ' 화면이 「읽고 있습니다」를 안 가립니다'));
});

/* ══════ ⑥ 새로고침 ══════ */

test('★★ 새로고침을 누르면 못 읽었던 칸도 «다시» 받아 본다', () => {
  const body = cut('function mbPull(){', '\nfunction ');
  assert.ok(/_mbFilled = \{\}/.test(body),
    '새로고침이 「스스로 받아 온 표」를 안 지웁니다 — 한 번 못 읽은 칸은 영영 안 나옵니다');
});
