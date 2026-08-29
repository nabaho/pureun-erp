/* 푸른 메일 — 로그인과의 «경주» (대표 보고 2026-08-28)
   "왜 로그인 할때마다 가끔씩 메일이 하나도 안나타나고 없는 경우가 발생하나"

   ★ 까닭 — 메일 아이콘(?view=mail)으로 들어오면 첫 화면이 로그인 복원보다 먼저
     그려지고, renderPC 가 폴더·분류 읽기를 그 자리에서 쐈다. 토큰이 늦으면 서버가
     PERMISSION_DENIED 로 거절했는데, 그때 코드가 «빈 것을 다 읽었다»고 표시해
     (_mbFolders = {}) 다시는 시도하지 않았다 — 로그인이 붙은 뒤에도 빈 화면 그대로.
     토큰이 빠르면 정상, 느리면 빈 화면 — 그래서 「가끔」이었다.

   여기서 지키는 것 셋.
   ① 로그인이 없으면 «아예 안 쏜다» — 실패할 요청을 보내 놓고 잘 처리하는 것이 아니라.
   ② 그래도 거절당하면 «다 읽었다»로 굳히지 않는다 — 로그인이 붙으면 다시 가져온다.
   ③ 안내문이 원인을 «맞게» 말한다 — 로그인이 풀린 것을 「콘솔 규칙」이라고 하지 않는다. */
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

/* 로그인은 늦게 오고, 서버는 로그인 없는 읽기를 거절한다 — 실제와 같은 밑그림 */
function load(over){
  const o = over || {};
  const held = { reads: [], user: o.user || null };
  const state = {
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:false, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null
  };
  const dbRef = (p) => ({
    once(){
      held.reads.push(p);
      /* 서버 규칙 그대로 — 로그인이 없으면 거절, 있으면 빈 값이라도 준다 */
      if(!held.user){ const e = new Error('permission_denied'); e.code = 'PERMISSION_DENIED';
        return Promise.reject(e); }
      return Promise.resolve({ val: () => (o.data && o.data[p]) || null });
    },
    set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), orderByKey(){ return this; }, limitToLast(){ return this; }
  });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from: '370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {}, _matLoaded: true,
    loadMaterials(){}, schedList: () => [], staffName: b => String(b || ''),
    fmtDate: () => '2026.08.28', fmtMB: n => n + 'B',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [], coFTabCounts: () => ({all:0,byTab:{}}),
    _coFolders: {}, _coTagHidden: {},
    toast(){}, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    renderPCSide(){}, renderMailPage(){}, render(){},
    document: { getElementById: () => null, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    /* 덩어리 안의 진짜 renderPCSide 가 스텁을 가린다 — 받아 줄 자리를 준다 */
    $: () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{}, offsetHeight:100,
      value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
      classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } }),
    firebase: {
      auth: () => ({ currentUser: held.user }),
      database: () => ({ ref: dbRef })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  ctx._held = held;
  ctx.__folders = () => vm.runInContext('_mbFolders', ctx);
  ctx.__bins = () => vm.runInContext('_mbBins', ctx);
  ctx.__err = () => vm.runInContext('_mbErr', ctx);
  ctx.__login = () => { held.user = { uid: 'U1', email: 'p001@pureun.kr' }; };
  return ctx;
}
const tick = () => new Promise(r => setImmediate(r));
const settle = async () => { for(let i=0;i<6;i++) await tick(); };

/* ══════ ① 로그인이 없으면 아예 안 쏜다 ══════ */

test('★ 로그인 전에는 폴더를 읽으러 가지 않는다 — 실패할 요청은 안 보내는 것이 먼저다', async () => {
  const c = load();
  c.mbEnsureFolders();
  await settle();
  assert.equal(c._held.reads.length, 0, '로그인도 없이 서버를 두드렸습니다');
  assert.equal(c.__folders(), null, '읽지도 않았는데 «읽었다»로 표시됐습니다');
});

