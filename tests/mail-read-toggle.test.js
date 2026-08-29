/* 푸른 메일 — 읽음 ↔ 안 읽음 (대표 지시 2026-08-29)
   "다음메일처럼 읽음 표시기능 만들어 달라 그리고 읽고 다시 안읽음 기능 만들어라"

   다음메일은 ⑴목록 줄의 «봉투»를 눌러 그 자리에서 뒤집고 ⑵열어 본 메일도 안 읽음으로
   되돌릴 수 있다. 둘 다 만든다.

   여기서 지키는 것.
   · 봉투가 PC·폰 «둘 다» 있다 — 한쪽만 있으면 다른 쪽에서는 되돌릴 길이 없다.
   · 누르면 «뒤집힌다»(읽음이면 안읽음으로, 안읽음이면 읽음으로).
   · 줄을 누르면 메일이 열리므로 봉투는 그 열림을 «막아야» 한다 — 안 막으면
     안읽음으로 돌리는 순간 열려서 도로 읽음이 된다.
   · 닫힌 봉투와 열린 봉투가 «다르게 생겼다» — 같으면 표시가 뜻을 잃는다. */
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

/* 서버로 나가는 길은 promise 사슬이라 «다음 틱»에야 fetch 가 불린다 */
const settle = async () => { for(let i=0;i<6;i++) await new Promise(r=>setImmediate(r)); };

const FOLDERS = {
  B_INBOX: { path:'INBOX', name:'INBOX', kind:'inbox', order:1, total:2, unseen:1 }
};
const MSGS = { B_INBOX: {
  '10': { u:10, f:'세무법인', e:'t@x.kr', t:'370-6@daum.net', s:'안 읽은 것',
          d:1756000000000, r:0, g:0, a:0, z:1 },
  '11': { u:11, f:'노무사회', e:'k@y.kr', t:'370-6@daum.net', s:'읽은 것',
          d:1756000100000, r:1, g:0, a:0, z:1 }
}};

