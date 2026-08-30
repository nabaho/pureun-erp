/* 푸른 메일 — 전달할 때 첨부도 함께 (대표 결정 2026-08-30)

   여태 「첨부는 함께 가지 않습니다 — 내려받은 뒤 붙여 주세요」로 알리고 말았다.
   급여자료·계약서를 전달하는 일이 하루에도 여러 번인데, 그때마다 열고→내려받고→
   찾아 붙이는 세 걸음이 더 있었다.

   지키는 것.
   ① 전달하면 첨부가 «붙는다»
   ② 목록에서 전달하나 읽기 화면에서 전달하나 «같은 길»이다
   ③ 화면을 «먼저» 연다 — 첨부를 다 받은 뒤에 열면 몇 초 동안 아무 일도 안 일어난다
   ④ 8MB 넘는 것은 건너뛰되 «말해 준다» — 조용히 빠뜨리면 「보냈는데 없다」가 된다
   ⑤ 못 가져온 것도 말한다
   ⑥ 첨부가 없으면 서버에 «안 묻는다»
   ⑦ 열어 둔 메일이면 첨부 목록을 다시 «안 묻는다» */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
/* ⚠ 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시킨다. 여기서는 반대로,
     「예전에는 이랬다」고 적어 둔 주석이 «아직 그렇다»로 잡혔다(2026-08-30). */
const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

const FOLDERS = { B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:2, unseen:0 } };
const MSGS = { B1: {
  '1':{ u:1, f:'김대리', e:'a@hy.kr', t:'x@daum.net', s:'8월 급여자료', d:1756000001,
        r:1, g:0, a:2, z:1, p:'' },                       /* 첨부 둘 */
  '2':{ u:2, f:'박과장', e:'b@ga.kr', t:'x@daum.net', s:'회의록', d:1756000002,
        r:1, g:0, a:0, z:1, p:'' },                       /* 첨부 없음 */
} };
const ATTS = [
  { name:'임금대장.xlsx', size:120000, part:'2', mime:'application/vnd.ms-excel' },
  { name:'계약서.pdf',    size:340000, part:'3', mime:'application/pdf' },
];

