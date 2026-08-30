/* 푸른 메일 — 본문까지 찾기 (대표 결정 2026-08-30)

   지키는 것.
   ① 미리보기(서버가 적어 둔 140자)도 «그 자리에서» 찾는다 — 공짜다
   ② 다음메일에게 물어 찾은 것도 목록에 함께 나온다
   ③ 「본문까지 찾기」는 «누를 때만» 한다 — 글자 칠 때마다 붙으면 느리다
   ④ 단추는 «찾을 말이 있을 때만» 나온다
   ⑤ 찾는 말이 바뀌면 옛 결과는 «안 쓴다» — 섞이면 왜 나오는지 알 수 없다
   ⑥ 걸린 칸은 «다» 받아 온다 — 안 그러면 찾았다고 해 놓고 목록이 빈다

   ⚠ 서버는 «번호»만 돌려준다. 본문을 실어 나르면 한 번에 수십 MB 이고, 줄 내용은
     우리 실시간DB 에 이미 있다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const fnsrc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

const FOLDERS = {
  B1:{ path:'1.칸', name:'1.칸', kind:'custom', order:1, total:3, unseen:1 },
  B2:{ path:'2.칸', name:'2.칸', kind:'custom', order:2, total:1, unseen:0 },
};
/* p = 서버가 적어 둔 «본문 앞 140자» */
const MSGS = {
  B1: {
    '1':{ u:1, f:'김대리', e:'a@hy.kr', t:'x@daum.net', s:'8월 급여자료', d:1756000001,
          r:0, g:0, a:0, z:1, p:'연차수당 계산 부탁드립니다' },
    '2':{ u:2, f:'박과장', e:'b@ga.kr', t:'x@daum.net', s:'회의록', d:1756000002,
          r:0, g:0, a:0, z:1, p:'별다른 내용 없습니다' },
  },
  B2: {
    '9':{ u:9, f:'최부장', e:'c@nr.kr', t:'x@daum.net', s:'안녕하세요', d:1756000009,
          r:0, g:0, a:0, z:1, p:'' },   /* 미리보기에 없다 — 본문 깊은 곳에만 있다 */
  },
};

function load(over){
  const o = over || {};
  const held = { fetched:[], loaded:[], toast:'' };
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
    set: () => Promise.resolve(), remove: () => Promise.resolve(),
    update: () => Promise.resolve(),
    orderByKey(){ return this; }, limitToLast(n){ held.limit = n; return this; } });
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
    toast(m){ held.toast = String(m||''); }, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    mailWriteHtml: () => '', wireMailWrite(){},
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
    /* 서버 흉내 — 무엇을 물었는지 담아 두고, 정해 준 답을 준다 */
    fetch: (url, opt) => {
      held.fetched.push({ url:String(url), body: JSON.parse((opt&&opt.body)||'{}') });
      return Promise.resolve({ json: () => Promise.resolve(
        o.reply || { ok:true, q:'연차', hit:{ B2:[9] }, n:1, seen:2, bad:[] }) });
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
  ctx.ErpMatch = EM;
  ctx.myEmail = 'p001@pureun.kr';
  EM.nameByEmail = {};
  /* 「그 칸을 다 받아 온다」를 재려고 가로챈다 */
  const realLoad = ctx.loadMailBox;
  ctx.loadMailBox = (slug, n, cb) => { held.loaded.push({ slug:slug, n:n }); if(cb) cb(); };
  ctx._held = held;
  ctx.__find = () => vm.runInContext('_mbFind', ctx);
  ctx.__realLoad = realLoad;
  return ctx;
}
/* ⚠ vm 안에서 만든 배열은 deepEqual 로 견주면 «틀이 다르다»고 깨진다 — 글자로 견준다
     (2026-08-30 에 또 걸렸다). */
/* ⚠ mbFindBody 는 «약속»으로 돈다(로그인표 → 서버 → 줄 받아오기). 바로 재면 아직
     아무 일도 안 일어났다 — 밀린 약속을 다 흘려보낸 뒤에 본다. */
const flush = async () => { for(let i=0;i<20;i++) await Promise.resolve();
                            await new Promise(r=>setImmediate(r)); };
