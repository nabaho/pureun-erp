/* 푸른 메일 — 거래처 담당자가 바뀌었을 때 (대표 물음 2026-08-30)
   "직원의 메일인데 거래처에서 담당자가 바뀌어서 새로운 메일로 자료가 왔거나,
    추가 담당자가 생겨 메일이 오면, 그 메일을 체크해서 기업정보함에 정리 보관시키고
    업무관리·급여데이터함에 자동으로 연결시킬 수 있나?"

   ★ 새로 만든 것은 «이 한 자리»뿐이다 — 주소가 업체 담당자 칸에 들어가면 나머지는
     저절로 이어진다(서버가 업체 기록을 네 겹까지 훑어 주소를 모은다).

   지키는 것.
   ① 도메인이 같으면 짚는다 · ② 본문에 업체 이름이 보이면 짚는다 (대표 결정 「둘 다」)
   ③ 무료메일은 «도메인으로» 안 짚는다 — 하나를 이으면 온 세상이 한 회사가 된다
   ④ 이미 아는 주소·우리 직원·「아니오」 한 주소는 안 묻는다
   ⑤ 짧은 업체 이름(세 글자 이하)으로는 안 짚는다 — 아무 데나 걸린다
   ⑥ 적을 때 «빈 칸만» 채운다 — 사람이 고쳐 둔 것을 메일 한 통이 지우면 안 된다
   ⑦ 전임자를 «안 지운다» — 「자리를 떠남」 표만 붙인다
   ⑧ 「늘었습니다」를 고르면 전임자에게 표를 안 붙인다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const fnrecv = fs.readFileSync(path.join(__dirname, '..', 'functions', 'mail-receive.js'), 'utf8');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

/* ── 업체 셋 ── */
const COS = [
  { id:'c1', name:'씨티에스(주)', bizNo:'1', typeCode:'자문', status:'active',
    managerMain:'P-002', email:'', primaryContactEmail:'lmk@ctstech.co.kr',
    primaryContactName:'이미경', primaryContactPhone:'041-555-1234',
    /* ⚠ 주소가 «둘» 이어야 도메인 짚기를 잴 수 있다 — 하나면 자기 자신뿐이라
         (e2 !== em) 에서 늘 걸러져, 가드를 떼도 아무 일이 안 일어난다. */
    contacts:[{ id:'a1', name:'이미경', role:'과장', email:'lmk@ctstech.co.kr', isPrimary:true },
              { id:'a2', name:'대표',   role:'대표', email:'boss@ctstech.co.kr' }] },
  { id:'c2', name:'한빛산업(주)', bizNo:'2', typeCode:'급여', status:'active',
    managerMain:'P-002', email:'gw@hanbit.kr', contacts:[] },
  /* ⚠ «무료메일»을 쓰는 업체 — 이것이 있어야 「무료메일도 도메인으로 짚는다」를 잰다.
       없으면 naver 로 짚을 상대가 아예 없어, 가드를 떼도 통과한다. */
  { id:'c4', name:'나라산업(주)', bizNo:'4', typeCode:'자문', status:'active',
    managerMain:'P-002', email:'nara.hr@naver.com', contacts:[] },
  /* ⚠ 짧은 이름 — 본문 아무 데나 걸리면 안 된다 */
  { id:'c3', name:'보문',        bizNo:'3', typeCode:'자문', status:'active',
    managerMain:'P-002', email:'x@bomun.kr', contacts:[] },
];
const DIR = [
  { sid:'P-001', name:'권형하', sortOrder:10, role:'admin',  title:'대표노무사', status:'active' },
  { sid:'P-002', name:'하윤서', sortOrder:20, role:'member', title:'노무사',     status:'active' },
];
const FOLDERS = { B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:9, unseen:0 } };

