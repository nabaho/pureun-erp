/* 푸른 메일 — 쓰기 화면 위쪽 틀고정 (대표 지시 2026-08-30 「여기 틀고정」)

   ⚠ 단추줄(.mtop)은 2026-08-24 부터 «이미» 붙어 있었다 — 브라우저로 재어 확인했다.
     밀려 올라가던 것은 그 «아래 머리칸»(보내는사람·받는사람·참조·제목·첨부)이다.

   지키는 것.
   ① 단추줄과 머리칸이 «한 덩이»(.cphead)로 붙는다
   ② 도구줄·본문은 그 «밖»에 있다 — 안에 넣으면 화면 절반이 머리가 된다
   ③ 붙는 규칙과 «바탕»이 둘 다 있다 — 바탕이 없으면 글자가 겹쳐 보인다
   ④ PC 에서만 붙인다 — 폰은 화면이 좁아 쓸 자리가 없어진다

   ★ 브라우저로 재어 확인(docs/mockups/mail-write-froze-check.html, 1440x900):
     머리칸 231px 로 붙고 본문 자리 630px 이 남는다. 1,000px 내려도 제자리.
     ⚠ 값을 여기 못 박지 않는다 — 창 크기·글꼴에 따라 달라진다. 여기서는 «구조»만
       지킨다(그 구조가 곧 붙는 조건이다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
/* 주석을 걷는다 — 규칙 위의 설명이 선택자 자리에 묻어 들어온다 */
const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

function load(){
  const state = {
    view:'mail', mailSent:false, mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'topic',
    items:{}, mbMineOpen:true, showBcc:false, attFold:false, edMode:'editor', draftAt:''
  };
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: () => 0, clearTimeout(){}, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from:'370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta:{}, _matLoaded:true,
    loadMaterials(){}, schedList: () => [],
    staffName: e => String(e||''), fmtDate: () => '2026.08.30', fmtMB: n => n+'B',
    fmtWhen: () => '', toLocalInput: () => '',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast(){}, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){}, openWhoPage(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '',
    wireMailWrite(){}, redrawCompose(){},
    composeHtml: () => '<p>본문</p>', signPreviewHtml: h => h,
    attachTotal: () => 0, matIcon: () => '📄', MAIL_MAX_BYTES: 18 * 1024 * 1024,
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, renderMailPage(){}, renderPCSide(){},
    document: { getElementById: el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    $: el,
    firebase: { auth: () => ({ currentUser:{ uid:'U1', email:'p001@pureun.kr' } }),
      database: () => ({ ref: () => ({ once: () => Promise.resolve({ val: () => null }) }) }) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok:true }) })
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  /* 쓰기 화면은 위 두 토막 «밖»에 있다 — 그 자리만 따로 떠 온다 */
  vm.runInContext(cut('function mailWriteHtml(){', '\nfunction toggleBcc('), ctx);
  vm.runInContext(cut('const ED_TOOLS = [', '\nfunction composeHtml('), ctx);
  vm.runInContext(
    '_mbFolders = {}; _mbMsgs = {}; _mbBins = {}; _mbPut = {}; _mbHide = {};' +
    '_mbOwner = {}; _mbSucc = {}; _mbOrder = {}; _mbWhoOrder = {};' +
    '_mbCkSkip = {}; _mbBinRule = {}; _mbMeta = { at:1, ok:true };' +
    '_compose = { to:"", cc:"", bcc:"", subject:"", body:"", ids:[], files:[] };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  EM.byName = {}; EM.byBiz = {}; EM.staff = {}; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM; ctx.myEmail = 'p001@pureun.kr'; EM.nameByEmail = {};
  return ctx;
}

/* ══════ ① 한 덩이로 붙는다 ══════ */

test('★★ 단추줄과 머리칸이 «한 덩이»(.cphead) 안에 있다', () => {
  const h = load().mailWriteHtml();
  const i = h.indexOf('class="cphead"');
  assert.ok(i > 0, '붙박이 덩이(.cphead)가 없습니다 — 머리칸이 밀려 올라갑니다');
  const seg = h.slice(i, h.indexOf('class="edbar"'));
  assert.ok(/class="mtop"/.test(seg), '단추줄이 덩이 밖에 있습니다');
  ['보내는사람', '받는사람', '제목'].forEach(nm =>
    assert.ok(seg.indexOf(nm) > 0, nm + ' 이 덩이 밖에 있습니다'));
  assert.ok(/파일 첨부하기/.test(seg), '첨부 줄이 덩이 밖에 있습니다');
});