const subs = c => c.mbMatchedRows().map(v => v.s).sort().join(" · ");

/* ══════ ① 미리보기까지 그 자리에서 ══════ */

test('★★ 미리보기에 있는 말도 찾는다 — 서버가 이미 적어 둔 140자다', () => {
  const c = load();
  c.state.mbQ = '연차수당';
  assert.equal(subs(c), '8월 급여자료',
    '미리보기를 안 봅니다: ' + subs(c));
});

test('★ 제목·보낸이는 예전 그대로 찾는다', () => {
  const c = load();
  c.state.mbQ = '박과장';  assert.equal(subs(c), '회의록', '보낸이를 못 찾습니다');
  c.mbMemoClear();
  c.state.mbQ = '급여자료'; assert.equal(subs(c), '8월 급여자료', '제목을 못 찾습니다');
});

/* ══════ ② 다음메일에게 묻기 ══════ */

test('★★ 「본문까지 찾기」로 찾은 것이 목록에 «함께» 나온다', async () => {
  const c = load();
  c.state.mbQ = '연차';
  /* 그 말은 B2:9 의 미리보기에도 제목에도 없다 — 서버만이 안다 */
  assert.ok(subs(c).indexOf('안녕하세요') < 0, '밑그림이 틀렸습니다');
  c.mbMemoClear();
  c.mbFindBody();
  await flush();
  c.mbMemoClear();
  assert.ok(subs(c).indexOf('안녕하세요') >= 0,
    '서버가 찾은 것이 목록에 안 나옵니다: ' + subs(c));
});

test('★★ 서버에는 «찾는 말»만 보낸다 — 본문을 실어 나르지 않는다', async () => {
  const c = load();
  c.state.mbQ = '연차';
  c.mbFindBody();
  await flush();
  const f = c._held.fetched[0];
  assert.ok(f, '서버에 묻지 않았습니다');
  assert.ok(/searchMailbox/.test(f.url), '엉뚱한 창구에 물었습니다: ' + f.url);
  assert.equal(f.body.q, '연차', '찾는 말을 안 보냈습니다');
});

test('★★ 걸린 칸은 «다» 받아 온다 — 안 그러면 찾았다고 해 놓고 목록이 빈다', async () => {
  const c = load();
  c.state.mbQ = '연차';
  c.mbFindBody();
  await flush();
  const got = c._held.loaded.filter(x => x.slug === 'B2');
  assert.ok(got.length, '걸린 칸을 안 받아 왔습니다');
  assert.equal(Number(got[0].n), 0, '받아 둔 만큼만 받아 왔습니다 (n=' + got[0].n + ')');
});

test('★★ 0 을 주면 실제로 «한도 없이» 받아 온다 — 이름만 0 이면 소용없다', () => {
  const c = load();
  c._held.limit = null;
  c.__realLoad('B2', 0, ()=>{});
  assert.equal(c._held.limit, null, 'n=0 인데도 한도를 걸었습니다 (limitToLast '
    + c._held.limit + ')');
  c.__realLoad('B2', 50, ()=>{});
  assert.equal(c._held.limit, 50, '보통 때는 한도를 걸어야 합니다');
});

/* ══════ ③④⑤ 언제 하나 · 언제 보이나 ══════ */

test('★★ 글자를 칠 때는 «서버에 안 붙는다» — 누를 때만 한다', async () => {
  const c = load();
  c.state.mbQ = '연차';
  c.mbMatchedRows();
  c.mbListHtml();
  /* ⚠ 붙는 것은 «약속»이라 바로 재면 늘 0 이다 — 밀린 약속을 흘려보낸 뒤에 본다
     (2026-08-30 뮤테이션에서 이 검사가 헛도는 것을 잡았다). */
  await flush();
  assert.equal(c._held.fetched.length, 0, '찾기만 했는데 서버에 붙었습니다');
});

test('★ 단추는 «찾을 말이 있을 때만» 나온다', () => {
  const c = load();
  assert.ok(c.mbListHtml().indexOf('dm-findbtn') < 0, '찾는 말이 없는데 단추가 있습니다');
  c.mbMemoClear();
  c.state.mbQ = '연';                    /* 한 글자 — 아직 안 내놓는다 */
  assert.ok(c.mbListHtml().indexOf('dm-findbtn') < 0, '한 글자인데 단추가 나옵니다');
  c.mbMemoClear();
  c.state.mbQ = '연차';
  assert.ok(c.mbListHtml().indexOf('dm-findbtn') >= 0, '찾는 말이 있는데 단추가 없습니다');
});