function load(over){
  const o = over || {};
  const held = { wrote:null, toasts:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'B1', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbDash:'topic', mbNew:null,
    mbOpen: o.open === undefined ? { slug:'B1', uid:'1', atts:[], text:o.body || '' } : o.open,
    items:{}, mbMineOpen:true
  }, o.state || {});
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  /* 업체 기록은 «표(object)» 꼴이다 — 앱이 실제로 만나는 모양 */
  const COBOX = { v: {} };
  COS.forEach(c => { COBOX.v[c.id] = c; });
  const dbRef = (p) => ({
    once: () => Promise.resolve({ val: () => (p === 'data/companies' ? COBOX : null) }),
    set: () => Promise.resolve(), remove: () => Promise.resolve(),
    update: (u) => { held.wrote = u; return Promise.resolve(); },
    orderByKey(){ return this; }, limitToLast(){ return this; } });
  const rootRef = { update: (u) => { held.wrote = u; return Promise.resolve(); } };
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
    toast(m){ held.toasts.push(String(m||'')); }, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    mailWriteHtml: () => '', wireMailWrite(){}, redrawCompose(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderMailPage(){}, renderPCSide(){},
    document: { getElementById: el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    $: el,
    firebase: { auth: () => ({ currentUser:{ uid:'U1', email:'p001@pureun.kr' } }),
      database: () => Object.assign(function(){ return rootRef; },
        { ref: (p) => (p === undefined ? rootRef : dbRef(p)) }) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok:true }) })
  };
  /* firebase.database().ref() 를 인자 없이 부르는 자리가 있다 */
  ctx.firebase.database = () => ({ ref: (p) => (p === undefined ? rootRef : dbRef(p)) });
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  const MSGS = { B1: { '1': Object.assign({ u:1, f:'정하늘', e:'ha.jung@ctstech.co.kr',
    t:'x@daum.net', s:'8월 급여자료 송부드립니다', d:1756000001, r:1, g:0, a:0, z:1, p:'' },
    o.row || {}) } };
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbSucc = {};' +
    '_mbOwner = ' + JSON.stringify(o.owner || {}) + ';' +
    '_mbCo = ' + JSON.stringify(o.co || {}) + ';' +
    '_mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {}; _mbBinRule = {};' +
    '_mbNewSkip = ' + JSON.stringify(o.skip || {}) + ';' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const staff = {}, nameBySid = {};
  DIR.forEach(u => { nameBySid[u.sid] = u.name;
    staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
      role:u.role, title:u.title, status:u.status }; });
  const byName = {}, byBiz = {};
  COS.forEach(co => {
    const rec = { company:co.name, main:nameBySid[co.managerMain]||'', subs:[],
      type:co.typeCode||'', status:co.status, left:false, contact:'', phone:'', address:'',
      contacts:co.contacts||[] };
    byName[EM._norm(co.name)] = rec; byBiz[String(co.bizNo)] = rec;
  });
  EM.byName = byName; EM.byBiz = byBiz; EM.staff = staff;
  EM.companies = COS; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr';
  EM.nameByEmail = { 'p001@pureun.kr':'권형하' };
  ctx._held = held;
  ctx.__row = () => vm.runInContext('_mbMsgs.B1["1"]', ctx);
  return ctx;
}
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve();
                            await new Promise(r=>setImmediate(r)); };
const hint = c => c.mbNewCoHint(c.__row());

/* ══════ ①②③ 짚는 법 ══════ */

test('★★ 도메인이 같으면 «그 업체»로 짚는다', () => {
  const h = hint(load());
  assert.ok(h, '처음 보는 주소를 못 짚었습니다');
  assert.equal(h.co.name, '씨티에스(주)', '엉뚱한 업체를 짚었습니다: ' + h.co.name);
  assert.equal(h.why, '도메인', '무엇으로 짚었는지가 틀렸습니다: ' + h.why);
});

test('★★ 본문에 업체 이름이 보이면 짚는다 — 무료메일도 잡힌다', () => {
  const c = load({ row:{ e:'ha.jung@naver.com' }, body:'한빛산업(주) 경영지원팀입니다' });
  const h = hint(c);
  assert.ok(h, '본문의 업체 이름을 못 짚었습니다');
  assert.equal(h.co.name, '한빛산업(주)', '엉뚱한 업체입니다: ' + h.co.name);
  assert.equal(h.why, '이름', '무엇으로 짚었는지가 틀렸습니다: ' + h.why);
});

test('★★ 무료메일은 «도메인으로» 안 짚는다 — 하나를 이으면 온 세상이 한 회사가 된다', () => {
  /* 나라산업(주)이 naver 주소를 쓴다. 그래도 naver 도메인으로는 짚지 않는다 —
     이으면 네이버를 쓰는 온 세상이 나라산업이 된다. */
  const c = load({ row:{ e:'nobody@naver.com' }, body:'' });
  assert.equal(hint(c), null, '무료메일을 도메인으로 짚었습니다');
});

