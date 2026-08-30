/* 푸른 메일 — 손에 드는 양의 «한도» (대표 검토 2026-08-30)
   「메일을 다음에서 더 가지고 와서 연결시키면 속도가 많이 느려지나 …
    기본적으로 1년 정도 정보를 가지고 있어야 한다」

   ★ 재 보고 정했다 — 한 줄이 184바이트다.
       3,300줄(로그인 직후) 0.6MB · 목록 106ms
       30,000줄(1년치를 다 받으면) 5.3MB · 목록 687ms · 옆줄 929ms
     서버에 얼마가 «쌓이든» 로그인은 그대로다 — 칸마다 끝에서 100통만 받는다.
     느려지는 자리는 «쪽번호로 깊이 들어갈 때» 하나뿐이었다.

   ⚠ 예전에는 칸마다 «같은 수»를 요구했다 — 전체메일 2쪽을 눌렀을 뿐인데
     33칸 × 200 = 6,600줄이었고, 300쪽으로 뛰면 990,000줄을 요구했다.

   지키는 것.
   ① 칸마다 요구하는 줄 수에 한도가 있다 — 쌓인 양이 늘어도 안 늘어난다
   ② 못 갈 쪽은 «내놓지 않는다» — 눌렀을 때 빈 화면이 되면 안 된다
   ③ 「이 칸에 모두 몇 통」은 «줄이지 않는다» — 안 보이는 메일이 없는 메일이 되면 안 된다
   ④ 한도에 닿았으면 «어디로 가면 되는지» 알려 준다
   ⑤ 찾는 중이면 손에 든 것이 곧 전부다 — 한도로 쪽을 자르면 안 된다 */
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

const M = (u)=>({ u:u, f:'보낸이', e:'a@hy.kr', t:'x@daum.net', s:'제목'+u,
                  d:1756000000+u, r:1, g:0, a:0, z:1, p:'' });

/* 칸 folders 개 · 칸마다 have 줄을 «손에 들고», 서버에는 total 통이 있다고 적혀 있다 */
function load(folders, have, total){
  const FOLDERS = {}, MSGS = {};
  for(let f=0; f<folders; f++){
    const slug = 'F' + f;
    FOLDERS[slug] = { path:(f+1)+'.칸', name:(f+1)+'.칸', kind:'custom', order:f+1,
      total: Math.ceil(total/folders), unseen:0 };
    const box = MSGS[slug] = {};
    for(let k=0;k<have;k++){ const u = f*100000 + k + 1; box[String(u)] = M(u); }
  }
  const held = { asked:[] };
  const state = { view:'mail', mailSent:'box', mbBox:'*all', tab:'card', group:'all',
    owner:'all', isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'topic',
    items:{}, mbMineOpen:true };
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
    staffName:e=>String(e||''), fmtDate:()=>'2026.08.30', fmtMB:n=>n+'B',
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
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {};' +
    '_mbOrder = {}; _mbWhoOrder = {}; _mbCkSkip = {}; _mbBinRule = {}; _mbNewSkip = {};' +
    '_mbCo = {}; _mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  EM.byName = {}; EM.byBiz = {}; EM.staff = {}; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr'; EM.nameByEmail = {};
  /* 「칸마다 몇 줄을 요구하나」를 재려고 가로챈다 */
  ctx.loadMailBox = (slug, n) => { held.asked.push({ slug:slug, n:Number(n) }); };
  ctx._held = held;
  return ctx;
}

/* ══════ ① 칸마다 한도까지만 ══════ */

test('★★ 「끝 쪽」을 눌러도 칸마다 «한도까지만» 요구한다', () => {
  const c = load(33, 100, 30000);          /* 1년치 — 서버에 3만 통 */
  const last = c.mbPageCount();
  c.mbPageGo(last);
  const asked = c._held.asked;
  assert.ok(asked.length, '아무것도 안 받아 왔습니다');
  const per = c.mbHoldPer();
  asked.forEach(a => assert.ok(a.n <= per,
    '칸 하나에 ' + a.n + '줄을 요구합니다 — 한도는 ' + per + '줄입니다'));
});

test('★★ 서버에 «얼마가 쌓이든» 요구하는 양이 안 늘어난다', () => {
  const a = load(33, 100, 13200), b = load(33, 100, 90000);   /* 지금쯤 vs 3년치 */
  a.mbPageGo(a.mbPageCount());
  b.mbPageGo(b.mbPageCount());
  const maxA = Math.max.apply(null, a._held.asked.map(x=>x.n));
  const maxB = Math.max.apply(null, b._held.asked.map(x=>x.n));
  assert.equal(maxB, maxA, '쌓인 양이 늘자 요구하는 양도 늘었습니다 ('
    + maxA + '줄 → ' + maxB + '줄)');
});

test('★★ 다 합쳐도 한도를 넘지 않는다 — 칸이 많을수록 칸마다 적게', () => {
  [1, 5, 33].forEach(n => {
    const c = load(n, 100, 90000);
    const total = c.mbHoldPer() * n;
    assert.ok(total <= 5000 + n,      /* 나눗셈 나머지만큼의 여유 */
      '칸 ' + n + '개일 때 다 합쳐 ' + total + '줄 — 한도(5,000)를 넘습니다');
  });
});

