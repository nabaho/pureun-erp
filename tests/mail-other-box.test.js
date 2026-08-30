/* 푸른 메일 — 「그 밖」 칸 (대표 지시 2026-08-30
     「담당자에게 지정되지 않는 메일 어떻게 할지 정리해라」)

   ★ 무엇이었나 — 「자문사 아님」으로 치운 곳(노동청·근로복지공단·상공회의소·타
     노무법인·뉴스레터)이 «잇는 목록»에서만 빠지고 「담당 모름」 칸에는 그대로
     쌓였다. 실측 2026-08-29 로 그런 곳이 1,932통(187곳)이라, 대표 화면의
     「담당 모름 1,582」가 거의 그것이었다 — 정작 이어야 할 자문사가 그 속에 묻힌다.

   지키는 것.
   ① 치운 곳은 「담당 모름」에서 «빠진다» — 정말 이어야 할 것만 남는다
   ② 그 메일은 「그 밖」 칸에서 «그대로 보인다» — 화면에서 사라지면 안 된다
   ③ 담당자가 잡히면 «그 사람 칸»이 먼저다 — 치워 둔 주소라도
   ④ 세는 곳과 거르는 곳이 «같은 차례»로 본다 — 다르면 「1,582통인데 열면 60통」
   ⑤ 업무 칸에는 그대로 있다 — 담당자 칸은 자리가 아니라 거르개다
   ⑥ 되돌리면 곧바로 담당 모름으로 돌아간다 — 두 곳이 같은 표를 본다 */
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

/* ── 밑그림 ──
   하윤사   a@hy.kr    자문사 · 담당 하윤서   → 담당자 칸
   노동청   labor@moel.go.kr  「자문사 아님」  → 그 밖
   공단     kcomwel@comwel.or.kr 「자문사 아님」 → 그 밖
   모르는곳 who@nowhere.kr   아무것도 아님     → 담당 모름
   박아둔곳 fix@moel.go.kr  「자문사 아님」인데 사람이 담당자를 박음 → 담당자 칸 */
const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10, role:'admin',  title:'대표노무사', status:'active' },
  { sid:'P-002', name:'하윤서', sortOrder:20, role:'member', title:'노무사',     status:'active' },
];
const COS = [
  { id:'c1', name:'하윤사', bizNo:'1', typeCode:'자문', status:'active',
    managerMain:'P-002', email:'a@hy.kr', contacts:[] },
];
const FOLDERS = { B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:9, unseen:5 } };
const M = (u,e,r)=>({ u:u, f:'보낸이', e:e, t:'x@daum.net', s:'제목'+u,
                      d:1756000000+u, r:r===undefined?0:r, g:0, a:0, z:1, p:'' });
const MSGS = { B1: {
  '1':M(1,'a@hy.kr'), '2':M(2,'a@hy.kr',1),
  '3':M(3,'labor@moel.go.kr'), '4':M(4,'labor@moel.go.kr',1),
  '5':M(5,'kcomwel@comwel.or.kr'),
  '6':M(6,'who@nowhere.kr'),
  '7':M(7,'fix@moel.go.kr'),
} };

function load(over){
  const o = over || {};
  const held = {};
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'who',
    items:{}, mbMineOpen:true
  }, o.state || {});
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const dbRef = () => ({ once:()=>new Promise(()=>{}), set:()=>Promise.resolve(),
    remove:()=>Promise.resolve(), update:()=>Promise.resolve(),
    orderByKey(){ return this; }, limitToLast(){ return this; } });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout:()=>0, clearTimeout(){}, atob:()=>'', state,
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
    toast(){}, confirm:()=>true, closeFolderMenu(){},
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
  /* 「자문사 아님」으로 치운 곳 — 열쇠는 앱이 만든다(mbWhoKey) */
  const notco = o.notco === undefined
    ? { 'labor@moel,go,kr':1, 'kcomwel@comwel,or,kr':1, 'fix@moel,go,kr':1 } : o.notco;
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbSucc = {}; _mbCo = {};' +
    '_mbOwner = ' + JSON.stringify(o.owner || { 'fix@moel,go,kr':'권형하' }) + ';' +
    '_mbNotCo = ' + JSON.stringify(notco) + ';' +
    '_mbWhoMsg = {}; _mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {};' +
    '_mbBinRule = {}; _mbNewSkip = {}; _mbMeta = { at:1, ok:true };', ctx);
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
  return ctx;
}
/* 그 칸에 «실제로» 담기는 통수 — 거르개를 그대로 지난다.
   ⚠ mbAllRows 를 쓰면 안 된다 — 그것은 «지금 보는 칸»에 맞는 것만 돌려주므로
     여기서 또 거르면 두 번 걸러진다(2026-08-30 에 그것으로 헛돌았다).
     mbCkRows 는 손에 든 «모든» 줄을 준다. */
const inBox = (c, id) => c.mbCkRows().filter(v => c.mbRowFits(v, id)).length;

/* ══════ ①② 갈래 나누기 ══════ */

test('★★ 「자문사 아님」으로 치운 곳은 「담당 모름」에서 «빠진다»', () => {
  const c = load();
  /* 담당 모름에 남아야 할 것은 who@nowhere.kr 한 통뿐이다 */
  assert.equal(c.mbWhoNoneCount().n, 1,
    '담당 모름이 안 줄었습니다 (' + c.mbWhoNoneCount().n + '통)');
});

