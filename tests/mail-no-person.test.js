'use strict';
/* 「사람 안 붙임」 — 경조사·광고처럼 특정인을 정할 필요가 없는 메일 (대표 결정 2026-08-30)
   "업무와 직접 관련없는것은 어떻게 구분해야할까 … 경조사 나 광고등과 같은것은
    특정인 구분이 필요없을 수 있다"

   ★ 무엇으로 가르나 — «칸(폴더)»이다. 대표께서 이미 손으로 나눠 두신 것을 그대로
     믿는다. 제목 글자로 알아서 가르는 길은 안 골랐다 — 규칙이 어긋나면 «업무 메일이
     조용히 빠진다». 칸은 눈에 보이고, 옮기면 곧바로 따라온다.

   ⚠ 실측 2026-08-30 — 모두 7,332통 가운데 사람을 붙일 필요 없는 것이 2,321통(32%).
     그 큰 몫이 이미 칸으로 나뉘어 있다(13.경조사·뉴스레터 400 · 청구서 382 ·
     12.세금계산서 288 · 국민건강고용산재 188 · 명함 180 · 기타광고 95).

   ★ 여기서 못 박는 것
     ① 칸을 켜면 그 칸의 메일이 «사람 안 붙임»으로 간다
     ② 그만큼 «담당 모름»에서 빠진다 — 한 통이 두 곳에 겹치면 몇 통인지 알 수 없다
     ③ 세는 자리(mbWhoTally)와 거르는 자리(mbRowFits)가 «같은 답»을 낸다
        (어긋나면 「2통이라는데 열면 1통」이 된다)
     ④ 자문종료 «다음», 담당자 판정 «앞»이다 — 두 자리의 차례가 같아야 한다
     ⑤ 사람이 콕 집어 보낸 것(담당자 보내기)은 «이긴다» — 안 그러면 그 단추가 뜻을 잃는다
     ⑥ 끄면 그대로 되돌아온다
     ⑦ 켜고 끄는 자리가 «업무별 칸의 ⋮» 하나다 · 전 직원 공용으로 저장한다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

function fnBody(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}

/* ── 메일함 판정 부분만 떼어 돌린다 ── */
function load() {
  const state = {
    view: 'mail', mailSent: 'box', mbBox: '*all', mbDash: 'who',
    pick: {}, items: {}, mbQ: '', mbFilter: '', mbOpen: null, isAdmin: true
  };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (f) => f && f(), state, esc: (s) => String(s == null ? '' : s),
    Store: { mode: 'local' }, DB_ROOT: 'pucards',
    toast() {}, closeFolderMenu() {}, renderPCSide() {}, renderMailPage() {}, render() {},
    allItems: () => ({}), allGroups: () => ({}), isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [],
    coFTabCounts: () => ({ all: 0, byTab: {} }), _coFolders: {}, _coTagHidden: {},
    pickOf: (k) => (state.pick[k] = state.pick[k] || {}), pickOn: () => false,
    pickList: () => [], pickAllOn: () => false, pickClear() {}, pickHit() {},
    pickToggleAll() {}, pickRedraw() {},
    matMailCfg: () => ({ from: '' }), matList: () => [], matCat: () => '',
    MAT_CATS_NOW: () => [], _matMeta: {}, schedList: () => [],
    staffName: (b) => String(b || ''), fmtDate: () => '', fmtMB: (n) => n + 'B',
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => null, addEventListener() {}, removeEventListener() {} },
    $: () => null,
    window: { innerWidth: 1600, innerHeight: 900 },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    firebase: { auth: () => ({ currentUser: null }), database: () => ({ ref: () => ({ once: () => Promise.resolve({ val: () => null }), set: () => Promise.resolve() }) }) },
    ErpMatch: {
      staff: {}, nameBySid: {}, byName: {}, byBiz: {}, companies: [], ready: true,
      _norm: (s) => String(s || '').trim().toLowerCase().replace(/\s/g, ''),
      _digits: (s) => String(s || '').replace(/[^0-9]/g, ''),
      match: () => null
    }
  };
  vm.createContext(ctx);
  const cut = (from, to) => {
    const i = raw.indexOf(from);
    assert.ok(i > 0, from + ' 를 찾지 못했습니다');
    const j = raw.indexOf(to, i + from.length);
    assert.ok(j > i, to + ' 를 찾지 못했습니다');
    return raw.slice(i, j);
  };
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);

  /* 칸 둘 — 하나는 업무, 하나는 경조사 */
  vm.runInContext([
    "_mbFolders = { inbox:{slug:'inbox',name:'받은메일함',kind:'inbox',total:3},",
    "               gyeong:{slug:'gyeong',name:'13. 경조사·뉴스레터',kind:'custom',total:2} };",
    "_mbMsgs = { inbox:{ '1':{u:1,s:'업무 메일',e:'a@hanbit.co.kr',f:'김민근',d:2,r:1},",
    "                    '2':{u:2,s:'또 하나',e:'b@x.co.kr',f:'홍길동',d:1,r:0} },",
    "            gyeong:{ '10':{u:10,s:'[결혼] 결혼 알림',e:'service@kcplaa.or.kr',f:'노무사회',d:2,r:0},",
    "                     '11':{u:11,s:'[訃音] 부고',e:'service@kcplaa.or.kr',f:'노무사회',d:1,r:1} } };",
    "_mbBins = { b1:{ n:'업무', l:'inbox' }, b2:{ n:'경조사·광고', l:'gyeong' } };",
    '_mbNoWho = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {};',
    '_mbCo = {}; _mbNotCo = {}; _mbWhoMsg = {}; _mbBizSubs = {}; _mbMeta = {at:1, ok:true};'
  ].join('\n'), ctx);
  return ctx;
}
/* 줄 하나하나 — 거르개에 넣어 보려고 */
function allRows(c) {
  const out = [];
  const msgs = vm.runInContext('_mbMsgs', c);
  Object.keys(msgs).forEach((s) => Object.keys(msgs[s]).forEach((u) =>
    out.push(Object.assign({}, msgs[s][u], { _slug: s, _key: s + ':' + u }))));
  return out;
}
const on = (c, slug) => vm.runInContext('_mbNoWho = ' + JSON.stringify(slug ? { [slug]: 1 } : {}) + ';', c);

