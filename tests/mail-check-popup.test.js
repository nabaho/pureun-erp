/* 푸른 메일 — 메일함 점검 (대표 지시 2026-08-30)
   "자문으로 분류했는데 메일에는 급여사무대행으로 분류되어 있다. 이런부분도 추후에
    메일함에서 이상한 부분이 있으면 팝업형태로 정리해 달라."

   지키는 것.
   ① 분류가 다른 것을 «찾아낸다» — 푸른이알피 유형 ≠ 담긴 업무 칸의 유형
   ② 맞는 것은 «안 띄운다» — 다 띄우면 아무도 안 본다
   ③ 담당 모름 · 끝난 업체 · 겹친 주소도 함께 센다
   ④ 「넘어가기」한 것은 다시 안 뜬다
   ⑤ 칩은 «이상할 때만» 나타난다 (대표 결정 2026-08-30)
   ⑥ 로그인할 때는 «안 센다» — 열 때만 센다

   ⚠ ①은 「틀렸다」가 아니라 「봐 두시라」다. 자문 업체에도 급여 일로 메일이 온다.
     화면 글이 그렇게 적혀 있는지도 함께 본다 — 「고쳐라」로 읽히면 안 된다. */
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
   씨티에스(주)  자문   → 「2.급여+사무대행」 칸에 있다   ⇒ ① 에 걸려야 한다
   한빛산업      급여   → 「2.급여+사무대행」 칸에 있다   ⇒ 맞으므로 안 걸린다
   누리테크      자문   → 「1.자문」 칸에 있다            ⇒ 맞으므로 안 걸린다
   떠돌이주소           → 아무 데도 안 이어져 있다        ⇒ ② 담당 모름
   끝난사        종료   →                                 ⇒ ③ 끝난 업체
   겹친사/겹친사2       → 한 주소에 두 업체               ⇒ ④ 주소가 겹칩니다 */
const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10, role:'admin',  title:'대표노무사', status:'active' },
  { sid:'P-002', name:'하윤서', sortOrder:20, role:'member', title:'노무사',     status:'active' },
];
const COS = [
  { name:'씨티에스(주)', bizNo:'1', typeCode:'자문',     status:'active',
    managerMain:'P-002', email:'lmk@cts.co.kr' },
  { name:'한빛산업',     bizNo:'2', typeCode:'급여',     status:'active',
    managerMain:'P-002', email:'gw@hanbit.kr' },
  { name:'누리테크',     bizNo:'3', typeCode:'자문',     status:'active',
    managerMain:'P-002', email:'sy@nuri.kr' },
  /* ⚠ 끝난 업체에는 «담당 노무사를 두지 않는다» — 계약이 끝나면 실제로 담당이 빠진다.
       담당을 남겨 두면 이 업체가 「담당 모름」에 애초에 안 들어가, 「두 번 세지 않는다」를
       재는 검사가 헛돈다(2026-08-30 뮤테이션에서 잡음). */
  { name:'끝난사',       bizNo:'4', typeCode:'자문',     status:'closed',
    managerMain:'',      email:'end@ended.kr' },
  { name:'겹친사',       bizNo:'5', typeCode:'자문',     status:'active',
    managerMain:'P-002', email:'both@dup.kr' },
  { name:'겹친사2',      bizNo:'6', typeCode:'자문',     status:'active',
    managerMain:'P-002', email:'both@dup.kr' },
];
/* 칸 둘 — 이름에 «유형 낱말»이 들어 있어야 견줄 수 있다 */
const FOLDERS = {
  F1:{ path:'1.자문',         name:'1.자문',         kind:'custom', order:1, total:9, unseen:1 },
  F2:{ path:'2.급여+사무대행', name:'2.급여+사무대행', kind:'custom', order:2, total:9, unseen:1 },
};
const M = (u,e,s)=>({ u:u, f:'보낸이', e:e, t:'x@daum.net', s:s, d:1756000000+u,
                      r:0, g:0, a:0, z:1 });
const MSGS = {
  F1: { '1':M(1,'sy@nuri.kr',  '임금대장 확인'),        /* 자문 ↔ 자문 : 맞음 */
        '2':M(2,'nobody@x.kr', '어디서 온 메일'),       /* 담당 모름 */
        '3':M(3,'end@ended.kr','끝난 업체 메일'),       /* 끝난 업체 */
        '4':M(4,'both@dup.kr', '두 업체에 걸린 주소') },/* 겹친 주소 */
  F2: { '5':M(5,'lmk@cts.co.kr','등기임원 퇴직금 문의'), /* 자문 ↔ 급여+사무대행 : 어긋남 */
        '6':M(6,'lmk@cts.co.kr','두 번째 메일'),
        '7':M(7,'gw@hanbit.kr', '8월 급여자료') },      /* 급여 ↔ 급여 : 맞음 */
};

