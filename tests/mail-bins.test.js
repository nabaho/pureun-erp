/* 푸른 분류 — 우리 앱에서만 메일을 갈라 두는 층 (대표 지시 2026-08-26)
   "다음메일의 폴더는 그대로 유지한다.
    오로지 푸른메일함에 있는 메일을 구분해서 정리하려는 것이다."

   ★ 여기서 지키는 것은 «모양»이 아니라 이 다섯이다.
     1. 옮겨도 다음메일에는 아무것도 쓰지 않는다 — 서버를 부르지 않는다
     2. 아직 안 옮긴 메일은 다음이 넣은 자리를 그대로 비춘다(첫 화면이 지금과 같다)
     3. 옮기면 그 칸에 나타나고 원래 자리에서 빠진다 — 두 곳에 겹쳐 있으면 몇 통인지 모른다
     4. 「다음메일 원본」은 우리가 옮긴 것을 «모른 척»한다 — 그것이 그 자리가 있는 까닭
     5. 되돌리면 제자리로, 칸을 지워도 메일은 하나도 사라지지 않는다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). 「그 칸에 그 메일이 있다」는
     보지만 「몇 번째 줄인가」는 보지 않는다. */
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

/* 다음메일에 있는 그대로 — 손으로 만든 폴더 둘과 기본 칸 하나 */
const FOLDERS = {
  B_INBOX: { path:'INBOX', name:'INBOX', kind:'inbox', order:1, total:2, unseen:1 },
  B_GONG:  { path:'6.공공기관', name:'6.공공기관', kind:'custom', order:7, total:3, unseen:1 },
  B_JAMUN: { path:'1.자문사답변', name:'1.자문사답변', kind:'custom', order:7, total:1, unseen:0 }
};
const MSGS = {
  B_INBOX: {
    '10': { u:10, f:'세무법인', e:'tax@x.kr', s:'소득세 확인', d:1756000000000, r:0, g:0, a:0 }
  },
  B_GONG: {
    '20': { u:20, f:'정지윤', e:'j@mss.go.kr', s:'[충남중기청] 근무일정', d:1756000200000, r:1, g:0, a:0 },
    '21': { u:21, f:'정지윤', e:'j@mss.go.kr', s:'[충남중기청] 상담일지', d:1756000300000, r:0, g:0, a:1 },
    '22': { u:22, f:'창업진흥원', e:'k@kised.or.kr', s:'모두의창업', d:1756000100000, r:1, g:0, a:0 }
  },
  B_JAMUN: {
    '30': { u:30, f:'박노무', e:'p@abc.kr', s:'연차 문의', d:1756000400000, r:1, g:0, a:0 }
  }
};