test('★★ 칸이 «많아져도» 한 쪽 수보다 적게 요구하지 않는다 — 그러면 1쪽도 못 채운다', () => {
  /* ⚠ 지금은 칸이 33개라 5,000÷33 = 151줄로 넉넉하다. 그런데 칸이 늘면 언젠가
       한 쪽(100줄)보다 적어진다 — 그때 1쪽조차 비어 보인다.
     ⚠ 칸 33개로만 재면 이 가드가 «있으나 없으나» 같아 검사가 헛돈다
       (2026-08-30 뮤테이션에서 잡음). 칸을 80개로 두고 잰다. */
  [1, 33, 80, 200].forEach(n => {
    const c = load(n, 100, 90000);
    assert.ok(c.mbHoldPer() >= c.mbPageSize(),
      '칸 ' + n + '개일 때 칸마다 ' + c.mbHoldPer() + '줄 — 한 쪽('
      + c.mbPageSize() + '줄)도 못 채웁니다');
  });
});

/* ══════ ② 못 갈 쪽은 안 내놓는다 ══════ */

test('★★ 못 갈 쪽은 «내놓지 않는다» — 눌렀을 때 빈 화면이 되면 안 된다', () => {
  const c = load(33, 100, 90000);          /* 3년치 */
  const pages = c.mbPageCount();
  const reach = Math.ceil(c.mbHoldMax() / c.mbPageSize());
  assert.ok(pages <= reach, '갈 수 없는 쪽을 내놓습니다 (' + pages + '쪽 · 갈 수 있는 것 '
    + reach + '쪽)');
  assert.ok(pages > 1, '쪽을 아예 안 내놓습니다');
});

test('★★ 쌓인 양이 늘어도 쪽수가 «안 늘어난다» — 늘면 그만큼 못 갈 쪽이다', () => {
  const a = load(33, 100, 13200), b = load(33, 100, 90000);
  assert.equal(b.mbPageCount(), a.mbPageCount(),
    '쌓인 양이 늘자 쪽수도 늘었습니다 (' + a.mbPageCount() + '쪽 → ' + b.mbPageCount() + '쪽)');
});

/* ══════ ③④ 숨기지 않는다 ══════ */

test('★★ 실제 통수를 «줄여 말하지 않는다» — 안 보이는 메일이 없는 메일이 되면 안 된다', () => {
  /* ⚠ 2026-08-30 저녁에 목록 위 안내줄을 통째로 뺐다(대표 지시) — 그래서 이 값이
       «화면에 적히는 자리»는 옆줄 칸 통수로 옮겼다. 지킬 것은 그대로다:
       셈(mbBoxTotal)이 한도로 줄어들면 안 된다. 줄면 옆줄 통수까지 함께 거짓이 된다. */
  const c = load(33, 100, 30000);
  assert.equal(c.mbBoxTotal(), 30000 + (33 - 30000 % 33) % 33,
    '실제 통수를 줄여 말합니다: ' + c.mbBoxTotal());
  assert.ok(c.mbBoxTotal() > c.mbHoldMax(), '밑그림이 한도를 안 넘습니다');
});

test('★★ 한도에 닿았으면 «어디로 가면 되는지» 알려 준다', () => {
  /* ⚠ 예전에는 목록 위 안내줄에 적었다. 그 줄을 뺀 뒤 쪽번호 옆으로 옮겼다 —
       말할 자리가 없어졌다고 말까지 없애면 「옛 메일이 없어졌다」로 읽힌다. */
  const c = load(33, 100, 30000);
  const h = c.mbPagerHtml();
  assert.ok(h.indexOf('찾기') >= 0,
    '더 옛 메일을 어디서 보는지 안 알려 줍니다 — 「없어졌다」로 읽힙니다');
  assert.ok(c.mbListHtml().indexOf('찾기') >= 0, '목록 화면에 그 말이 안 나옵니다');
});

test('★ 한도에 안 닿았으면 그 말을 «안» 한다 — 늘 떠 있으면 아무도 안 읽는다', () => {
  const c = load(33, 100, 300);            /* 쌓인 것이 적다 */
  assert.ok(c.mbPagerHtml().indexOf('더 옛 메일은') < 0,
    '한도에 안 닿았는데 그 말이 떠 있습니다');
});

/* ══════ ⑤ 찾는 중 ══════ */

test('★★ 찾는 중이면 한도로 쪽을 «안» 자른다 — 손에 든 것이 곧 전부다', () => {
  const c = load(33, 100, 90000);
  c.state.mbQ = '제목';
  c.mbMemoClear();
  const rows = c.mbMatchedRows().length;
  assert.ok(rows > 0, '밑그림이 틀렸습니다');
  assert.equal(c.mbPageCount(), Math.max(1, Math.ceil(rows / c.mbPageSize())),
    '찾은 것을 한도로 잘랐습니다');
});