test('★ 두 글자가 안 되면 «묻지 않고» 말해 준다', () => {
  const c = load();
  c.state.mbQ = '연';
  c.mbFindBody();
  assert.equal(c._held.fetched.length, 0, '한 글자인데 서버에 물었습니다');
  assert.ok(/두 글자/.test(c._held.toast), '왜 안 되는지 안 알려 줍니다: ' + c._held.toast);
});

test('★★ 찾는 말이 바뀌면 옛 결과는 «안 쓴다» — 섞이면 왜 나오는지 알 수 없다', async () => {
  const c = load();
  c.state.mbQ = '연차';
  c.mbFindBody();
  await flush();
  c.mbMemoClear();
  assert.ok(subs(c).indexOf('안녕하세요') >= 0, '밑그림이 틀렸습니다');
  c.state.mbQ = '회의';                  /* 다른 말로 바꿨다 */
  c.mbMemoClear();
  assert.ok(subs(c).indexOf('안녕하세요') < 0,
    '옛 본문 찾기 결과가 새 말에도 섞여 나옵니다: ' + subs(c));
});

test('★ 못 읽은 칸이 있으면 «그렇다고» 말한다 — 조용하면 다 찾은 줄 안다', async () => {
  const c = load({ reply:{ ok:true, q:'연차', hit:{}, n:0, seen:1, bad:['B1'] } });
  c.state.mbQ = '연차';
  c.mbFindBody();
  await flush();
  assert.ok(/못 읽은 칸/.test(c._held.toast), '못 읽은 칸을 안 알려 줍니다: ' + c._held.toast);
});

/* ══════ 서버 쪽 ══════ */

test('★★ 서버는 «번호»만 돌려준다 — 본문을 실어 나르면 수십 MB 다', () => {
  const i = fnsrc.indexOf('searchMailbox:');
  assert.ok(i > 0, '서버에 찾기 창구가 없습니다');
  const seg = fnsrc.slice(i, fnsrc.indexOf('moveMailMessages:', i));
  assert.ok(/reply\(res, 200, \{ ok: true, q, hit, n, seen, bad \}\)/.test(seg),
    '돌려주는 것이 번호 목록이 아닙니다');
  assert.ok(!/fetchOne|download|source: true/.test(seg), '본문을 실어 나릅니다');
});

test('★★ 서버가 제목·보낸이·본문을 «함께» 뒤진다 — 본문만 보면 제목만 있는 말을 놓친다', () => {
  const i = fnsrc.indexOf('searchMailbox:');
  const seg = fnsrc.slice(i, fnsrc.indexOf('moveMailMessages:', i));
  assert.ok(/or:\s*\[/.test(seg), '한 가지만 뒤집니다');
  ['body:', 'subject:', 'from:'].forEach(k =>
    assert.ok(seg.indexOf(k) > 0, k + ' 를 안 뒤집니다'));
});

test('★★ 한 칸이 안 되어도 «나머지는» 돌려준다 — 하나도 못 찾은 것처럼 보이면 안 된다', () => {
  const i = fnsrc.indexOf('searchMailbox:');
  const seg = fnsrc.slice(i, fnsrc.indexOf('moveMailMessages:', i));
  assert.ok(/catch \(e\) \{[\s\S]{0,200}bad\.push\(slug\)/.test(seg),
    '한 칸이 안 되면 통째로 실패합니다');
});

test('★ 다음메일을 «고치지 않는다» — 읽기만 한다', () => {
  const i = fnsrc.indexOf('searchMailbox:');
  const seg = fnsrc.slice(i, fnsrc.indexOf('moveMailMessages:', i));
  ['messageMove', 'messageFlagsAdd', 'messageFlagsRemove', 'messageDelete', 'write: true']
    .forEach(k => assert.ok(seg.indexOf(k) < 0, '다음메일을 고칩니다: ' + k));
});