test('★★ 그 메일은 「그 밖」 칸에서 «그대로 보인다» — 화면에서 사라지면 안 된다', () => {
  const c = load();
  assert.equal(c.mbOtherCount().n, 3,
    '「그 밖」에 안 담겼습니다 (' + c.mbOtherCount().n + '통)');
  assert.equal(inBox(c, '@#'), 3, '「그 밖」 칸을 열면 안 나옵니다');
});

test('★★ 한 통이 «두 곳에» 겹치지 않는다 — 겹치면 몇 통인지 알 수 없다', () => {
  const c = load();
  const na = inBox(c, '@?'), oth = inBox(c, '@#');
  assert.equal(na, 1, '담당 모름 통수가 다릅니다');
  assert.equal(oth, 3, '그 밖 통수가 다릅니다');
  /* 같은 줄이 둘 다에 들어가면 안 된다 */
  const both = c.mbCkRows().filter(v => c.mbRowFits(v, '@?') && c.mbRowFits(v, '@#'));
  assert.equal(both.length, 0, '한 통이 두 칸에 겹칩니다 (' + both.length + '통)');
});

/* ══════ ③ 담당자가 먼저 ══════ */

test('★★ 담당자가 잡히면 «그 사람 칸»이 먼저다 — 치워 둔 주소라도', () => {
  const c = load();
  /* fix@moel.go.kr 는 치워 두었지만 사람이 권형하 담당으로 박았다 */
  assert.equal(c.mbOtherCount().n, 3, '박아 둔 것까지 「그 밖」으로 갔습니다');
  assert.ok(inBox(c, '@권형하') >= 1, '박아 둔 담당자 칸에 안 들어갔습니다');
});

/* ══════ ④ 두 곳이 같은 차례 ══════ */

test('★★ 세는 곳과 거르는 곳이 «같은 답»을 낸다 — 다르면 「1,582통인데 열면 60통」', () => {
  const c = load();
  assert.equal(inBox(c, '@#'), c.mbOtherCount().n,
    '「그 밖」 — 옆줄 숫자와 칸 안이 다릅니다');
  assert.equal(inBox(c, '@?'), c.mbWhoNoneCount().n,
    '「담당 모름」 — 옆줄 숫자와 칸 안이 다릅니다');
  const who = c.mbWhoList().filter(w => w.name === '하윤서')[0];
  assert.ok(who, '담당자가 안 잡혔습니다');
  assert.equal(inBox(c, '@하윤서'), who.n, '담당자 칸 — 옆줄 숫자와 칸 안이 다릅니다');
});

/* ══════ ⑤ 업무 칸은 그대로 ══════ */

test('★★ 업무 칸에는 «그대로» 있다 — 담당자 칸은 자리가 아니라 거르개다', () => {
  const c = load();
  assert.equal(inBox(c, 'B1'), 7, '업무 칸에서 메일이 빠졌습니다 (' + inBox(c, 'B1') + '통)');
});

/* ══════ ⑥ 되돌리기 ══════ */

test('★★ 치운 것을 되돌리면 «곧바로» 담당 모름으로 돌아간다', () => {
  const c = load({ notco:{} });          /* 아무것도 안 치웠다 */
  assert.equal(c.mbOtherCount().n, 0, '안 치웠는데 「그 밖」에 있습니다');
  /* 노동청 둘 + 공단 하나 + 모르는곳 하나 = 넷 (박아 둔 것은 담당자 칸으로) */
  assert.equal(c.mbWhoNoneCount().n, 4,
    '되돌렸는데 담당 모름으로 안 돌아왔습니다 (' + c.mbWhoNoneCount().n + '통)');
});

/* ══════ 화면 ══════ */

test('★★ 옆줄에 「그 밖」 줄이 있다 — 0통이어도 남는다(되돌릴 자리가 여기뿐이다)', () => {
  const c = load({ notco:{} });          /* 0통 */
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('그 밖') >= 0, '0통이라고 줄이 사라졌습니다 — 되돌릴 자리가 없어집니다');
  assert.ok(h.indexOf(">openMailBox('@#')") >= 0 || h.indexOf("openMailBox('@#')") >= 0,
    '그 칸을 열 길이 없습니다');
});

test('★ 「그 밖」 줄이 «담당 모름 바로 아래»다 — 둘은 한 갈래다', () => {
  const c = load();
  const h = c.mailSideHtml();
  const na = h.indexOf('담당 모름'), oth = h.indexOf('그 밖'), en = h.indexOf('자문종료');
  assert.ok(na > 0 && oth > na, '「그 밖」이 담당 모름보다 위에 있습니다');
  assert.ok(en > oth, '「그 밖」이 자문종료보다 아래에 있습니다');
});

test('★ 창 제목이 「그 밖」이다 — 어느 칸을 보는지 알아야 한다', () => {
  const c = load();
  assert.ok(String(c.mbBoxName('@#')).indexOf('그 밖') >= 0,
    '칸 이름이 안 붙었습니다: ' + c.mbBoxName('@#'));
});

test('★★ 숫자는 «안 읽은 수»만 — 다른 줄과 오른쪽이 어긋나면 안 된다', () => {
  const c = load();
  const h = c.mailSideHtml();
  const i = h.indexOf('>그 밖<');
  assert.ok(i > 0, '「그 밖」 줄이 없습니다');
  const row = h.slice(h.lastIndexOf('<div class="dm-f', i), h.indexOf('</div>', i) + 6);
  assert.ok(!/class="n">/.test(row), '전체 통수가 붙어 있습니다 — 안 읽은 수만 적습니다');
});