function load(over){
  const o = over || {};
  const held = { wrote:{}, removed:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'topic',
    items:{}, mbMineOpen:true
  }, o.state || {});
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const dbRef = (p) => ({ once: () => Promise.resolve({ val: () => null }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    remove: () => { held.removed.push(p); return Promise.resolve(); },
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
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast(m){ held.toast = String(m||''); }, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    mailWriteHtml: () => '', wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderMailPage(){ held.drew = (held.drew||0) + 1; },
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
    '_mbFolders = ' + JSON.stringify(o.folders || FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(o.msgs || MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {};' +
    '_mbOrder = {}; _mbWhoOrder = {};' +
    '_mbCkSkip = ' + JSON.stringify(o.skip || {}) + ';' +
    '_mbBinRule = ' + JSON.stringify(o.rule || {}) + ';' +
    '_mbMeta = { at:1, ok:true };', ctx);

  /* 푸른이알피 표를 «앱이 만드는 그대로» 채운다 — 손으로 지으면 진짜와 어긋난다 */
  const EM = vm.runInContext('ErpMatch', ctx);
  const staff = {}, nameBySid = {};
  DIR.forEach(u => { nameBySid[u.sid] = u.name;
    staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
      role:u.role, title:u.title, status:u.status }; });
  const byName = {}, byBiz = {};
  COS.forEach(co => {
    const st = String(co.status||'');
    const rec = { company:co.name, main:nameBySid[co.managerMain]||'', subs:[],
      type:co.typeCode||'', status:st,
      left:(st==='inactive'||st==='terminated'||st==='closed'),
      contact:'', phone:'', address:'', contacts:[] };
    byName[EM._norm(co.name)] = rec;
    byBiz[String(co.bizNo)] = rec;
  });
  EM.byName = byName; EM.byBiz = byBiz; EM.staff = staff;
  EM.companies = COS; EM.ready = true;
  ctx.ErpMatch = EM;
  ctx.myEmail = 'p001@pureun.kr';
  EM.nameByEmail = { 'p001@pureun.kr': '권형하' };
  ctx._held = held;
  ctx.__ck  = () => vm.runInContext('_mbCk', ctx);
  ctx.__put  = () => vm.runInContext('_mbPut', ctx);
  ctx.__rule = () => vm.runInContext('_mbBinRule', ctx);
  /* ⚠ 열쇠 모양을 «손으로 적지 않는다» — mbWhoKey 는 점을 ',' 로 바꾼다.
       '_' 로 적었다가 규칙이 한 번도 안 걸려 그 검사가 통째로 헛돌았다(2026-08-30). */
  ctx.__setRule = (em, binId) => vm.runInContext(
    '_mbBinRule[mbWhoKey(' + JSON.stringify(em) + ')] = ' + JSON.stringify(binId) + ';mbMemoClear();', ctx);
  ctx.__setPut = (k,b) => vm.runInContext('_mbPut[' + JSON.stringify(k) + '] = ' + JSON.stringify(b) + ';mbMemoClear();', ctx);
  return ctx;
}
const find = (list, co) => list.filter(x => x.co === co)[0];

/* ══════ ① 분류가 다른 것을 찾아낸다 ══════ */

test('★★ 자문 업체 메일이 「급여+사무대행」 칸에 있으면 «찾아낸다»', () => {
  const c = load();
  const r = c.mbCheckAll();
  const x = find(r.mix, '씨티에스(주)');
  assert.ok(x, '어긋난 분류를 못 찾았습니다: ' + JSON.stringify(r.mix.map(m=>m.co)));
  assert.equal(x.erp, '자문', '푸른이알피 유형을 잘못 읽었습니다');
  assert.ok(x.bin.indexOf('급여') >= 0, '담긴 칸을 잘못 읽었습니다: ' + x.bin);
  assert.equal(x.n, 2, '같은 업체 메일 2통을 «한 줄»로 묶어야 합니다 (' + x.n + ')');
});

test('★★ «맞는» 것은 안 띄운다 — 다 띄우면 아무도 안 본다', () => {
  const c = load();
  const r = c.mbCheckAll();
  ['한빛산업', '누리테크'].forEach(nm =>
    assert.ok(!find(r.mix, nm), nm + ' 은 유형과 칸이 맞는데 띄웠습니다'));
});

test('★ 유형 낱말이 «없는» 칸은 견주지 않는다 — 「받은편지함」을 어긋났다고 하면 안 된다', () => {
  const c = load();
  assert.equal(c.mbCkTypesOf('받은편지함').join(','), '', '유형이 아닌 이름에서 유형을 읽었습니다');
  assert.equal(c.mbCkTypesOf('2.급여+사무대행').join(','), '급여,사무대행',
    '칸 이름에서 유형을 못 읽었습니다');
});

/* ══════ ② 나머지 세 갈래 ══════ */

test('★ 담당을 모르는 주소를 센다', () => {
  const c = load();
  const r = c.mbCheckAll();
  assert.ok(r.none.filter(x=>x.em === 'nobody@x.kr').length,
    '담당 모름을 못 찾았습니다: ' + JSON.stringify(r.none.map(x=>x.em)));
});

test('★ 끝난 업체 메일을 센다 — 그리고 「담당 모름」으로 «두 번» 세지 않는다', () => {
  const c = load();
  const r = c.mbCheckAll();
  assert.ok(find(r.ended, '끝난사'), '끝난 업체를 못 찾았습니다');
  assert.ok(!r.none.filter(x=>x.em === 'end@ended.kr').length,
    '끝난 업체를 「담당 모름」으로도 셌습니다 — 한 통이 두 곳에 뜹니다');
});

test('★★ 한 주소가 두 업체에 이어진 것을 찾아낸다', () => {
  const c = load();
  const r = c.mbCheckAll();
  const x = r.dup.filter(y=>y.em === 'both@dup.kr')[0];
  assert.ok(x, '겹친 주소를 못 찾았습니다: ' + JSON.stringify(r.dup.map(y=>y.em)));
  assert.ok(x.cos.length >= 2, '겹친 업체 이름을 안 적었습니다: ' + JSON.stringify(x.cos));
});

/* ══════ ③ 넘어가기 ══════ */

test('★★ 「넘어가기」한 것은 다시 안 뜬다', () => {
  const c = load();
  const x = find(c.mbCheckAll().mix, '씨티에스(주)');
  c.mbCheckSkip(x.key);
  assert.ok(!find(c.__ck().mix, '씨티에스(주)'), '넘어갔는데 또 떴습니다');
  const saved = Object.keys(c._held.wrote).filter(k=>k.indexOf('mailCheckSkip') >= 0);
  assert.ok(saved.length, '넘어간 것을 저장하지 않았습니다 — 다음에 열면 또 뜹니다');
});

test('★★ 저장 열쇠에 점이 들어가지 않는다 — 들어가면 저장이 통째로 실패한다', () => {
  /* ⚠ 「담당 모름」의 열쇠는 «이메일»이라 점이 반드시 들어 있다. 어긋남 열쇠(업체 이름)만
       보면 점이 없어 이 검사가 헛돈다 — 실제로 그랬다(2026-08-30 뮤테이션에서 잡음). */
  const c = load();
  const x = c.mbCheckAll().none.filter(y => y.em === 'nobody@x.kr')[0];
  assert.ok(x, '밑그림에 담당 모름이 있어야 합니다');
  assert.ok(x.key.indexOf('.') >= 0, '밑그림의 열쇠에 점이 들어 있어야 합니다: ' + x.key);
  assert.ok(!/[.#$/\[\]]/.test(c.mbCkKey(x.key)),
    '실시간DB가 못 받는 글자가 남았습니다: ' + c.mbCkKey(x.key));
  c.mbCheckSkip(x.key);
  const saved = Object.keys(c._held.wrote).filter(p => p.indexOf('mailCheckSkip') >= 0);
  assert.ok(saved.length, '넘어간 것을 저장하지 않았습니다');
  saved.forEach(p => assert.ok(!/mailCheckSkip\/.*[.#$\[\]]/.test(p),
    '저장 자리에 못 쓰는 글자가 있습니다: ' + p));
});

/* ══════ ④ 칸으로 옮기기 ══════ */

test('★★ 「자문 칸으로」를 누르면 그 주소 메일이 «다» 옮겨진다', () => {
  const c = load();
  const x = find(c.mbCheckAll().mix, '씨티에스(주)');
  assert.equal(x.n, 2, '밑그림에 그 업체 메일이 2통 있어야 합니다');
  c.mbCheckMoveTo(x.key);
  /* ⚠ 「그 한 통」이 아니라 «그 주소에서 온 것 전부»가 가야 한다.
       한 통만 옮기면 다음에 열었을 때 같은 것이 또 떠서, 눌러도 안 사라지는 것처럼 보인다.
     ⚠★ 2026-08-30 부터 쪽지가 아니라 «규칙 한 줄»로 정한다(대표 지시). 그래야
        «앞으로 올 메일»도 함께 간다 — 쪽지는 지난 것만 옮기고 내일 또 어긋났다. */
  const rule = c.__rule();
  assert.equal(rule[c.mbWhoKey(x.em)], 'F1',
    '규칙으로 정해 두지 않았습니다: ' + JSON.stringify(rule));
  const gone = c.mbCkRows().filter(v => String(v.e||'').toLowerCase() === x.em)
    .map(v => { const b = c.mbBinOfRow(v); return b ? b.id : ''; });
  assert.equal(gone.join(','), 'F1,F1', '그 주소 메일이 다 안 갔습니다: ' + gone.join(','));
  assert.ok(!find(c.mbCheckAll().mix, '씨티에스(주)'),
    '옮겼는데 아직 어긋난 것으로 남아 있습니다');
});

test('★★ 정해 둔 규칙은 «앞으로 올 메일»에도 걸린다 — 쪽지였다면 내일 또 어긋난다', () => {
  const c = load();
  const x = find(c.mbCheckAll().mix, '씨티에스(주)');
  c.mbCheckMoveTo(x.key);
  /* 내일 같은 주소에서 «새 메일»이 「2.급여+사무대행」 폴더로 들어온다 */
  const fresh = { u:99, f:'보낸이', e:'lmk@cts.co.kr', t:'x@daum.net', s:'내일 온 메일',
                  d:1756009999, r:0, g:0, a:0, z:1, _slug:'F2', _key:'F2:99' };
  const bin = c.mbBinOfRow(fresh);
  assert.ok(bin && bin.id === 'F1',
    '새로 온 메일이 규칙을 안 따릅니다: ' + (bin ? bin.name : '(칸 없음)'));
});

test('★★ 「이 한 통만 따로」 옮긴 것은 규칙에 «안 눌린다»', () => {
  /* ⚠ 눌리면 「분류」 단추가 뜻을 잃는다 — 눌러도 도로 규칙 칸으로 가 버린다 */
  const c = load();
  const x = find(c.mbCheckAll().mix, '씨티에스(주)');
  c.mbCheckMoveTo(x.key);                       /* 그 주소는 «자문 칸»으로 정해 둔다 */
  const one = c.mbCkRows().filter(v => String(v.e||'').toLowerCase() === x.em)[0];
  c.__setPut(one._key, 'F2');                   /* 그 가운데 한 통만 손으로 되돌린다 */
  const b = c.mbBinOfRow(one);
  assert.ok(b && b.id === 'F2', '손으로 옮긴 한 통이 규칙에 눌렸습니다: ' + (b ? b.name : '(없음)'));
});

test('★★ 지워진 칸을 가리키는 규칙은 «없는 셈» 친다 — 아니면 그 메일이 사라진다', () => {
  const c = load();
  c.__setRule('lmk@cts.co.kr', 'ZZZ');            /* 그런 칸은 없다 */
  const v = c.mbCkRows().filter(x => String(x.e||'').toLowerCase() === 'lmk@cts.co.kr')[0];
  const b = c.mbBinOfRow(v);
  assert.ok(b && b.id === 'F2', '지워진 칸을 가리키는 규칙을 그대로 따랐습니다: '
    + (b ? b.name : '(어느 칸에도 없음)'));
  /* 목록에서도 제자리에 있어야 한다 — 딱지만 맞고 목록에서 빠지면 사라진 것과 같다 */
  assert.ok(c.mbRowFits(v, 'F2'), '지워진 칸 규칙 때문에 목록에서 빠졌습니다');
});

test('★★ 규칙은 «목록»에도 걸린다 — 딱지만 바뀌고 목록이 그대로면 두 곳에 겹쳐 보인다', () => {
  const c = load();
  c.__setRule('lmk@cts.co.kr', 'F1');             /* 「2.급여+사무대행」 에 있는 것을 자문 칸으로 */
  const v = c.mbCkRows().filter(x => String(x.e||'').toLowerCase() === 'lmk@cts.co.kr')[0];
  assert.ok(c.mbRowFits(v, '~F1'), '정한 칸의 목록에 안 나옵니다');
  assert.ok(!c.mbRowFits(v, '~F2'), '옛 칸의 목록에도 그대로 남아 있습니다 — 두 곳에 겹칩니다');
  assert.ok(!c.mbRowFits(v, 'F2'), '제 폴더 목록에도 그대로 남아 있습니다');
});

test('★ 정해 둔 것을 «무를» 수 있다 — 무르면 다시 다음메일 자리로', () => {
  const c = load();
  const x = find(c.mbCheckAll().mix, '씨티에스(주)');
  c.mbCheckMoveTo(x.key);
  const list = c.mbRuleList();
  assert.ok(list.length, '정해 둔 것이 목록에 안 보입니다');
  c.mbRuleUndo(list[0].key);
  const v = c.mbCkRows().filter(y => String(y.e||'').toLowerCase() === x.em)[0];
  const b = c.mbBinOfRow(v);
  assert.ok(b && b.id === 'F2', '물렀는데 제자리로 안 돌아왔습니다: ' + (b ? b.name : '(없음)'));
});

test('★ 옮길 «칸이 없으면» 조용히 넘어가지 않고 말해 준다', () => {
  /* 「급여+사무대행」 칸만 있는 메일함 — 「자문」이 든 칸이 없다 */
  const c = load({ folders: { F2: FOLDERS.F2 },
                   msgs: { F2: { '5': M(5, 'lmk@cts.co.kr', '등기임원 퇴직금 문의') } } });
  const x = find(c.mbCheckAll().mix, '씨티에스(주)');
  assert.ok(x, '밑그림이 틀렸습니다 — 어긋난 것이 있어야 합니다');
  c.mbCheckMoveTo(x.key);
  assert.ok(String(c._held.toast||'').indexOf('칸이 없습니다') >= 0,
    '옮길 칸이 없는데 아무 말도 안 합니다: ' + c._held.toast);
});

/* ══════ ⑤ 칩 · ⑥ 언제 세나 ══════ */

test('★★ 칩은 «이상할 때만» 나타난다 (대표 결정 2026-08-30)', () => {
  const c = load();
  c.mbCheckAll();
  assert.ok(c.mbCkCount() > 0, '밑그림에 이상한 것이 있어야 합니다');
  assert.ok(c.mbListHtml().indexOf('mck-chip') >= 0, '이상한데 칩이 없습니다');

  /* 아무것도 이상하지 않은 메일함 — 자문 업체가 자문 칸에만 있다 */
  const ok = load({ msgs: { F1: { '1': M(1, 'sy@nuri.kr', '임금대장 확인') } } });
  ok.mbCheckAll();
  assert.equal(ok.mbCkCount(), 0, '깨끗한데 이상하다고 셌습니다: '
    + JSON.stringify(ok.__ck()));
  assert.ok(ok.mbListHtml().indexOf('mck-chip') < 0, '깨끗한데 칩이 떴습니다');
});

test('★★ 로그인할 때는 «안 센다» — 옆줄을 그릴 때 세면 또 느려진다', () => {
  const c = load();
  c.mailSideHtml();
  assert.equal(c.__ck(), null, '옆줄을 그리면서 점검을 셌습니다 — 로그인이 느려집니다');
});

/* ══════ ⑦ 화면 글 ══════ */

test('★★ 「틀렸다」가 아니라 「봐 두시라」로 적혀 있다', () => {
  const c = load();
  c.mbCheckOpen();
  const h = c.mbCheckHtml();
  assert.ok(h.indexOf('틀렸다는 뜻은 아닙니다') >= 0,
    '어긋남을 「틀렸다」로 읽히게 적었습니다 — 자문 업체에도 급여 일로 메일이 옵니다');
  assert.ok(h.indexOf('씨티에스') >= 0, '찾은 것이 창에 안 나옵니다');
  assert.ok(h.indexOf('넘어가기') >= 0, '넘어갈 길이 없습니다');
});

test('★ 볼 것이 없는 갈래는 «깨끗하다»고 말한다 — 빈 화면은 고장으로 보인다', () => {
  const c = load({ msgs: { F1: { '1': M(1, 'sy@nuri.kr', '임금대장 확인') } } });
  c.mbCheckOpen();
  assert.ok(c.mbCheckHtml().indexOf('깨끗합니다') >= 0, '빈 칸에 아무 말도 없습니다');
});