test('★★ 서식 도구줄도 덩이 «안»이다 — 굵게·색을 누르러 위로 올라갈 일이 없다', () => {
  /* 대표 지시 2026-08-30 「캡쳐2도 틀고정」 — 처음에는 도구줄을 밖에 두었는데,
     본문을 내려 쓰다가 서식을 누르려면 맨 위까지 올라가야 했다. */
  const h = load().mailWriteHtml();
  const open = h.indexOf('class="cphead"');
  const bar  = h.indexOf('class="edbar"');
  assert.ok(open > 0 && bar > open, '도구줄을 찾지 못했습니다');
  const seg = h.slice(h.lastIndexOf('<div', open), bar);
  const o = (seg.match(/<div/g) || []).length;
  const c = (seg.match(/<\/div>/g) || []).length;
  assert.ok(c < o, '도구줄이 덩이 밖에 있습니다 — 서식을 누르러 위로 올라가야 합니다');
});

test('★★ 본문은 덩이 «밖»이다 — 거기까지 붙이면 정작 쓸 자리가 없어진다', () => {
  const h = load().mailWriteHtml();
  const open = h.indexOf('class="cphead"');
  const body = h.indexOf('id="cpBody"');
  assert.ok(open > 0 && body > open, '차례가 어긋났습니다');
  /* 덩이가 본문 «앞»에서 닫혔는지 — 여닫이 수로 센다 */
  const seg = h.slice(h.lastIndexOf('<div', open), h.lastIndexOf('<div', body));
  const o = (seg.match(/<div/g) || []).length;
  const c = (seg.match(/<\/div>/g) || []).length;
  assert.equal(c, o, '덩이가 본문까지 삼켰습니다 — 본문이 안 넘어갑니다 (여는 것 '
    + o + ' · 닫는 것 ' + c + ')');
});

/* ══════ 뺀 것들 (대표 지시 2026-08-30 「불필요한 설명 필요없다」) ══════ */

test('★★ 쓰기 화면 아래 안내문이 «없다» — 한 번 읽고 다시 안 읽는데 자리는 늘 찼다', () => {
  const h = load().mailWriteHtml();
  assert.ok(h.indexOf('class="cphint"') < 0, '아래 안내문이 아직 있습니다');
  assert.ok(h.indexOf('편지 쓰기]로 오면 붙어 있습니다') < 0, '안내문 글이 남아 있습니다');
});

test('★★ 그래도 «길»은 안 없앴다 — 두 단추의 귀띔에 그 말이 남아 있다', () => {
  /* ⚠ 설명을 뺀 것과 길을 없앤 것은 다르다. 안내문을 지우면서 첨부하는 길까지
       사라지면 안 된다 — 그것이 이 검사가 막는 것이다. */
  const h = load().mailWriteHtml();
  assert.ok(/파일 첨부하기/.test(h), '파일 첨부하기 단추가 사라졌습니다');
  assert.ok(/title="[^"]*이번 편지에만[^"]*"/.test(h),
    '첨부 단추의 귀띔이 없습니다 — 설명을 뺐으면 귀띔이라도 남아야 합니다');
});

test('★ 태그 짝이 맞는다 — 하나만 어긋나도 화면이 통째로 무너진다', () => {
  const h = load().mailWriteHtml();
  const o = (h.match(/<div/g) || []).length;
  const c = (h.match(/<\/div>/g) || []).length;
  assert.equal(c, o, '여는 div ' + o + ' · 닫는 div ' + c);
});

/* ══════ ③④ 꾸밈 ══════ */

test('★★ 붙는 규칙과 «바탕»이 둘 다 있다 — 바탕이 없으면 본문이 비쳐 겹친다', () => {
  const m = css.match(/#pcMail \.cphead\{([^}]*)\}/);
  assert.ok(m, '붙박이 규칙(#pcMail .cphead)이 없습니다');
  assert.ok(/position:\s*sticky/.test(m[1]), '붙는 규칙(position:sticky)이 없습니다');
  assert.ok(/top:\s*0/.test(m[1]), '어디에 붙을지(top)가 없습니다');
  assert.ok(/background:/.test(m[1]), '바탕색이 없습니다 — 본문이 비쳐 글자가 겹칩니다');
  assert.ok(/z-index:\s*[1-9]/.test(m[1]), 'z-index 가 없습니다 — 본문이 머리칸을 덮습니다');
});

test('★★ 단추줄에 «따로» 붙는 규칙이 남아 있지 않다 — 둘이면 top 값을 손으로 맞춰야 한다', () => {
  assert.ok(!/#pcMail \.mtop\{[^}]*position:\s*sticky/.test(css),
    '단추줄이 아직 따로 붙습니다 — 창이 좁아 단추줄이 줄바꿈되면 그때부터 어긋납니다');
});

test('★ 붙박이는 «PC 에서만» — 폰은 화면이 좁아 쓸 자리가 없어진다', () => {
  assert.ok(!/^\.cphead\{[^}]*position:\s*sticky/m.test(css),
    '#pcMail 밖에도 붙박이 규칙이 있습니다 — 폰에서도 붙습니다');
});
