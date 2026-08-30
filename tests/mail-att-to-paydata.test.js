/* 푸른 메일 — 첨부를 «급여데이터함으로» 바로 (대표 결정 2026-08-30)

   급여자료가 메일로 오면 여태 내려받아 → 급여데이터함을 열어 → 다시 올리는 세
   걸음이었다. 서버가 10분마다 스스로 훑는 길은 «아는 곳에서 온 것»만 담는다.

   지키는 것.
   ① 첨부마다 「→ 급여데이터함」이 있다
   ② 화면이 창고에 «직접 안 쓴다» — 서버가 대신 담는다(규칙을 새로 안 연다)
   ③ 보낸이·제목을 함께 보낸다 — 서버가 그것으로 임자를 짚는다
   ④ 어디로 갔는지 «말해 준다». 공용 칸에 남았으면 그 까닭까지
   ⑤ 서버는 첨부 목록 «안»의 조각만 꺼낸다 — 아무 조각이나 되면 본문이 새어 나간다
   ⑥ 서버가 창고에 담는 길을 «새로 짓지 않는다» — 스스로 훑을 때와 같은 길이다
   ⑦ 판독을 여기서 돌리지 않는다 — 주민번호 가림을 건너뛰게 된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src   = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const fnsrc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8');
const idx   = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}
/* 서버 창구 한 덩이만 잘라 본다 */
function fnPart(){
  const i = fnsrc.indexOf('mailAttToPaydata: F');
  assert.ok(i > 0, '서버에 넘기는 창구가 없습니다');
  const j = fnsrc.indexOf('본문까지 찾기', i);
  assert.ok(j > i, '창구 끝을 못 찾았습니다');
  return fnsrc.slice(i, j);
}

const FOLDERS = { B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:1, unseen:0 } };
const MSGS = { B1: { '1':{ u:1, f:'김대리', e:'a@hy.kr', t:'x@daum.net',
  s:'8월 급여자료 보냅니다', d:1756000001, r:1, g:0, a:1, z:1, p:'' } } };
const ATTS = [{ name:'임금대장.xlsx', size:120000, part:'2', mime:'application/vnd.ms-excel' }];