function load(over){
  const o = over || {};
  const held = { flags: [], toasts: [] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'B_INBOX', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:o.open || null
  }, o.state || {});
  const dbRef = () => ({ once: () => Promise.resolve({ val: () => null }),
    set: () => Promise.resolve(), update: () => Promise.resolve() });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    /* 읽기 화면이 이름·회사를 찾을 때 쓴다 — 대역만 있으면 된다 */
    ErpMatch: { ready:false, companies:[], byName:{}, byBiz:{}, staff:{},
      match: () => null, _norm: x => String(x||'') },
    matMailCfg: () => ({ from: '370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {}, _matLoaded:true,
    loadMaterials(){}, schedList: () => [], staffName: b => String(b || ''),
    fmtDate: () => '2026.08.29', fmtMB: n => n + 'B',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [], coFTabCounts: () => ({all:0,byTab:{}}),
    _coFolders: {}, _coTagHidden: {},
    toast: m => held.toasts.push(String(m)), confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: (sel,id) => !!(sel && sel[id]), pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    renderPCSide(){}, renderMailPage(){}, render(){},
    document: { getElementById: () => null, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    $: () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{}, offsetHeight:100,
      value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
      classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } }),
    firebase: { auth: () => ({ currentUser:{ uid:'U1', getIdToken: () => Promise.resolve('T') } }),
      database: () => ({ ref: dbRef }) },
    /* 서버로 나가는 유일한 길 — 무엇을 시켰는지 여기서 본다 */
    fetch: (url, opt) => {
      let b = {}; try{ b = JSON.parse((opt&&opt.body)||'{}'); }catch(_){}
      held.flags.push(b);
      return Promise.resolve({ json: () => Promise.resolve({ ok:true }) });
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(o.folders || FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(o.msgs || MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {}; _mbOrder = {};' +
    '_mbMeta = { at:1, ok:true };', ctx);
  ctx._held = held;
  ctx.__row = (slug,uid) => vm.runInContext('_mbMsgs[' + JSON.stringify(slug) + '][' + JSON.stringify(uid) + ']', ctx);
  return ctx;
}

/* ══════ 목록의 봉투 ══════ */

test('★ PC 목록 줄에 봉투가 있다 — 다음메일과 같은 자리(별 옆)', () => {
  const c = load();
  const h = c.mbBoxHtml();
  assert.ok(/class="env /.test(h), '봉투가 없습니다');
  assert.ok(h.indexOf('mbToggleRead(') >= 0, '봉투를 눌러도 아무 일이 없습니다');
});

test('★ 폰 목록에도 봉투가 있다 — 한쪽만 있으면 다른 쪽에서는 되돌릴 길이 없다', () => {
  const c = load();
  const h = c.mbMobileHtml();
  assert.ok(/class="dmm-env /.test(h), '폰 목록에 봉투가 없습니다');
  assert.ok(h.indexOf('mbToggleRead(') >= 0, '폰에서 봉투를 눌러도 아무 일이 없습니다');
});

test('★★ 봉투를 누를 때 메일이 «열리면 안 된다» — 열리면 도로 읽음이 된다', () => {
  /* 줄 전체에 「누르면 열기」가 걸려 있다. 봉투가 그 열림을 막지 않으면,
     안읽음으로 돌리는 그 순간 메일이 열려 다시 읽음이 된다 — 되돌릴 수가 없다. */
  const c = load();
  [c.mbBoxHtml(), c.mbMobileHtml()].forEach((h, i)=>{
    const where = i ? '폰' : 'PC';
    const m = h.match(/mbToggleRead\([^)]*\)/g) || [];
    assert.ok(m.length, where + ' 에 봉투가 없습니다');
    /* 봉투를 그리는 자리마다 stopPropagation 이 «같은 onclick 안»에 있어야 한다 */
    const bad = (h.match(/onclick="[^"]*mbToggleRead\([^"]*"/g) || [])
      .filter(s => s.indexOf('stopPropagation') < 0);
    assert.equal(bad.length, 0, where + ' 봉투가 줄 열림을 안 막습니다: ' + bad.join(' | '));
  });
});

test('★ 안 읽은 것과 읽은 것의 봉투가 «다르게» 생겼다 — 같으면 표시가 뜻을 잃는다', () => {
  const c = load();
  const shut = c.mbEnvSvg(0), open = c.mbEnvSvg(1);
  assert.notEqual(shut, open, '두 봉투가 똑같이 생겼습니다');
  assert.ok(/<svg/.test(shut) && /<svg/.test(open),
    '글자로 그렸습니다 — 글꼴에 따라 닫힌 것과 열린 것이 같아 보입니다');
});

/* ══════ 뒤집기 ══════ */

test('★ 안 읽은 것을 누르면 «읽음»으로, 읽은 것을 누르면 «안 읽음»으로', async () => {
  const c = load();
  c.mbToggleRead('B_INBOX','10');           // 지금 안 읽음
  await settle();
  assert.equal(c._held.flags[0].flag, 'read');
  assert.equal(c._held.flags[0].on, true, '안 읽은 것을 눌렀는데 읽음으로 안 갑니다');
  assert.equal(Number(c.__row('B_INBOX','10').r), 1, '화면 값이 안 바뀌었습니다');

  c.mbToggleRead('B_INBOX','11');           // 지금 읽음
  await settle();
  assert.equal(c._held.flags[1].on, false, '읽은 것을 눌렀는데 안 읽음으로 안 갑니다');
  assert.equal(Number(c.__row('B_INBOX','11').r), 0);
});

test('★ 다음메일에도 함께 바뀐다 — 우리 화면만 바꾸면 두 곳이 어긋난다', async () => {
  const c = load();
  c.mbToggleRead('B_INBOX','10');
  await settle();
  const b = c._held.flags[0];
  assert.equal(b.slug, 'B_INBOX');
  assert.deepEqual(b.uids, ['10']);
  assert.equal(b.flag, 'read', '서버에 읽음 표시를 안 보냅니다');
});

/* ══════ 열어 본 메일을 되돌리기 ══════ */

test('★ 열어 본 메일에 「안 읽음으로」 단추가 있다 — 「읽고 다시 안읽음」', () => {
  const c = load({ open: { slug:'B_INBOX', uid:'11', html:'', atts:[] } });
  const h = c.mbReadHtml();
  assert.ok(h.indexOf('mbUnreadOne(') >= 0,
    '열어 본 메일을 안 읽음으로 되돌릴 길이 없습니다');
});

test('★ 되돌리면 목록으로 나간다 — 열린 채 「안 읽음」이면 어색하고 눈에 안 보인다', () => {
  const c = load({ open: { slug:'B_INBOX', uid:'11', html:'', atts:[] } });
  c.mbUnreadOne('B_INBOX','11');
  assert.equal(Number(c.__row('B_INBOX','11').r), 0, '안 읽음으로 안 바뀌었습니다');
  assert.equal(c.state.mbOpen, null, '목록으로 안 나갔습니다');
  assert.ok(c._held.toasts.join(' ').indexOf('안 읽음') >= 0, '무엇을 했는지 말해 주지 않습니다');
});