/* 메일함 덩어리를 값으로만 돌린다 — 실제 서버·화면에 붙지 않는다 */
function load(over){
  const o = over || {};
  const held = { calls:[], toasts:[], wrote:{}, fetched:0 };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null
  }, o.state || {});

  /* ⚠ 저장은 «흉내»만 낸다. 무엇을 적으려 했는지는 held.wrote 에 남는다 —
       「다음메일을 안 건드린다」를 보려면 무엇을 적었는지 봐야 한다. */
  const dbRef = (p) => ({
    once: () => Promise.resolve({ val: () => null }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    update: (v) => { held.wrote[p] = Object.assign(held.wrote[p]||{}, v); return Promise.resolve(); },
    remove: () => { held.wrote[p] = null; return Promise.resolve(); }
  });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' },
    matMailCfg: () => ({ from: '370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {},
    schedList: () => [], staffName: b => String(b || ''),
    fmtDate: () => '2026.08.26', fmtMB: n => n + 'B',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [], coFTabCounts: () => ({all:0,byTab:{}}),
    _coFolders: {}, _coTagHidden: {},
    toast: m => held.toasts.push(String(m)),
    confirm: () => (o.confirm !== false),
    /* 덩어리 «밖»에 있는 것들 — 창 닫기와 저장 뿌리 */
    closeFolderMenu(){}, DB_ROOT:'pucards',
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: (sel, id) => !!(sel && sel[id]),
    pickList: (sel, ids) => (ids||[]).filter(i => !!(sel && sel[i])),
    pickAllOn: (sel, ids) => !!(ids && ids.length) && ids.every(i => !!(sel && sel[i])),
    pickClear: k => { state.pick[k] = {}; },
    pickHit: (k, id) => { const s = state.pick[k] = state.pick[k]||{}; s[id] = !s[id]; },
    pickToggleAll(){}, pickRedraw(){},
    renderPCSide(){ }, renderMailPage(){ held.calls.push('render'); },
    render(){ held.calls.push('render'); },
    /* 그리는 함수가 진짜로 들어 있다(덩어리를 통째로 돌린다) — 받아 줄 자리를 둔다 */
    document: { getElementById: () => null },
    $: () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{}, offsetHeight:100,
                value:'', focus(){}, select(){}, contains:()=>false }),
    /* ★ 다음메일에 손대는 길은 이 둘뿐이다 — 여기가 울리면 다음메일이 바뀐 것이다 */
    fetch: (url) => { held.fetched++; held.calls.push('fetch:'+url); return Promise.resolve({ json:()=>Promise.resolve({ok:true}) }); },
    firebase: {
      auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('T') } }),
      database: () => ({ ref: (p) => dbRef(p) })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(o.folders || FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(o.msgs || MSGS) + ';' +
    '_mbBins = ' + JSON.stringify(o.bins || {}) + ';' +
    '_mbPut = ' + JSON.stringify(o.put || {}) + ';' +
    '_mbOrder = {};' +
    '_mbMeta = { at: 1, ok: true };', ctx);
  ctx._held = held;
  ctx.__put = () => vm.runInContext('JSON.stringify(_mbPut)', ctx);
  ctx.__bins = () => vm.runInContext('JSON.stringify(_mbBins)', ctx);
  return ctx;
}

/* 지금 보는 칸의 제목들 — 「그 칸에 무엇이 있나」를 글로 견준다.
   ⚠ 배열로 견주지 않는다. 덩어리 안에서 만든 배열은 바깥 배열과 «다른 종류»라
     deepStrictEqual 이 눈에 똑같은 것을 두고도 다르다고 한다(vm 의 결). */
function subjects(c, box){
  c.state.mbBox = box;
  return c.mbAllRows().map(v=>v.s).sort().join(' | ');
}

/* ══════ 하나 — 다음메일에는 아무것도 쓰지 않는다 ══════ */

test('★ 옮겨도 다음메일에 손대지 않는다 — 서버를 부르지 않고 쪽지 한 줄만 적는다', () => {
  const c = load();
  c.state.mbBox = 'B_GONG';
  c.state.pick.mbox = { 'B_GONG:20': true, 'B_GONG:21': true };
  c.mbBinPut('B_JAMUN');
  assert.equal(c._held.fetched, 0, '다음메일 서버를 불렀다 — 거울이 원본을 고쳤다');
  const wrote = Object.keys(c._held.wrote);
  assert.ok(wrote.length, '아무것도 적지 않았다');
  wrote.forEach(p=>assert.ok(p.indexOf('mailbox') < 0,
    '다음메일 자리(mailbox)에 적으려 했다 — 거기는 서버만 적는다: ' + p));
  const put = JSON.parse(c.__put());
  assert.equal(put['B_GONG:20'], 'B_JAMUN', '쪽지가 안 적혔다');
  assert.equal(put['B_GONG:21'], 'B_JAMUN', '쪽지가 안 적혔다');
});

/* ══════ 둘 — 손대지 않은 메일은 다음 자리를 그대로 비춘다 ══════ */

test('★ 쪽지가 하나도 없으면 첫 화면이 지금과 똑같다 — 베껴 넣을 것이 없다', () => {
  const c = load();
  /* 다음 폴더 하나하나가 그대로 우리 칸이 된다 */
  const names = c.mbBins().map(b=>b.name).sort().join(' | ');
  assert.equal(names, '1.자문사답변 | 6.공공기관', '다음 폴더가 그대로 칸이 되지 않았다');
  /* 그 칸을 열면 그 폴더에 있는 것이 그대로 나온다 */
  assert.equal(subjects(c, '~B_GONG'), subjects(c, '#B_GONG'),
    '아무것도 안 옮겼는데 우리 칸과 다음 원본이 다르다');
});