/* ══════ ①② 켜면 옮겨 간다 ══════ */
test('★★ 칸을 켜면 그 칸의 메일이 «사람 안 붙임»으로 가고, 그만큼 담당 모름에서 빠진다', () => {
  const c = load();
  c.mbMemoClear();
  const before = c.mbWhoTally();
  assert.equal(before.none.n, 4, '처음에는 넷 다 담당 모름이어야 이 검사가 뜻이 있습니다');
  assert.equal((before.off || {}).n || 0, 0, '아직 켜지도 않았는데 사람 안 붙임이 있습니다');

  on(c, 'gyeong');
  c.mbMemoClear();
  const after = c.mbWhoTally();
  assert.equal(after.off.n, 2, '★ 켠 칸의 메일이 안 옮겨졌습니다');
  assert.equal(after.none.n, 2,
    '★ 담당 모름에서 안 빠졌습니다 — 한 통이 두 곳에 겹치면 몇 통인지 알 수 없습니다');
  assert.equal(after.off.un, 1, '★ 안 읽은 수가 틀립니다');
});

/* ══════ ③ 두 자리가 같은 답 ══════ */
test('★★ 세는 자리와 거르는 자리가 «같은 답»을 낸다 — 어긋나면 「2통이라는데 열면 1통」', () => {
  const c = load();
  on(c, 'gyeong');
  c.mbMemoClear();
  const t = c.mbWhoTally();
  const rows = allRows(c);
  const OFF = vm.runInContext('MB_WHO_OFF', c);
  const NA = vm.runInContext('MB_WHO_NA', c);
  assert.equal(rows.filter((v) => c.mbRowFits(v, OFF)).length, t.off.n,
    '★ 사람 안 붙임 — 센 수와 담기는 수가 다릅니다');
  assert.equal(rows.filter((v) => c.mbRowFits(v, NA)).length, t.none.n,
    '★ 담당 모름 — 센 수와 담기는 수가 다릅니다');
});

/* ══════ ④ 차례 ══════ */
test('★★ 자문종료 «다음», 담당자 판정 «앞»이다 — 두 자리의 차례가 같아야 한다', () => {
  for (const fn of ['mbWhoTally', 'mbRowFits']) {
    const b = fnBody(fn);
    const iEnd = b.indexOf('mbEndedOfRow');
    const iOff = b.indexOf('mbNoWhoOfRow');
    const iWho = b.indexOf('mbWhoOfRow');
    assert.ok(iEnd > 0 && iOff > 0 && iWho > 0, fn + ' 에 셋이 다 없습니다');
    assert.ok(iEnd < iOff, '★ ' + fn + ' — 자문종료보다 앞섭니다');
    assert.ok(iOff < iWho, '★ ' + fn + ' — 담당자 판정보다 뒤집니다');
  }
});

