/* 푸른 메일 — 목록 오른쪽 «열 정리» (대표 지시 2026-08-30 「이부분 열 정리해달라」)

   ★ 무엇이었나 둘.
   ① 칸 이름 칸(.box)에 «폭»이 없어 글자 길이만큼 늘었다 줄었다 했다. 그래서
     「INBOX」 줄과 「2.급여+사무대행」 줄에서 이 칸의 너비가 달라지고, 그 왼쪽에
     붙는 담당자 딱지까지 함께 흔들려 눈으로 훑으면 열이 지그재그로 보였다.
   ② 목록 딱지만 이름표(MB_KIND_LABEL)를 안 거쳐 「INBOX」·「Sent Messages」가
     그대로 나왔다 — 옆줄은 「받은메일함」이라 적는데.

   ★ 브라우저로 재어 확인(docs/mockups/mail-cols-check.html, 1440px):
     예전 — 칸 이름 왼쪽 끝 4군데 · 딱지 오른쪽 끝 3군데
     고친 뒤 — 각각 «한 자리», 잘린 글자 없음.
   ⚠ 픽셀 값은 여기 못 박지 않는다(글꼴·창 크기에 따라 달라진다). 여기서는 그 자리가
     «자리로 못 박혀 있는가»만 본다 — 그것이 곧 줄이 맞는 조건이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

/* 다음메일이 주는 «원문 이름»으로 둔다 — 이름표를 거치는지 보려면 그래야 한다 */
const FOLDERS = {
  IN:{ path:'INBOX',         name:'INBOX',         kind:'inbox',  order:1, total:3, unseen:0 },
  SE:{ path:'Sent Messages', name:'Sent Messages', kind:'sent',   order:2, total:1, unseen:0 },
  B1:{ path:'1.자문사답변',   name:'1.자문사답변',   kind:'custom', order:7, total:1, unseen:0 },
};
const M = (u,e)=>({ u:u, f:'보낸이', e:e, t:'x@daum.net', s:'제목'+u, d:1756000000+u,
                    r:1, g:0, a:0, z:1, p:'' });
const MSGS = { IN:{ '1':M(1,'a@hy.kr') }, SE:{ '2':M(2,'b@ga.kr') }, B1:{ '3':M(3,'c@nr.kr') } };

function load(){
  const state = {
    view:'mail', mailSent:'box', mbBox:'*all', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'topic',
    items:{}, mbMineOpen:true
  };
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const dbRef = () => ({ once: () => Promise.resolve({ val: () => null }),
    set: () => Promise.resolve(), remove: () => Promise.resolve(), update: () => Promise.resolve(),
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
    staffName: e => String(e||''), fmtDate: () => '2026.08.30', fmtMB: n => n+'B',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({all:0,byTab:{}}), _coFolders:{}, _coTagHidden:{},
    toast(){}, confirm: () => true, closeFolderMenu(){},
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
      database: () => ({ ref: dbRef }) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok:true }) })
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
  return ctx;
}
const boxes = c => (c.mbListHtml().match(/<span class="box">([^<]*)<\/span>/g) || [])
  .map(x => x.replace(/<[^>]*>/g, ''));

/* ══════ ① 칸 이름을 «사람이 보는 이름»으로 ══════ */

test('★★ 목록에 「INBOX」·「Sent Messages」가 안 나온다 — 옆줄은 받은메일함이라 적는다', () => {
  const got = boxes(load());
  assert.ok(got.length, '칸 이름 딱지가 아예 없습니다 — 밑그림을 보세요');
  ['INBOX', 'Sent Messages'].forEach(bad =>
    assert.ok(got.indexOf(bad) < 0, '다음메일 원문 이름이 그대로 나옵니다: ' + got.join(' · ')));
});

test('★★ 사람이 보는 이름으로 나온다', () => {
  const got = boxes(load());
  ['받은메일함', '보낸메일함'].forEach(nm =>
    assert.ok(got.indexOf(nm) >= 0, nm + ' 이 안 나옵니다: ' + got.join(' · ')));
});

test('★ 손으로 만든 폴더는 «제 이름»을 쓴다 — 대표가 붙인 이름이라 그게 맞다', () => {
  assert.ok(boxes(load()).indexOf('1.자문사답변') >= 0,
    '손으로 만든 칸 이름이 바뀌었습니다');
});

test('★★ 이름표를 «한 자리»에서 만든다 — 두 곳에 베끼면 한쪽만 고쳐진다', () => {
  const n = (src.match(/_box:\s*mbFolderLabel\(f\)/g) || []).length;
  assert.ok(n >= 2, '줄을 만드는 곳이 «같은 이름표»를 안 씁니다 (' + n + '곳)');
  assert.ok(!/_box:\s*String\(f\.name/.test(src),
    '아직 원문 이름을 그대로 쓰는 자리가 있습니다');
});

/* ══════ ② 열이 «자리»로 못 박혀 있다 ══════ */

test('★★ 칸 이름 칸에 «폭»이 있다 — 없으면 글자 길이만큼 늘었다 줄었다 한다', () => {
  const m = css.match(/\.dm-row \.box\{([^}]*)\}/);
  assert.ok(m, '칸 이름 규칙을 찾지 못했습니다');
  assert.match(m[1], /width:\s*\d+px/, '폭이 없습니다 — 줄마다 열이 흔들립니다');
  assert.ok(!/max-width/.test(m[1]),
    'max-width 로만 두면 짧은 이름에서 칸이 줄어 열이 또 흔들립니다');
});

test('★★ 왼쪽 정렬이다 — 오른쪽 정렬이면 이름 길이에 따라 시작점이 흔들린다', () => {
  const m = css.match(/\.dm-row \.box\{([^}]*)\}/);
  assert.match(m[1], /text-align:\s*left/, '왼쪽 정렬이 아닙니다');
});

test('★ 시각 칸도 «자리»다 — 여기가 흔들리면 그 왼쪽이 다 흔들린다', () => {
  const m = css.match(/\.dm-row \.at\{([^}]*)\}/);
  assert.ok(m, '시각 규칙을 찾지 못했습니다');
  assert.match(m[1], /width:\s*\d+px/, '시각 칸에 폭이 없습니다');
});
