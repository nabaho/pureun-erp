/* 푸른 메일 — 담당자 «1회성» 배정 (대표 지시 2026-08-30)
   「공공기관이나 기타 사업이라 하더라도 필요에 따라 담당자를 1회성으로 배정해야 할
    경우가 많이 있는데, 이때는 자동등록 아니라 개별 등록하게 시스템 만들어야 할 것 같다」

   ★ 「담당자 ˅」는 «원래부터» 한 통씩 박는다(config/mailWhoMsg) — 「앞으로 오는 것도」를
     켜야 주소 규칙이 된다. 빠져 있던 것은 «읽는 화면에서 못 한다»는 것이었다.
     공공기관 메일은 열어 봐야 누가 처리할지 아는데, 정하려면 목록으로 돌아가
     체크하고 눌러야 했다.

   지키는 것.
   ① 읽는 화면에서 그 «한 통»의 담당자를 정할 수 있다
   ② 그 한 통만 박힌다 — 같은 곳에서 온 다른 메일은 안 건드린다
   ③ 한 통에 박은 것이 «주소 규칙»보다 세다 — 1회성이 그 뜻이다
   ④ 「그 밖」·「담당 모름」에 있던 것도 박는 순간 «그 사람 칸»으로 간다
   ⑤ 창은 «한 벌»이다 — 목록에서 열든 읽는 화면에서 열든 같은 창
   ⑥ 지금 담당이 누구인지 단추에 적혀 있다 — 안 적으면 눌러 봐야 안다 */
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

const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10, role:'admin',  title:'대표노무사', status:'active' },
  { sid:'P-002', name:'하윤서', sortOrder:20, role:'member', title:'노무사',     status:'active' },
  { sid:'P-003', name:'김보람', sortOrder:30, role:'member', title:'노무사',     status:'active' },
];
const COS = [
  { id:'c1', name:'하윤사', bizNo:'1', typeCode:'자문', status:'active',
    managerMain:'P-002', email:'a@hy.kr', contacts:[] },
];
const FOLDERS = { B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:9, unseen:0 } };
const M = (u,e)=>({ u:u, f:'보낸이', e:e, t:'x@daum.net', s:'제목'+u,
                    d:1756000000+u, r:1, g:0, a:0, z:1, p:'' });
/* 노동청에서 «두 통» — 하나만 맡기고 다른 하나는 그대로여야 한다 */
const MSGS = { B1: {
  '1':M(1,'labor@moel.go.kr'), '2':M(2,'labor@moel.go.kr'),
  '3':M(3,'a@hy.kr'),                 /* 자문사 — 하윤서 */
  '4':M(4,'who@nowhere.kr'),          /* 담당 모름 */
} };