test('★★ 짧은 업체 이름으로는 안 짚는다 — 아무 데나 걸린다', () => {
  /* 「보문」은 두 글자다. 본문의 「보문사에 다녀왔습니다」에 걸리면 안 된다 */
  const c = load({ row:{ e:'someone@nowhere.kr' }, body:'주말에 보문사에 다녀왔습니다' });
  assert.equal(hint(c), null, '짧은 이름에 걸렸습니다');
});

/* ══════ ④ 안 묻는 자리 ══════ */

test('★★ 이미 아는 주소는 «안 묻는다»', () => {
  /* ⚠ 씨티에스에 주소가 둘이라, 가드를 떼면 도메인으로 짚혀 버린다 — 그래야 잰다. */
  const c = load({ row:{ e:'lmk@ctstech.co.kr' } });   /* 이미 적힌 담당자 */
  assert.equal(hint(c), null, '이미 아는 주소를 또 물었습니다');
});

test('★★ 우리 직원 주소는 «안 묻는다»', () => {
  /* ⚠ 본문에 업체 이름을 둔다 — 안 두면 가드를 떼도 짚을 것이 없어 검사가 헛돈다
       (2026-08-30 뮤테이션에서 잡음). */
  const c = load({ row:{ e:'p001@pureun.kr' }, body:'한빛산업(주) 건으로 회신드립니다' });
  assert.equal(hint(c), null, '우리 직원에게 물었습니다');
});

test('★★ 「아니오」 한 주소는 «다시 안 묻는다»', () => {
  const c0 = load();
  assert.ok(hint(c0), '밑그림이 틀렸습니다');
  const c = load({ skip:{ 'ha,jung@ctstech,co,kr':1 } });
  assert.equal(hint(c), null, '「아니오」 한 주소를 또 물었습니다');
});

test('★ 사람이 이미 담당자를 정한 주소는 «안 묻는다»', () => {
  const c = load({ owner:{ 'ha,jung@ctstech,co,kr':'하윤서' } });
  assert.equal(hint(c), null, '사람이 정해 둔 주소에 또 물었습니다');
});

/* ══════ 화면 ══════ */

