'use strict';
/* 공유가 «받는 쪽에 도착»하는가 (대표 보고 2026-08-29)

   ■ 무슨 일이 있었나
   "권형하가 공유했는데 전혀 공유가 안되었다."

   파 보니 **두 가지가 겹쳐 있었다.**

   ① **받는 쪽에 아무 신호가 없었다.** 여는 쪽은 초록 알림을 받는데, 받는 사람 화면에는
      한 글자도 안 떴다. 받은 사진으로 가는 길은 「누구 사진」 고르개 둘째 줄 하나뿐이라,
      사람이 일러 주지 않으면 평생 안 연다. 사진은 이미 가 있었다.

   ② **총괄관리자가 «남의» 사진을 열어 줄 수 없었다.** 공유는 두 자리에 한 묶음으로
      적히는데(사진 옆 shareWith · 받는 사람 목록 sharedTo), 규칙이 목록 자리만
      「사진 주인」으로 막고 있었다. 묶음 쓰기는 하나라도 막히면 통째로 취소된다.
      그래서 08-28 에 만든 「담당자에게 저절로 열어 주기」는 남이 올린 계약서 사진에서
      한 번도 동작한 적이 없다.

   ③ 곁가지로, setShare 만 아직 **주인을 안 받고** 있었다 — 늘 「내 자리」에 대고 써서
      관리자가 남의 사진을 열어 주면 있지도 않은 내 사진 밑에 유령이 생기고, 받는 쪽에는
      빈 사진 한 장이 뜬다. 화면은 「공유했습니다」라고 말한다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const RULES = path.join(R, 'docs', 'firebase-rules-현재적용본+분류이름표(붙여넣기용).json');
const rules = JSON.parse(fs.readFileSync(RULES, 'utf8')).rules;

/* ══════ ① 규칙 — 사진 자리와 목록 자리는 «한 묶음»이다 ══════
   이 짝이 어긋나면 쓰기가 통째로 취소된다. 사람이 기억으로 지킬 수 없어 검사로 못박는다. */

test('★★ 사진 자리에 쓸 수 있는 사람은 목록 자리에도 쓸 수 있다 — 한 묶음이라 반쪽이면 통째로 실패한다', () => {
  const photo = rules.puphotos.u['$uid']['.write'];
  const index = rules.puphotos.sharedTo['$uid']['$pid']['.write'];
  assert.ok(/isAdmin/.test(photo), '사진 자리 규칙이 바뀌었습니다 — 이 검사를 다시 보세요.');
  assert.ok(/isAdmin/.test(index),
    '★ 사진 옆(shareWith)에는 쓸 수 있는데 받는 사람 목록(sharedTo)에는 못 쓰면,\n' +
    '  묶음 쓰기가 통째로 취소되어 **아무것도 안 써집니다.**\n' +
    '  총괄관리자가 남이 올린 사진을 열어 주는 일이 영영 안 됩니다(2026-08-29 대표 보고).');
});

test('★ 그래도 아무나 남의 사진을 나에게 붙일 수는 없다', () => {
  const w = rules.puphotos.sharedTo['$uid']['$pid']['.write'];
  assert.ok(/newData\.child\('owner'\)\.val\(\) === auth\.uid/.test(w),
    '주인 조건까지 없애면 직원이 남의 사진을 아무에게나 붙일 수 있습니다.');
});