function load(over){
  const o = over || {};
  const held = { fetched:[], toasts:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbDash:'topic',
    mbOpen: o.open === undefined ? { slug:'B1', uid:'1', atts: ATTS, html:'', text:'' } : o.open,
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
    $: el, URL:{ createObjectURL: () => 'blob:x', revokeObjectURL(){} },
    firebase: { auth: () => ({ currentUser:{ uid:'U1', email:'p001@pureun.kr',
        getIdToken: () => Promise.resolve('TOK') } }),
      database: () => ({ ref: dbRef }) },
    fetch: (url, opt) => {
      held.fetched.push({ url:String(url), body: JSON.parse((opt&&opt.body)||'{}') });
      return Promise.resolve({ json: () => Promise.resolve(o.reply
        || { ok:true, id:'x1', seat:'s01', shared:false, why:'', name:'임금대장.xlsx', bytes:120000 }) });
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
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  EM.byName = {}; EM.byBiz = {}; EM.staff = {}; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr'; EM.nameByEmail = {};
  ctx._held = held;
  return ctx;
}
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve();
                            await new Promise(r=>setImmediate(r)); };

/* ══════ ① 화면 ══════ */

test('★★ 첨부마다 「급여데이터함으로」가 있다', () => {
  const c = load();
  const h = c.mbReadHtml();
  assert.ok(h.indexOf('mbAttToPay(0)') >= 0, '넘기는 단추가 없습니다');
  assert.ok(h.indexOf('mbAtt(0)') >= 0, '내려받기가 사라졌습니다 — 둘 다 있어야 합니다');
});

test('★ 첨부가 없으면 단추도 없다', () => {
  const c = load({ open: { slug:'B1', uid:'1', atts: [], html:'', text:'' } });
  assert.ok(c.mbReadHtml().indexOf('mbAttToPay') < 0, '첨부가 없는데 단추가 있습니다');
});

/* ══════ ②③ 서버에 맡긴다 ══════ */

test('★★ 화면이 창고에 «직접 안 쓴다» — 서버에 맡긴다', async () => {
  const c = load();
  c.mbAttToPay(0);
  await flush();
  const f = c._held.fetched[0];
  assert.ok(f, '서버에 안 맡겼습니다');
  assert.ok(/mailAttToPaydata/.test(f.url), '엉뚱한 창구입니다: ' + f.url);
  /* 화면 코드 어디에도 창고·대기 칸 자리가 «글자로» 박혀 있으면 안 된다 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  ['pending_shared', 'pu_paydata', 'paydata/u/'].forEach(k =>
    assert.ok(code.indexOf(k) < 0, '화면이 급여데이터함 자리를 직접 압니다: ' + k));
});

test('★★ 보낸이·제목을 «함께» 보낸다 — 서버가 그것으로 임자를 짚는다', async () => {
  const c = load();
  c.mbAttToPay(0);
  await flush();
  const b = c._held.fetched[0].body;
  assert.equal(b.from, 'a@hy.kr', '보낸이를 안 보냈습니다');
  assert.equal(b.subject, '8월 급여자료 보냅니다', '제목을 안 보냈습니다');
  assert.equal(b.part, '2', '어느 조각인지 안 보냈습니다');
});

/* ══════ ④ 어디로 갔는지 말한다 ══════ */

test('★★ 임자를 찾았으면 «그 자리»를 말한다 — 안 말하면 한참 찾는다', async () => {
  const c = load();
  c.mbAttToPay(0);
  await flush();
  const said = c._held.toasts.join(' | ');
  assert.ok(said.indexOf('급여데이터함') >= 0, '어디로 갔는지 안 말합니다: ' + said);
  assert.ok(said.indexOf('s01') >= 0, '누구 자리인지 안 말합니다: ' + said);
});

test('★★ 공용 칸에 남았으면 «그 까닭»까지 말한다', async () => {
  const c = load({ reply:{ ok:true, id:'x2', seat:'', shared:true,
                           why:'업체를 못 찾았습니다', name:'임금대장.xlsx', bytes:1 } });
  c.mbAttToPay(0);
  await flush();
  const said = c._held.toasts.join(' | ');
  assert.ok(said.indexOf('공용') >= 0, '공용 칸이라고 안 말합니다: ' + said);
  assert.ok(said.indexOf('업체를 못 찾았습니다') >= 0, '까닭을 안 말합니다: ' + said);
});

test('★ 안 되면 «안 됐다고» 말한다 — 조용하면 담긴 줄 안다', async () => {
  const c = load({ reply:{ ok:false, error:'너무 큽니다' } });
  c.mbAttToPay(0);
  await flush();
  const said = c._held.toasts.join(' | ');
  assert.ok(/담지 못했습니다/.test(said) && /너무 큽니다/.test(said),
    '실패를 안 알려 줍니다: ' + said);
});

/* ══════ ⑤⑥⑦ 서버 쪽 ══════ */

test('★★ 서버는 «첨부 목록 안»의 조각만 꺼낸다 — 아무 조각이나 되면 본문이 샌다', () => {
  const seg = fnPart();
  assert.ok(/parts\.atts\.find\(\(x\) => x\.part === part\)/.test(seg),
    '조각을 첨부 목록에서 찾지 않습니다 — 본문을 통째로 꺼낼 수 있습니다');
  assert.ok(/if \(!a\) throw/.test(seg), '없는 조각을 걸러내지 않습니다');
  assert.ok(/ATT_MAX/.test(seg), '크기 한도를 안 봅니다');
});

test('★★ 서버가 창고에 담는 길을 «새로 짓지 않는다» — 스스로 훑을 때와 같은 길', () => {
  const seg = fnPart();
  assert.ok(/deps\.payMailStore\(/.test(seg), '넘겨받은 한 길을 안 씁니다');
  ['bucket', 'pending_shared', 'pu_paydata'].forEach(k =>
    assert.ok(seg.indexOf(k) < 0, '메일 쪽에서 창고 자리를 따로 압니다: ' + k));
  /* 그 한 길이 실제로 «스스로 훑을 때»와 같은 함수여야 한다 */
  assert.ok(/payMailStore: async \(att, mail\) => \{[\s\S]{0,400}payMailStoreOne\(/.test(idx),
    'index 가 스스로 훑을 때와 다른 길로 담습니다');
});

test('★★ 판독을 여기서 돌리지 않는다 — 주민번호 가림을 건너뛰게 된다', () => {
  const seg = fnPart();
  ['docRead', 'readDoc', 'gemini', 'vision', 'ocr'].forEach(k =>
    assert.ok(seg.toLowerCase().indexOf(k.toLowerCase()) < 0, '판독을 돌립니다: ' + k));
});

test('★ 다음메일을 «고치지 않는다» — 읽기만 한다', () => {
  const seg = fnPart();
  ['messageMove', 'messageFlagsAdd', 'messageFlagsRemove', 'write: true']
    .forEach(k => assert.ok(seg.indexOf(k) < 0, '다음메일을 고칩니다: ' + k));
});

test('★ 창구가 «등록»되어 있다 — 안 하면 화면에서 404 다', () => {
  assert.ok(/exports\.mailAttToPaydata = MSYNC\.mailAttToPaydata;/.test(idx),
    '창구를 내보내지 않았습니다');
});