test('★★ 메일 읽기 화면에 «묻는 띠»가 뜬다', () => {
  const c = load();
  const h = c.mbNewStripHtml(c.__row());
  assert.ok(h.indexOf('처음 보는 주소') >= 0, '묻는 띠가 없습니다');
  assert.ok(h.indexOf('씨티에스(주)') >= 0, '어느 업체인지 안 적혀 있습니다');
  assert.ok(/mbNewOpen\(/.test(h) && /mbNewNo\(/.test(h), '등록·아니오 단추가 없습니다');
});

test('★ 등록 창에 «전임자를 어떻게 할지» 묻는 자리가 있다', () => {
  const c = load();
  c.mbNewOpen('ha.jung@ctstech.co.kr', 'c1');
  const h = c.mbNewHtml();
  assert.ok(h.indexOf('바뀌었습니다') >= 0 && h.indexOf('늘었습니다') >= 0,
    '바뀐 것인지 늘어난 것인지 안 묻습니다');
  assert.ok(h.indexOf('이미경') >= 0, '전임자가 누구인지 안 보여 줍니다');
  assert.ok(h.indexOf('빈 칸만 채웁니다') >= 0, '무엇을 덮는지 안 알려 줍니다');
});

/* ══════ ⑥⑦⑧ 적는 법 ══════ */

test('★★ 담당자 한 줄이 «푸른이알피 업체 기록»에 들어간다', async () => {
  const c = load();
  c.mbNewOpen('ha.jung@ctstech.co.kr', 'c1');
  c.mbNewSet('name', '정하늘'); c.mbNewSet('role', '대리');
  c.mbNewSave();
  await flush();
  const up = c._held.wrote;
  assert.ok(up, '아무것도 안 적었습니다');
  const rec = up['data/companies/v/c1'];
  assert.ok(rec, '그 업체 자리에 안 적었습니다: ' + Object.keys(up).join(', '));
  const added = (rec.contacts||[]).filter(x => x.email === 'ha.jung@ctstech.co.kr')[0];
  assert.ok(added, '담당자 한 줄이 안 들어갔습니다');
  assert.equal(added.name, '정하늘', '이름이 안 들어갔습니다');
  assert.equal(added.role, '대리', '직위가 안 들어갔습니다');
});

test('★★ 전임자를 «안 지운다» — 「자리를 떠남」 표만 붙인다', async () => {
  const c = load();
  c.mbNewOpen('ha.jung@ctstech.co.kr', 'c1');
  c.mbNewMode('replace');
  c.mbNewSave();
  await flush();
  const rec = c._held.wrote['data/companies/v/c1'];
  const old = (rec.contacts||[]).filter(x => x.email === 'lmk@ctstech.co.kr')[0];
  assert.ok(old, '전임자를 지웠습니다 — 지난 메일이 담당 모름으로 쏟아집니다');
  assert.equal(old.left, true, '「자리를 떠남」 표가 안 붙었습니다');
});

test('★★ 「늘었습니다」를 고르면 전임자에게 «표를 안 붙인다»', async () => {
  const c = load();
  c.mbNewOpen('ha.jung@ctstech.co.kr', 'c1');
  c.mbNewMode('add');
  c.mbNewSave();
  await flush();
  const rec = c._held.wrote['data/companies/v/c1'];
  const old = (rec.contacts||[]).filter(x => x.email === 'lmk@ctstech.co.kr')[0];
  assert.ok(old && !old.left, '늘어난 것인데 전임자를 떠났다고 표시했습니다');
  /* ⚠ 수를 못 박지 않는다 — 밑그림에 담당자를 더하면 그때마다 깨진다.
       지킬 것은 「전임자가 하나도 안 떠났고, 한 분이 늘었다」이다. */
  const before = 2;                                  /* 밑그림의 씨티에스 담당자 수 */
  const left = (rec.contacts||[]).filter(x => x.left).length;
  assert.equal(left, 0, '늘어난 것인데 떠났다고 표시된 분이 있습니다 (' + left + '명)');
  assert.equal((rec.contacts||[]).length, before + 1, '한 분만 늘어야 합니다');
});

test('★★ 이미 적힌 값은 «안 덮는다» — 사람이 고쳐 둔 것을 메일이 지우면 안 된다', async () => {
  const c = load();
  c.mbNewOpen('ha.jung@ctstech.co.kr', 'c1');
  c.mbNewSet('phone', '041-555-0000');
  c.mbNewMode('replace');
  c.mbNewSave();
  await flush();
  const rec = c._held.wrote['data/companies/v/c1'];
  assert.equal(rec.primaryContactPhone, '041-555-1234',
    '이미 적힌 대표 연락처를 덮었습니다: ' + rec.primaryContactPhone);
});

test('★ 같은 주소를 «두 번» 등록하지 않는다', async () => {
  const c = load();
  c.mbNewOpen('lmk@ctstech.co.kr', 'c1');     /* 이미 있는 주소 */
  c.mbNewSave();
  await flush();
  assert.equal(c._held.wrote, null, '이미 있는 주소를 또 적었습니다');
  assert.ok(/이미 그 업체 담당자/.test(c._held.toasts.join(' | ')),
    '왜 안 되는지 안 알려 줍니다: ' + c._held.toasts.join(' | '));
});

test('★★ 등록한 뒤 «표를 다시 만든다» — 안 그러면 방금 넣은 담당자가 화면에 안 잡힌다', () => {
  const fn = cut('async function mbNewSave(){', '\n/* ══════════');
  assert.ok(/mbWhoBust\(\)/.test(fn), '주소↔담당자 표를 안 버립니다');
  assert.ok(/ErpMatch\.load\(\)/.test(fn), '업체 자료를 다시 안 읽습니다');
});

/* ══════ 그다음이 «저절로» 이어지는 근거 ══════ */

test('★★ 서버가 업체 기록을 «깊이» 훑어 주소를 모은다 — 그래서 급여데이터함이 저절로 잇는다', () => {
  /* ⚠ 이 검사가 이 기능의 «값»을 지킨다. 서버가 contacts 를 안 보게 되면
       담당자를 등록해도 급여자료가 공용 대기 칸에 그대로 쌓인다 — 화면만 봐서는
       왜 안 되는지 알 길이 없다. */
  const i = fnrecv.indexOf('function collectEmails');
  assert.ok(i > 0, '서버에서 주소를 모으는 자리를 못 찾았습니다');
  const seg = fnrecv.slice(i, i + 700);
  assert.match(seg, /depth > (\d)/, '몇 겹까지 훑는지 안 적혀 있습니다');
  const deep = Number((seg.match(/depth > (\d)/) || [])[1] || 0);
  assert.ok(deep >= 3, '업체 → contacts → 한 줄 → email 을 닿으려면 세 겹 넘게 훑어야 합니다 ('
    + deep + '겹)');
  assert.ok(/buildCompanyIndex/.test(fnrecv), '주소로 업체를 짚는 자리가 없습니다');
});