test('★ 다음에 새 폴더가 생기면 우리 칸에도 저절로 나타난다 — 적어 두지 않아도', () => {
  const folders = Object.assign({}, FOLDERS, {
    B_NEW: { path:'20.새폴더', name:'20.새폴더', kind:'custom', order:7, total:0, unseen:0 }
  });
  const c = load({ folders });
  assert.ok(c.mbBins().some(b=>b.name==='20.새폴더'), '새로 생긴 다음 폴더가 안 보인다');
});

/* ══════ 셋 — 옮기면 그 칸에 나타나고 원래 자리에서 빠진다 ══════ */

test('★ 옮긴 메일은 그 칸에 나타난다', () => {
  const c = load({ put: { 'B_GONG:20': 'B_JAMUN' } });
  assert.ok(subjects(c, '~B_JAMUN').indexOf('근무일정') >= 0, '옮긴 메일이 그 칸에 없다');
});

test('★ 옮긴 메일은 원래 칸에서 빠진다 — 두 곳에 겹쳐 있으면 몇 통인지 모른다', () => {
  const c = load({ put: { 'B_GONG:20': 'B_JAMUN' } });
  assert.ok(subjects(c, '~B_GONG').indexOf('근무일정') < 0, '옮겼는데 원래 칸에도 남아 있다');
});

test('★ 기본 칸(받은메일함)에서도 빠진다 — 정리했는데 받은메일함이 그대로면 정리가 아니다', () => {
  const c = load({ put: { 'B_INBOX:10': 'B_JAMUN' } });
  assert.ok(subjects(c, 'B_INBOX').indexOf('소득세') < 0, '받은메일함에 그대로 남아 있다');
  assert.ok(subjects(c, '~B_JAMUN').indexOf('소득세') >= 0, '옮긴 칸에 없다');
});

test('칸 셈도 함께 움직인다 — 왼쪽 숫자와 목록이 어긋나면 어느 쪽도 못 믿는다', () => {
  const a = load();
  const b = load({ put: { 'B_GONG:20': 'B_JAMUN' } });
  const gongA = a.mbBinCount(a.mbBinBy('B_GONG')).n;
  const gongB = b.mbBinCount(b.mbBinBy('B_GONG')).n;
  assert.equal(gongB, gongA - 1, '옮겼는데 원래 칸 셈이 그대로다');
  assert.equal(b.mbBinCount(b.mbBinBy('B_JAMUN')).n,
               a.mbBinCount(a.mbBinBy('B_JAMUN')).n + 1, '옮긴 칸 셈이 안 늘었다');
});

/* ══════ 넷 — 다음메일 원본은 우리가 옮긴 것을 모른 척한다 ══════ */

test('★ 다음메일 원본은 우리가 옮긴 것과 상관없이 그대로다 — 그것이 이 자리가 있는 까닭', () => {
  const a = load();
  const b = load({ put: { 'B_GONG:20': 'B_JAMUN', 'B_GONG:21': 'B_JAMUN' } });
  assert.equal(subjects(b, '#B_GONG'), subjects(a, '#B_GONG'),
    '다음메일 원본이 우리가 옮긴 것을 따라 움직였다');
});

test('★ 원본 자리에서는 옮기지 않는다 — 끌 수도, 되돌릴 수도 없다', () => {
  const c = load();
  c.state.mbBox = '#B_GONG';
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('mbRowDragStart(') < 0, '원본에서 메일을 끌 수 있다');
  assert.ok(h.indexOf('mbBinUndo()') < 0, '원본에 되돌리기가 있다');
});

test('옮긴 메일에는 «다음에서는 어디 있나»가 적힌다 — 없으면 사라진 줄 안다', () => {
  const c = load({ put: { 'B_GONG:20': 'B_JAMUN' } });
  c.state.mbBox = '~B_JAMUN';
  assert.match(c.mbBoxHtml(), /다음:/, '다음메일 어디에 있는지 안 적혀 있다');
});

/* ══════ 다섯 — 되돌리기 · 칸 지우기 ══════ */