function load(over){
  const o = over || {};
  const held = { fetched:[], opened:null, toasts:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:o.open || null, mbDash:'topic',
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
    toast(m){ held.toasts.push(String(m||'')); }, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(p){ held.opened = p; },
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    mailWriteHtml: () => '', wireMailWrite(){}, redrawCompose(){ held.drew = true; },
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderMailPage(){}, renderPCSide(){},
    document: { getElementById: el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    $: el,
    firebase: { auth: () => ({ currentUser:{ uid:'U1', email:'p001@pureun.kr',
        getIdToken: () => Promise.resolve('TOK') } }),
      database: () => ({ ref: dbRef }) },
    fetch: (url, opt) => {
      const body = JSON.parse((opt&&opt.body)||'{}');
      held.fetched.push({ url:String(url), body:body });
      if(/readMailMessage/.test(String(url)))
        return Promise.resolve({ json: () => Promise.resolve(
          { ok:true, html:'', text:'', atts: o.atts || ATTS }) });
      if(/readMailAttachment/.test(String(url))){
        const a = (o.atts || ATTS)[Number(body.index)] || {};
        if(o.failPart && String(a.part) === String(o.failPart))
          return Promise.resolve({ json: () => Promise.resolve({ ok:false, error:'못 가져왔습니다' }) });
        return Promise.resolve({ json: () => Promise.resolve(
          { ok:true, name:a.name, mime:a.mime, b64:'QUJD' }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({ ok:true }) });
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {};' +
    '_mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {}; _mbBinRule = {};' +
    '_compose = { to:"", subject:"", body:"", ids:[], files:[] };' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  EM.byName = {}; EM.byBiz = {}; EM.staff = {}; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr'; EM.nameByEmail = {};
  ctx._held = held;
  ctx.__files = () => vm.runInContext('(_compose && _compose.files) || []', ctx);
  return ctx;
}
/* ⚠ 붙이기는 «약속»으로 돈다 — 밀린 약속을 다 흘려보낸 뒤에 본다 */
const flush = async () => { for(let i=0;i<40;i++) await Promise.resolve();
                            await new Promise(r=>setImmediate(r)); };
const row = (c, uid) => c.mbAllRows().filter(v => String(v.u) === String(uid))[0];
const names = c => c.__files().map(f => f.name).join(' · ');

/* ══════ ① 붙는다 ══════ */

test('★★ 전달하면 첨부가 «붙는다» — 예전에는 안 간다고 알리고 말았다', async () => {
  const c = load();
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  await flush();
  assert.equal(names(c), '임금대장.xlsx · 계약서.pdf',
    '첨부가 안 붙었습니다: ' + names(c));
});

test('★★ 붙은 것이 «보낼 수 있는 모양»이다 — data: 로 시작하고 그 형식이 적혀 있다', async () => {
  const c = load();
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  await flush();
  const f = c.__files()[0];
  assert.ok(f, '붙은 것이 없습니다');
  assert.ok(/^data:application\/vnd\.ms-excel;base64,/.test(String(f.dataUrl||'')),
    '보낼 수 없는 모양입니다: ' + String(f.dataUrl||'').slice(0, 40));
});

test('★★ 「첨부는 함께 가지 않습니다」 라는 말이 «사라졌다»', () => {
  assert.ok(code.indexOf('첨부는 함께 가지 않습니다') < 0,
    '아직 안 간다고 알리는 자리가 남아 있습니다');
});

/* ══════ ② 두 자리가 같은 길 ══════ */

test('★★ 목록에서 전달하나 읽기 화면에서 전달하나 «같은 길»이다', () => {
  const one = src.slice(src.indexOf('function mbForwardOne'), src.indexOf('function mbTrashOne'));
  const many = src.slice(src.indexOf('function mbForward(){'), src.indexOf('function mbResend'));
  [['mbForwardOne', one], ['mbForward', many]].forEach(([nm, seg])=>{
    assert.ok(/mbFwdGo\(/.test(seg), nm + ' 이 한 길(mbFwdGo)을 안 씁니다');
    assert.ok(!/전달받은 메일입니다/.test(seg),
      nm + ' 이 머리글을 따로 만듭니다 — 두 벌이면 한쪽만 고쳐집니다');
  });
});

/* ══════ ③ 화면을 먼저 ══════ */

test('★★ 화면을 «먼저» 연다 — 첨부를 다 받은 뒤면 몇 초 동안 아무 일도 안 일어난다', () => {
  const c = load();
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  /* 아직 아무 약속도 안 흘렸는데 화면은 열려 있어야 한다 */
  assert.ok(c._held.opened, '화면이 첨부보다 늦게 열립니다');
  assert.ok(/\[전달\]/.test(String(c._held.opened.subject||'')), '제목이 안 붙었습니다');
  assert.ok(/전달받은 메일입니다/.test(String(c._held.opened.body||'')), '머리글이 안 붙었습니다');
});

/* ══════ ④⑤ 못 붙인 것을 말한다 ══════ */

test('★★ 8MB 넘는 것은 건너뛰되 «이름을 대고» 말한다 — 조용하면 보낸 뒤에 안다', async () => {
  const c = load({ atts: [ ATTS[0], { name:'큰파일.zip', size:9*1024*1024, part:'3' } ] });
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  await flush();
  assert.equal(names(c), '임금대장.xlsx', '큰 것까지 붙였습니다: ' + names(c));
  const said = c._held.toasts.join(' | ');
  assert.ok(said.indexOf('큰파일.zip') >= 0, '못 붙인 것의 이름을 안 알려 줍니다: ' + said);
});

test('★★ 못 가져온 것도 «이름을 대고» 말한다', async () => {
  const c = load({ failPart:'3' });
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  await flush();
  assert.equal(names(c), '임금대장.xlsx', '못 가져온 것이 붙었습니다: ' + names(c));
  const said = c._held.toasts.join(' | ');
  assert.ok(said.indexOf('계약서.pdf') >= 0, '못 가져온 것을 안 알려 줍니다: ' + said);
});

test('★ 하나가 안 되어도 «나머지는» 붙는다', async () => {
  const c = load({ failPart:'2' });
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  await flush();
  assert.equal(names(c), '계약서.pdf', '하나가 안 되니 통째로 실패했습니다: ' + names(c));
});

/* ══════ ⑥⑦ 헛일 안 한다 ══════ */

test('★★ 첨부가 없으면 서버에 «안 묻는다»', async () => {
  const c = load();
  c.mbFwdGo(row(c, 2), 'B1', 2, null);        /* 회의록 — 첨부 0 */
  await flush();
  assert.equal(c._held.fetched.length, 0, '첨부가 없는데 서버에 물었습니다');
  assert.ok(c._held.opened, '화면은 열려야 합니다');
});

test('★★ 열어 둔 메일이면 첨부 목록을 «다시 안 묻는다»', async () => {
  const c = load({ open: { slug:'B1', uid:'1', atts: ATTS } });
  c.mbForwardOne('B1', 1);
  await flush();
  const asked = c._held.fetched.filter(f => /readMailMessage/.test(f.url));
  assert.equal(asked.length, 0, '이미 손에 든 첨부 목록을 다시 물었습니다');
  assert.equal(names(c), '임금대장.xlsx · 계약서.pdf', '첨부가 안 붙었습니다: ' + names(c));
});

test('★ 첨부를 «한 개씩 차례로» 가져온다 — 한꺼번에 부르면 큰 것 여럿에서 막힌다', async () => {
  const c = load();
  c.mbFwdGo(row(c, 1), 'B1', 1, null);
  await flush();
  const got = c._held.fetched.filter(f => /readMailAttachment/.test(f.url));
  assert.equal(got.length, 2, '첨부를 다 안 가져왔습니다');
  assert.equal(Number(got[0].body.index), 0, '차례가 어긋났습니다');
  assert.equal(Number(got[1].body.index), 1, '차례가 어긋났습니다');
});