function load(over){
  const o = over || {};
  const held = { wrote:{}, menu:'' };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'B1', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbDash:'who', mbOwnOne:null,
    mbOpen: o.open === undefined ? { slug:'B1', uid:'1', atts:[], text:'' } : o.open,
    items:{}, mbMineOpen:true
  }, o.state || {});
  const menuEl = { set innerHTML(v){ held.menu = String(v); },
    get innerHTML(){ return held.menu; }, style:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains:()=>false },
    getBoundingClientRect: () => ({ top:0, left:0, bottom:0, right:0, width:0, height:0 }) };
  const el = (id) => (id === 'folderMenu' ? menuEl : ({
    set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } }));
  const dbRef = (p) => ({ once:()=>new Promise(()=>{}), set:()=>Promise.resolve(),
    remove:()=>Promise.resolve(),
    update:(u)=>{ Object.assign(held.wrote, u); return Promise.resolve(); },
    orderByKey(){ return this; }, limitToLast(){ return this; } });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout:(f)=>{ if(typeof f==='function') f(); return 0; }, clearTimeout(){}, atob:()=>'',
    state, window:{ innerWidth:1400, innerHeight:900, scrollX:0, scrollY:0 },
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store:{ mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg:()=>({ from:'x@daum.net' }),
    matList:()=>[], matCat:()=>'', MAT_CATS_NOW:()=>[], _matMeta:{}, _matLoaded:true,
    loadMaterials(){}, schedList:()=>[],
    staffName: e => (String(e||'')==='p001@pureun.kr' ? '권형하' : String(e||'')),
    fmtDate:()=>'2026.08.30', fmtMB:n=>n+'B',
    allItems:()=>({}), allGroups:()=>({}),
    isPrivGroup:()=>false, canSeeGroup:()=>true,
    coList:()=>[], coTagList:()=>[], coFTabList:()=>[],
    coFTabCounts:()=>({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast(m){ held.toast = String(m||''); }, confirm:()=>true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml:()=>'', schedBoxHtml:()=>'', sentBoxHtml:()=>'',
    mailWriteHtml:()=>'', wireMailWrite(){}, redrawCompose(){},
    pickOf:k=>(state.pick[k]=state.pick[k]||{}),
    pickOn:()=>false, pickList:()=>[], pickAllOn:()=>false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderMailPage(){}, renderPCSide(){},
    document:{ getElementById:el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains:()=>true } } },
    $: el,
    firebase:{ auth:()=>({ currentUser:{ uid:'U1', email:'p001@pureun.kr' } }),
      database:()=>({ ref: dbRef }) },
    fetch:()=>new Promise(()=>{})
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbSucc = {}; _mbCo = {};' +
    '_mbOwner = ' + JSON.stringify(o.owner || {}) + ';' +
    '_mbNotCo = ' + JSON.stringify(o.notco === undefined ? { 'labor@moel,go,kr':1 } : o.notco) + ';' +
    '_mbWhoMsg = ' + JSON.stringify(o.whoMsg || {}) + ';' +
    '_mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {}; _mbBinRule = {}; _mbNewSkip = {};' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const staff = {}, nameBySid = {}, byName = {}, byBiz = {};
  DIR.forEach(u => { nameBySid[u.sid] = u.name;
    staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
      role:u.role, title:u.title, status:u.status }; });
  COS.forEach(co => {
    const rec = { company:co.name, main:nameBySid[co.managerMain]||'', subs:[],
      type:co.typeCode, status:co.status, left:false, contact:'', phone:'', address:'',
      contacts:co.contacts||[] };
    byName[EM._norm(co.name)] = rec; byBiz[String(co.bizNo)] = rec;
  });
  EM.byName = byName; EM.byBiz = byBiz; EM.staff = staff;
  EM.companies = COS; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr';
  EM.nameByEmail = { 'p001@pureun.kr':'권형하' };
  ctx._held = held;
  ctx.__msg = () => vm.runInContext('_mbWhoMsg', ctx);
  ctx.__own = () => vm.runInContext('_mbOwner', ctx);
  return ctx;
}
const rowOf = (c, uid) => c.mbCkRows().filter(v => String(v.u) === String(uid))[0];
const inBox = (c, id) => c.mbCkRows().filter(v => c.mbRowFits(v, id)).length;

/* ══════ ① 읽는 화면에서 정한다 ══════ */