test('★ 로그인 전에는 푸른 분류(쪽지)도 읽으러 가지 않는다', async () => {
  const c = load();
  c.mbEnsureBins();
  await settle();
  assert.equal(c._held.reads.length, 0, '로그인도 없이 서버를 두드렸습니다');
  assert.equal(c.__bins(), null);
});

test('★ 로그인 전의 openMailBox 는 조용히 멈춘다 — 끝없는 「거절 → 다시」 고리가 없다', async () => {
  const c = load();
  c.openMailBox('');
  await settle();
  assert.equal(c._held.reads.length, 0,
    '로그인 없이 ' + c._held.reads.length + '번 두드렸습니다 — 이 고리는 로그인이 붙을 때까지 돕니다');
});

/* ══════ ② 거절당해도 «다 읽었다»로 굳지 않는다 ══════ */

test('★★ 거절당한 채 로그인이 붙으면 «다시» 가져온다 — 빈 화면이 새로고침까지 안 굳는다', async () => {
  /* 문을 안 거치고 loadMailFolders 가 직접 불린 경우까지 — 거절 뒤에도 되살아나야 한다 */
  const c = load({ data: { 'mailbox/folders': { B1: { path:'INBOX', name:'INBOX', kind:'inbox' } } } });
  c.loadMailFolders();
  await settle();
  assert.equal(c.__folders(), null,
    '거절당했는데 «다 읽었다»({})로 굳었습니다 — 로그인이 붙어도 영영 빈 화면입니다');

  c.__login();                    /* 로그인이 이제 붙었다 */
  c.mbEnsureFolders();            /* 다음 render 가 하는 일 */
  await settle();
  const f = c.__folders();
  assert.ok(f && f.B1, '로그인이 붙었는데도 폴더가 안 옵니다');
  assert.equal(c.__err(), '', '오류 표시가 남아 있습니다');
});

test('★ 로그인이 «멀쩡한데» 거절당한 것은 진짜 규칙 문제다 — 그때는 오류로 남긴다', async () => {
  /* 되살리기(null 유지)를 여기에도 적용하면, 규칙이 정말 빠졌을 때 끝없이 다시 읽는다 */
  const c = load({ user: { uid:'U1' } });
  const e = new Error('permission_denied'); e.code = 'PERMISSION_DENIED';
  c.firebase.database = () => ({ ref: () => ({ once: () => Promise.reject(e) }) });
  c.loadMailFolders();
  await settle();
  /* vm 안의 {} 는 바깥 {} 와 다른 종류라 deepEqual 이 틀린다 — 모양으로 본다 */
  const f = c.__folders();
  assert.ok(f !== null && Object.keys(f).length === 0, '규칙 문제인데 계속 다시 읽으려 합니다');
  assert.ok(c.__err(), '오류가 표시되지 않았습니다');
});

/* ══════ ③ 안내문이 원인을 맞게 말한다 ══════ */

test('★ 로그인이 풀려 못 읽은 것을 「콘솔 규칙」이라고 하지 않는다', async () => {
  const c = load();
  c.loadMailFolders();
  await settle();
  const msg = c.mbErrTell();
  assert.ok(msg.indexOf('로그인') >= 0, '원인이 로그인인데 다른 말을 합니다: ' + msg);
  assert.ok(msg.indexOf('콘솔') < 0, '콘솔을 뒤지게 만듭니다: ' + msg);

  /* 로그인이 멀쩡한데 거절 — 그때는 규칙 이야기가 맞다 */
  c.__login();
  const msg2 = c.mbErrTell();
  assert.ok(msg2.indexOf('콘솔') >= 0, '규칙 문제인데 콘솔 이야기를 안 합니다: ' + msg2);
});

test('로그인 뒤에는 예전처럼 읽는다 — 문이 잠기기만 하면 안 된다', async () => {
  const c = load({ user: { uid:'U1' },
    data: { 'mailbox/folders': { B1: { path:'INBOX', name:'INBOX', kind:'inbox' } } } });
  c.mbEnsureFolders();
  await settle();
  const f = c.__folders();
  assert.ok(f && f.B1, '로그인했는데도 못 읽습니다');
});