test('★ 읽기를 여는 것은 여전히 사진 옆 shareWith 하나다 — 목록은 색인일 뿐이다', () => {
  /* 목록 자리를 관리자에게 연 것이 «사진을 열어 준 것»이 되면 안 된다.
     읽기 조건에 sharedTo 가 끼어들면 색인을 적는 것만으로 남의 사진이 열린다. */
  const r = rules.puphotos.u['$uid'].items['$year']['$id']['.read'];
  assert.ok(/shareWith'\)\.child\(auth\.uid\)\.exists\(\)/.test(r));
  assert.ok(!/sharedTo/.test(r),
    '★ 읽기가 색인을 보면, 색인을 적는 것만으로 남의 사진이 열립니다.');
});

/* ══════ ② 저장 층 — setShare 도 주인 자리에 쓴다 ══════ */

function shareCtx() {
  const wrote = [];
  const ctx = {
    Object, Promise, Date, String,
    metaPath: function (y, id, owner) { return (owner || 'ME') + '/items/' + y + '/' + id; },
    sharedToPath: function (uid, id) { return 's/' + uid + '/' + id; },
    deps: { uid: 'ME', db: { ref: function () {
      return { update: function (u) { wrote.push(u); return Promise.resolve(); } };
    } } },
    _wrote: wrote
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(store, 'function setShare('), ctx);
  return ctx;
}

test('★★ 남의 사진을 열어 줄 때 «그 사람 자리»에 쓴다 — 내 자리에 쓰면 유령이 생긴다', async () => {
  const c = shareCtx();
  await c.setShare('2026', 'p1', ['u2'], [], 'BORAM');
  const u = c._wrote[0];
  assert.ok(u['BORAM/items/2026/p1/shareWith/u2'],
    '★ 내 자리에 쓰면 있지도 않은 사진 밑에 shareWith 만 남고, 받는 쪽에는 빈 사진이 뜹니다.\n' +
    '  화면은 「공유했습니다」라고 말합니다 — 막는 것보다 나쁩니다.');
  assert.equal(u['s/u2/p1'].owner, 'BORAM',
    '★ 색인의 주인이 틀리면 받는 쪽이 원본을 찾아가지 못합니다.');
});

test('주인을 안 주면 예전처럼 내 자리다 — 옛 부르는 자리가 안 깨진다', async () => {
  const c = shareCtx();
  await c.setShare('2026', 'p1', ['u2'], []);
  assert.ok(c._wrote[0]['ME/items/2026/p1/shareWith/u2']);
  assert.equal(c._wrote[0]['s/u2/p1'].owner, 'ME');
});

test('★ 주인 자신은 공유 대상에서 뺀다 — 남의 사진을 열어 줄 때도', async () => {
  const c = shareCtx();
  await c.setShare('2026', 'p1', ['BORAM', 'u2'], [], 'BORAM');
  const keys = Object.keys(c._wrote[0]);
  assert.ok(!keys.some(function (k) { return k.indexOf('/BORAM') >= 0; }),
    '자기 사진을 자기에게 열어 주면 「같이 볼 사람」에 자기 이름이 뜹니다.');
});

test('★ 화면이 주인을 실제로 넘긴다 — 저장 층만 받게 해 두면 아무 일도 안 일어난다', () => {
  const fn = cutFn(app, 'async function setShareTo(uids)');
  assert.match(fn, /PuPhotoStore\.setShare\(.*photoOwner\(id\)\)/,
    '★ 주인을 안 넘기면 저장 층이 «내» 자리에 씁니다 (08-27 증빙표시·08-28 업체지정과 같은 흠).');
  assert.match(fn, /photoYearOf\(id\)/,
    '★ 화면의 해(gridYear)로 두드리면 작년 사진은 빗나갑니다.');
});

/* ══════ ③ 세는 것은 «구독»이고, 사진을 한 장도 안 읽는다 ══════ */

test('★★ 장수는 색인 한 칸만 구독해서 얻는다 — 사진을 읽어 세면 열 때마다 통째로 내려받는다', () => {
  const fn = cutFn(store, 'function watchSharedCount(');
  assert.ok(fn, 'watchSharedCount 를 찾지 못했습니다.');
  assert.match(fn, /sharedToPath\(deps\.uid\)/, '내 색인 한 칸만 봅니다.');
  assert.ok(!/metaPath\(|loadFull|listSharedToMe/.test(fn),
    '★ 세는 데 사진을 읽으면, 사진첩을 열 때마다 「받은 사진」을 통째로 불러오는 셈입니다.');
  /* once() 뒤 같은 자리에 on() 을 걸면 두 번 받는다(요금 두 배) — 첫 값을 초기값으로 쓴다 */
  assert.ok(!/\.once\(/.test(fn),
    '★ once 로 읽고 다시 on 을 걸면 같은 자리를 두 번 받습니다.');
  assert.match(fn, /\.on\('value'/, '구독이라야 보는 중에 온 사진이 숫자에 반영됩니다.');
  assert.match(fn, /ref\.off\('value', handler\)/, '끊을 길이 없으면 화면을 옮길 때마다 쌓입니다.');
});

test('못 읽어도 화면은 산다 — 규칙이 막혀도 사진첩 자체가 안 죽어야 한다', () => {
  const fn = cutFn(store, 'function watchSharedCount(');
  assert.match(fn, /ref\.on\('value', handler, function \(\) \{ cb\(0\); \}\)/,
    '실패 자리를 안 주면 실시간DB 가 조용히 삼키고 숫자가 영영 안 뜹니다.');
});

/* ══════ ④ 받는 쪽 신호 — 이번 보고의 «진짜» 알맹이 ══════ */

/* ⚠ 2026-08-29 — 이 칸은 «딴 화면으로 가는 문»에서 **거르개**로 바뀌었다.
   대표 지시: "받은사진으로 나오지 말고 전체사진에서 같이 보이게 하고, 공유된 사진만
   따로 선택할 수 있게." 그래서 숫자도 «색인 전체»가 아니라 **지금 격자에 섞여 있는
   받은 사진 수**를 쓴다 — 색인은 다른 해 것까지 세므로 이 단추의 숫자로는 틀리다. */
function cardCtx(nShared, owner, on, opt) {
  opt = opt || {};
  const el = function () {
    const o = { style: {}, textContent: '', innerHTML: '', options: [], _cls: {} };
    o.classList = { toggle: function (k, v) { o._cls[k] = !!v; } };
    return o;
  };
  const nodes = { gotCard: el(), gotBox: el(), gotHint: el(), gotWho: el() };
  const items = [];
  /* 준 사람이 여럿일 수 있다(대표 지시 2026-08-29) — 기본은 한 사람이다 */
  const from = opt.from || [];
  for (let i = 0; i < nShared; i++) {
    items.push({ id: 's' + i, _shared: true,
      meta: { __ownerUid: from[i] || 'U2', __ownerName: (from[i] || 'U2') === 'U2' ? '권형하' : '박은비' } });
  }
  items.push({ id: 'mine', _shared: false, meta: {} });     // 내 사진도 섞여 있다
  const ctx = {
    Number, String, Object,
    $: function (id) { return nodes[id] || null; },
    esc: function (s) { return String(s == null ? '' : s); },
    idsOf: function () { return [1]; },
    SHARED_OWNER: '__shared__',
    gridItems: items,
    isSharedItem: function (it) { return !!(it && it._shared); },
    sharedByName: function (it) { return (it && it.meta && it.meta.__ownerName) || ''; },
    sharedOnly: !!on,
    sharedWho: opt.who || '',
    gridOwner: owner,
    _nodes: nodes
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function sharedPeople(') + '\n' +
    cutFn(app, 'function renderGotCard('), ctx);
  ctx.renderGotCard();
  return ctx;
}

test('★★ 받은 사진이 섞여 있으면 «장수와 함께» 걸러 볼 길을 준다', () => {
  const c = cardCtx(16, null, false);
  assert.equal(c._nodes.gotCard.style.display, 'block',
    '★ 받는 쪽에 아무 신호가 없으면, 사진이 가 있어도 「안 왔다」와 같습니다.');
  assert.match(c._nodes.gotBox.textContent, /16장/,
    '★ 몇 장인지 없으면 눌러 볼 값을 사람이 못 정합니다.');
});

test('★★ 숫자는 «지금 격자에 섞인 것»을 센다 — 색인 전체를 쓰면 다른 해 것까지 세어 거짓이 된다', () => {
  const c = cardCtx(3, null, false);
  assert.match(c._nodes.gotBox.textContent, /3장/);
  assert.ok(!/4장/.test(c._nodes.gotBox.textContent), '내 사진까지 세면 안 됩니다');
});

test('★ 켜 두면 «켠 티»가 나고 끄는 길이 함께 보인다', () => {
  const c = cardCtx(16, null, true);
  assert.equal(c._nodes.gotBox._cls.on, true, '★ 걸러 보는 중인지 모르면 사진이 사라진 줄 압니다');
  assert.match(c._nodes.gotBox.textContent, /전체 보기/, '★ 되돌아갈 길이 그 자리에 있어야 합니다');
});

test('★ 0장이면 칸 자체를 안 그린다 — 늘 있는 회색 칸은 눌러 볼 값이 없다', () => {
  assert.equal(cardCtx(0, null, false)._nodes.gotCard.style.display, 'none');
});

test('★ 켜 둔 채 0장이 되어도 칸은 남는다 — 안 남기면 끄는 길이 사라진다', () => {
  assert.equal(cardCtx(0, null, true)._nodes.gotCard.style.display, 'block',
    '★ 칸이 사라지면 「공유받은 것만」에 갇혀 전체로 돌아올 수가 없습니다');
});

test('★ 「받은 사진 — 다른 해까지」 화면에서는 접는다 — 거기는 이미 받은 것뿐이다', () => {
  assert.equal(cardCtx(16, '__shared__', false)._nodes.gotCard.style.display, 'none');
});

test('★★ 고르개 줄에도 장수를 적는다 — 폰에는 옆 칸이 없고 이 줄만 있다', () => {
  const opts = [
    { value: '', textContent: '내 사진' },
    { value: '__shared__', textContent: '나와 공유된 사진' }
  ];
  const ctx = {
    $: function () { return { options: opts, length: 2 }; },
    SHARED_OWNER: '__shared__',
    sharedCount: 25
  };
  ctx.$ = function () { return { options: Object.assign(opts, { length: 2 }) }; };
  /* 2026-08-29: 같은 함수가 「👤 …님이 준 사진」 줄도 맞춘다 — 여기서는 받은 것이
     없다고 두고, 사람 줄은 아래 제 검사에서 본다. */
  ctx.syncSharedWhoOptions = function () {};
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function renderOwnerSelLabel('), ctx);
  ctx.renderOwnerSelLabel();
  assert.match(opts[1].textContent, /25장/,
    '★ 폰에서 옆 칸을 접었으므로, 이 줄까지 비면 폰 쓰는 사람에게는 다시 아무 신호가 없습니다.');
  assert.equal(opts[0].textContent, '내 사진', '다른 줄을 건드리면 안 됩니다.');
});

test('★ 고르개를 다시 그릴 때마다 장수를 다시 적는다 — 안 적으면 숫자가 조용히 사라진다', () => {
  const fn = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/)[0];
  const setHtml = (fn.match(/ownerSel'\)\.innerHTML =/g) || []).length;
  const relabel = (fn.match(/renderOwnerSelLabel\(\)/g) || []).length;
  assert.ok(setHtml >= 2, '고르개를 만드는 자리가 ' + setHtml + '곳입니다 — 검사를 다시 보세요.');
  assert.equal(relabel, setHtml,
    '★ 고르개를 새로 만드는 자리 ' + setHtml + '곳 중 ' + relabel + '곳에만 장수를 적습니다.');
});

test('★ 세는 일은 관리자만의 것이 아니다 — 누구나 받는다', () => {
  const fn = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/)[0];
  const watch = fn.indexOf('watchShared()');
  const admin = fn.indexOf('amAdmin()');
  assert.ok(watch >= 0 && watch < admin,
    '★ 관리자 판정 뒤에 두면 직원에게는 영영 숫자가 안 뜹니다 — 직원끼리 주고받는 것이 목적입니다.');
});

/* ══════ ⑤ 막혔을 때 «틀린 말»을 하지 않는다 ══════ */

/* ⚠ **주석은 걷어내고 본다.** 왜 그 문구를 버렸는지 적어 둔 주석까지 걸리면, 다음 사람이
   설명을 지우게 된다 — 검사가 기록을 지우라고 시키는 꼴이다. 우리가 막으려는 것은
   «사람 눈에 뜨는 글자»다. */
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }

test('★★ 「내가 올린 사진에만」이라고 하지 않는다 — 관리자에게는 틀린 말이고 엉뚱한 데를 뒤지게 한다', () => {
  ['function submitShareMany(', 'function autoShareByCo('].forEach(function (f) {
    const fn = noComments(cutFn(app, f));
    assert.ok(!/내가 올린 사진에만/.test(fn),
      '★ ' + f + ' — 총괄관리자는 사진 자리에 쓸 수 있습니다.\n' +
      '  막는 것은 받는 사람 목록 자리 하나이고, 규칙을 한 번 붙여넣으면 열립니다.');
    assert.match(fn, /shareDeniedHint\(/,
      '★ ' + f + ' — 까닭을 안 붙이면 사람이 원인을 못 짚습니다.');
  });
});

test('★ 업체 담당자 자동 공유가 «조용히» 실패하지 않는다', () => {
  const fn = cutFn(app, 'function autoShareByCo(');
  assert.match(fn, /lastErr = e/,
    '★ 까닭을 안 쥐고 있으면 무엇 때문에 막혔는지 말할 수가 없습니다.');
  assert.ok(/else if \(lastErr\)/.test(fn),
    '★ 한 장도 못 열었는데 아무 말이 없으면 「분명 업체를 달았는데 저쪽은 못 본다」가 됩니다.');
});

test('★ 크게 보기의 「같이 볼 사람」이 «전체 근로자» 화면에서 살아 있다', () => {
  /* viewingOther() 는 「전체 근로자」면 내 사진이어도 참이라, 총괄관리자가 늘 켜 두는
     화면에서 이 칸이 통째로 사라져 있었다 — 도구줄에서 08-28 에 고친 것과 같은 흠이다. */
  const fn = cutFn(app, 'function shareBox(');
  assert.match(fn, /mayTouch\(it\.id\)/,
    '★ 막는 쪽(mayTouch)과 보여 주는 쪽의 기준이 다르면 「눌러도 되는데 단추가 없는」 자리가 생깁니다.');
  assert.ok(!/viewingOther\(\)/.test(fn),
    '★ viewingOther 로 되돌리면 「전체 근로자」 화면에서 다시 죽습니다.');
});