test('★★ 읽는 화면에 «담당자» 단추가 있다 — 열어 봐야 누가 처리할지 안다', () => {
  const c = load();
  const h = c.mbReadHtml();
  assert.ok(/mbOwnerOne\(/.test(h),
    '읽는 화면에서 담당자를 못 정합니다 — 목록으로 돌아가 체크해야 합니다');
});

test('★★ 지금 담당이 «누구인지» 단추에 적혀 있다 — 안 적으면 눌러 봐야 안다', () => {
  const c = load({ open:{ slug:'B1', uid:'3', atts:[], text:'' } });   /* 자문사 = 하윤서 */
  assert.ok(c.mbReadHtml().indexOf('하윤서') >= 0, '담당자 이름이 단추에 없습니다');
  const c2 = load({ open:{ slug:'B1', uid:'4', atts:[], text:'' } });  /* 담당 모름 */
  assert.ok(c2.mbReadHtml().indexOf('👤 담당자') >= 0, '담당이 없을 때 말이 없습니다');
});

test('★★ 창은 «한 벌»이다 — 목록에서 열든 읽는 화면에서 열든 같은 창', () => {
  const b = cut('function mbOwnerOne(', '\nfunction mbOwnerMove(');
  assert.ok(/mbOwnerMove\(/.test(b), '읽는 화면이 창을 따로 만듭니다 — 두 벌이 됩니다');
  assert.ok(!/innerHTML/.test(b), '읽는 화면이 제 창을 그립니다');
});

/* ══════ ②③④ 한 통만 · 가장 세다 ══════ */

test('★★ 그 «한 통»만 박힌다 — 같은 곳에서 온 다른 메일은 안 건드린다', () => {
  const c = load();
  c.mbOwnerOne('B1', '1', null);          /* 노동청 첫 통을 연 상태 */
  c.mbOwnerPut('김보람');
  const msg = c.__msg();
  assert.equal(msg[c.mbWhoKey('B1:1')], '김보람', '그 한 통에 안 박혔습니다');
  assert.ok(!msg[c.mbWhoKey('B1:2')],
    '같은 곳에서 온 다른 메일까지 박혔습니다 — 1회성이 아닙니다');
});

test('★★ 주소 규칙을 «안 만든다» — 그 기관 메일 전부가 한 사람에게 가면 안 된다', () => {
  const c = load();
  c.mbOwnerOne('B1', '1', null);
  c.mbOwnerPut('김보람');
  assert.equal(Object.keys(c.__own()).length, 0,
    '주소 규칙이 생겼습니다: ' + JSON.stringify(c.__own()));
});

test('★★ 한 통에 박은 것이 «주소 규칙»보다 세다 — 1회성이 그 뜻이다', () => {
  /* 이 주소는 하윤서에게 가도록 규칙이 있는데, 이 한 통만 김보람에게 */
  const c = load({ owner:{ 'labor@moel,go,kr':'하윤서' },
                   whoMsg:{ 'b1:1':'김보람' } });
  assert.equal(c.mbWhoOfRow(rowOf(c, 1)), '김보람',
    '주소 규칙이 한 통 박은 것을 덮었습니다 — 그러면 그 단추가 뜻이 없어집니다');
  assert.equal(c.mbWhoOfRow(rowOf(c, 2)), '하윤서', '안 박은 것은 규칙대로여야 합니다');
});

test('★★ 「그 밖」에 있던 것도 박는 순간 «그 사람 칸»으로 간다', () => {
  const before = load();
  assert.equal(inBox(before, '@#'), 2, '밑그림 — 노동청 두 통이 「그 밖」이어야 합니다');
  const c = load({ whoMsg:{ 'b1:1':'김보람' } });
  assert.equal(inBox(c, '@#'), 1, '박았는데 「그 밖」에 그대로 있습니다');
  assert.ok(inBox(c, '@김보람') >= 1, '박은 사람 칸에 안 들어갔습니다');
});

test('★★ 「담당 모름」에 있던 것도 박는 순간 그 사람 칸으로 간다', () => {
  const before = load();
  assert.equal(before.mbWhoNoneCount().n, 1, '밑그림 — 담당 모름 한 통이어야 합니다');
  const c = load({ whoMsg:{ 'b1:4':'김보람' } });
  assert.equal(c.mbWhoNoneCount().n, 0, '박았는데 담당 모름에 그대로 있습니다');
});

test('★ 되돌릴 수 있다 — 「담당 모름으로 되돌리기」', () => {
  const c = load({ whoMsg:{ 'b1:1':'김보람' } });
  c.mbOwnerOne('B1', '1', null);
  c.mbOwnerPut('');
  assert.ok(!c.__msg()[c.mbWhoKey('B1:1')], '되돌려지지 않았습니다');
});

/* ══════ ⑤ 여는 곳과 박는 곳이 같은 자리 ══════ */

test('★★ 여는 곳과 박는 곳이 «같은 자리»를 본다 — 따로 세면 엉뚱한 메일에 박힌다', () => {
  const mv = cut('function mbOwnerMove(ev, only){', '\n/* 고른 것(과 고른 갈래)');
  const pt = cut('function mbOwnerPut(name){', '\nfunction ');
  assert.ok(/mbOwnRows\(\)/.test(mv), '여는 곳이 한 자리를 안 봅니다');
  assert.ok(/mbOwnRows\(\)/.test(pt), '박는 곳이 한 자리를 안 봅니다');
});

test('★ 체크를 켜고 끌 때 «어느 메일인지»가 이어진다', () => {
  const c = load();
  c.mbOwnerOne('B1', '1', null);
  const keep = c.state.mbOwnOne;
  assert.ok(keep && keep.uid === '1', '읽는 화면에서 연 것이 안 담겼습니다');
  c.mbOwnerKeep(null);                      /* 체크를 켠 것과 같은 길 */
  assert.ok(c.state.mbOwnOne && c.state.mbOwnOne.uid === '1',
    '체크를 켰더니 «어느 메일인지»를 잊었습니다 — 고른 것 전체에 박힙니다');
});

test('★★ 목록에서 열면 «고른 것»에 박는다 — 읽던 것에 안 박힌다', () => {
  const c = load();
  c.mbOwnerOne('B1', '1', null);            /* 먼저 읽는 화면에서 한 번 열었다 */
  c.mbOwnerMove(null);                      /* 그 뒤 목록에서 연다 */
  assert.equal(c.state.mbOwnOne, null,
    '목록에서 열었는데 아직 «그 한 통»에 매여 있습니다');
});