/* ══════ ⑤ 사람이 이긴다 ══════ */
test('★★ 사람이 콕 집어 보낸 것은 «이긴다» — 안 그러면 [담당자 보내기]가 뜻을 잃는다', () => {
  const c = load();
  on(c, 'gyeong');
  vm.runInContext("_mbWhoMsg = {}; _mbWhoMsg[mbWhoKey('gyeong:10')] = '김혜민';", c);
  vm.runInContext("ErpMatch.staff['김혜민'] = { sid:'P-004', name:'김혜민', status:'active' };", c);
  c.mbMemoClear();
  const t = c.mbWhoTally();
  assert.equal(t.off.n, 1, '★ 사람에게 보낸 것까지 「사람 안 붙임」이 가져갔습니다');
  assert.equal(t.cnt['김혜민'] || 0, 1, '★ 그 사람 칸에 안 들어갔습니다');
});

/* ══════ ⑥ 되돌아온다 ══════ */
test('★ 끄면 그대로 되돌아온다', () => {
  const c = load();
  on(c, 'gyeong'); c.mbMemoClear();
  assert.equal(c.mbWhoTally().off.n, 2);
  on(c, ''); c.mbMemoClear();
  const t = c.mbWhoTally();
  assert.equal(t.off.n, 0, '★ 껐는데 남아 있습니다');
  assert.equal(t.none.n, 4, '★ 담당 모름으로 안 돌아왔습니다');
});

/* ══════ ⑦ 켜는 자리 ══════ */
test('★★ 켜고 끄는 자리가 «업무별 칸의 ⋮» 하나다', () => {
  const fn = fnBody('mbFolderMenu');
  assert.match(fn, /mbNoWhoSet\('\$\{slug\}'/, '★ 칸 메뉴에서 켤 수가 없습니다');
  assert.match(fn, /mbNoWhoBox\(slug\)/,
    '★ 지금 켜져 있는지를 안 보고 그립니다 — 켠 뒤에도 「켜기」라고 나옵니다');
});

test('★★ 전 직원 «공용»으로 저장한다 — 나만 켜지면 옆 사람 화면과 어긋난다', () => {
  const fn = fnBody('mbNoWhoSet');
  assert.match(fn, /DB_ROOT\s*\+\s*'\/config\/mailNoWho\//,
    '★ 저장을 안 하거나 내 컴퓨터에만 담습니다');
  assert.match(fn, /\.catch\(/, '★ 저장 실패를 안 알려 줍니다 — 켠 줄 알고 지나갑니다');
});

test('★ 읽어 오는 자리에도 들어가 있다 — 안 읽으면 새로고침 때마다 꺼진다', () => {
  const fn = fnBody('mbEnsureBins');
  assert.match(fn, /config\/mailNoWho/, '★ 새로고침하면 켠 것이 사라집니다');
  assert.match(fn, /_mbNoWho\s*=\s*nw\.val\(\)/, '★ 읽어 온 값을 안 담습니다');
  assert.match(fn, /_mbNoWho!==null/, '★ 다 읽었는지 판정에 안 넣었습니다 — 늘 다시 읽습니다');
});

/* ══════ 빈 칸은 안 그린다 ══════ */
test('★ 아무 칸도 안 켰으면 옆줄에 «안 그린다» — 빈 줄은 「이건 뭐지」가 된다', () => {
  const fn = fnBody('mailSideHtml');
  const i = fn.indexOf('mbNoWhoCount()');
  assert.ok(i > 0, '★ 옆줄에 사람 안 붙임 줄이 없습니다');
  assert.match(fn.slice(i, i + 160), /if\(noW\.n \|\| now===MB_WHO_OFF\)/,
    '★ 비어 있어도 그립니다 (보고 있을 때는 남겨야 합니다)');
});

test('★ 이름이 있다 — 칸을 열었을 때 무엇인지 나와야 한다', () => {
  const c = load();
  const OFF = vm.runInContext('MB_WHO_OFF', c);
  const nm = c.mbBoxName(OFF);
  assert.ok(nm && nm.indexOf(OFF) < 0, '★ 칸 이름이 없습니다: ' + nm);
});