test('★ 되돌리면 다음이 넣은 제자리로 간다', () => {
  const c = load({ put: { 'B_GONG:20': 'B_JAMUN' } });
  c.state.mbBox = '~B_JAMUN';
  c.state.pick.mbox = { 'B_GONG:20': true };
  c.mbBinUndo();
  assert.equal(c.__put(), '{}', '쪽지가 안 지워졌다');
  assert.ok(subjects(c, '~B_GONG').indexOf('근무일정') >= 0, '제자리로 안 돌아왔다');
});

test('★ 이어진 그 폴더로 되돌려 놓으면 쪽지를 «지운다» — 쪽지는 적을수록 좋다', () => {
  const c = load({ put: { 'B_GONG:20': 'B_JAMUN' } });
  c.state.mbBox = '~B_JAMUN';
  c.state.pick.mbox = { 'B_GONG:20': true };
  c.mbBinPut('B_GONG');                       /* 원래 폴더와 이어진 칸으로 되돌린다 */
  assert.equal(c.__put(), '{}', '제자리로 돌려놓고도 쪽지를 들고 있다');
});

test('★ 칸을 지워도 메일은 하나도 사라지지 않는다 — 다음메일은 처음부터 그대로였다', async () => {
  const c = load({ bins: { NB: { n:'충남중기청', l:'' } },
                   put: { 'B_GONG:20':'NB', 'B_GONG:21':'NB' } });
  c.mbBinDelete('NB');
  await new Promise(r=>setImmediate(r));      /* 저장이 끝난 뒤에 쪽지를 뗀다 */
  assert.equal(c._held.fetched, 0, '칸을 지우면서 다음메일을 불렀다');
  assert.ok(subjects(c, '~B_GONG').indexOf('근무일정') >= 0, '메일이 제자리로 안 돌아왔다');
  assert.ok(subjects(c, '#B_GONG').indexOf('상담일지') >= 0, '다음메일 원본에서 사라졌다');
});

/* ══════ 새 칸 ══════ */

test('★ 새로 만든 칸은 다음 폴더와 이어지지 않는다 — 옮겨 넣은 것만 담긴다', () => {
  const c = load({ bins: { NB: { n:'충남중기청', l:'' } } });
  assert.equal(subjects(c, '~NB'), '', '아무것도 안 넣었는데 메일이 들어 있다');
  const b = c.mbBinBy('NB');
  assert.equal(b.link, '', '새 칸이 다음 폴더에 묶여 있다');
});

test('★ 이름을 바꿔도 다음메일 폴더 이름은 그대로다', () => {
  const c = load();
  c.$ = () => ({ value:'공공기관(새이름)', focus(){}, select(){},
                 set innerHTML(v){}, get innerHTML(){ return ''; }, style:{}, offsetHeight:100 });
  c.mbBinDoRename('B_GONG');
  assert.equal(c._held.fetched, 0, '이름을 바꾸며 다음메일을 불렀다');
  assert.ok(c.mbBins().some(b=>b.name==='공공기관(새이름)'), '우리 쪽 이름이 안 바뀌었다');
  assert.equal(c.mbFolderBy('B_GONG').name, '6.공공기관', '다음메일 폴더 이름이 바뀌었다');
});

/* ══════ 읽어 오기 ══════ */

test('★ 우리 칸을 열면 «옮겨 온 메일이 있던 폴더»도 함께 읽어 온다 — 안 그러면 사라져 보인다', () => {
  const c = load({ bins: { NB: { n:'섞인 칸', l:'' } },
                   put: { 'B_GONG:20':'NB', 'B_INBOX:10':'NB' } });
  const need = c.mbNeedSlugs('~NB').sort().join(' ');
  assert.equal(need, 'B_GONG B_INBOX', '옮겨 온 메일이 있던 폴더를 안 읽어 온다');
});

test('다음메일 원본을 열면 그 폴더 하나만 읽어 온다 — 스물여덟을 다 읽으면 요금이 된다', () => {
  const c = load();
  assert.equal(c.mbNeedSlugs('#B_GONG').join(' '), 'B_GONG');
});

/* ══════ 이름 ══════ */

test('★ 같은 이름이 두 곳에 나오므로 어느 쪽인지 적어 준다', () => {
  const c = load();
  assert.equal(c.mbBoxName('~B_GONG'), '6.공공기관');
  assert.match(c.mbBoxName('#B_GONG'), /다음메일 원본/, '어느 쪽인지 알 수 없다');
});
