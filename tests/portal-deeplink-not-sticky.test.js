/* 딥링크(?q=)는 «한 번»만 — 창이 검색 한 건에 갇히지 않는다 (대표 제보 2026-09-08)
   「기업정보함에 왜 자꾸 이권우가 항상 올라오나 문제 있는지 검토해라」

   ■ 무엇이 일어났나 (대표 화면 주소: pu-cards.html?q=010-7797-7572&v=ebf570f6)
     ① 사진첩의 「기업정보함에서 이 명함 보기 →」가 pu-cards.html?q=010-… 로 열었다.
        (?q= 에 «전화번호»를 담고 sso= 가 없는 곳은 사진첩뿐이다 — openFiledCard)
     ② 기업정보함은 ?q= 를 읽어 검색만 걸고 «주소에서 지우지 않았다».
     ③ 새 판이 올라올 때마다 pu-version.js 가 그 쿼리를 «그대로 들고» 새로고침했다
        (?q=…&v=새커밋 — 대표 주소의 v=ebf570f6 이 그 흔적이다).
     ④ 포털에서 기업정보함 타일을 눌러도 origin·pathname «만» 견주어
        「이미 그 화면」으로 보고 focus() 만 했다 — 주소가 안 바뀌니 그대로였다.
   → 그 탭은 그 한 사람에 갇혔다. 자료도 판독도 멀쩡했고, «주소»가 문제였다.

   ★ 못 박는 것
     ① ?q= 는 화면에 걸린 뒤 «주소에서 지워진다». 딥링크는 한 번 쓰는 심부름이다.
     ② 그때 «q 하나»만 지운다 — 통째로 지우면 ?view=mail 로 열린 메일 창이
        새로고침될 때 명함 화면으로 바뀐다.
     ③ 화면은 그대로 둔다 — 주소만 지운다. 결과가 눈앞에서 사라지면 안 된다.
     ④ 포털이 창을 다시 쓸 때 «어느 화면인지 정하는» 쿼리를 견준다.
     ⑤ 그런데 v·sso 는 «빼고» 견준다 — 타일이 붙이는 v 는 10분마다 달라져,
        견주는 데 넣으면 10분마다 보던 자리를 잃는다(pathname 만 보던 까닭이 그것이다).

     node --test tests/portal-deeplink-not-sticky.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CARDS = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');
const ENTER = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').split('\r\n').join('\n');
const PHOTOS = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8').split('\r\n').join('\n');

/* ══════ ①②③ 기업정보함 — 딥링크를 한 번 쓰고 주소에서 지운다 ══════ */

/* 그 덩이를 통째로 떠서 «돌린다» — 글자만 찾으면 지우기를 꺼도 통과한다 */
const A = '/* URL ?q= 딥링크';
const B = '/* 폴더 계층 폐지';
function runDeepLink(href) {
  const i = CARDS.indexOf(A), j = CARDS.indexOf(B);
  assert.ok(i > 0 && j > i, '딥링크 덩이를 못 찾았다');
  const boxes = { search: { value: '' }, pcSearch: { value: '' } };
  const ctx = {
    console, Object, String, Number, Array, URL, URLSearchParams,
    location: new URL(href),                       /* pathname·search·href 를 다 갖는다 */
    history: { replaceState: (a, b, u) => { ctx._url = u; } },
    state: {}, $: id => boxes[id] || null,
    _syncSearchX: () => { ctx._x = true }
  };
  vm.createContext(ctx);
  vm.runInContext(CARDS.slice(i, j), ctx);
  ctx.boxes = boxes;
  return ctx;
}

test('★★★ ?q= 로 들어오면 검색이 걸리고, 주소에서는 «지워진다»', () => {
  const c = runDeepLink('https://nabaho.github.io/pureunall/pu-cards.html?q=010-7797-7572&v=ebf570f6');
  /* 화면에는 그대로 걸린다 — 지우는 것은 주소뿐이다(③) */
  assert.equal(c.state.q, '010-7797-7572', '★ 검색어가 화면에 안 걸렸다');
  assert.equal(c.boxes.search.value, '010-7797-7572', '★ 찾기 칸이 비어 있다');
  assert.equal(c.boxes.pcSearch.value, '010-7797-7572', '★ PC 찾기 칸이 비어 있다');
  assert.equal(c.state.group, 'all', '★ 폴더를 안 풀었다 — 좁은 폴더에서 0건이 된다');
  /* 주소에서는 사라진다(①) — 이것이 없으면 F5·새 판마다 그 한 사람만 보인다 */
  assert.ok(c._url !== undefined, '★ 주소를 안 고쳤다 — 그 탭이 이 검색에 갇힌다');
  assert.ok(String(c._url).indexOf('q=') < 0,
    '★ 주소에 q= 가 남았다(' + c._url + ') — 새로고침마다 같은 사람이 다시 뜬다');
});

test('★★★ «q 하나»만 지운다 — 통째로 지우면 메일 창이 명함으로 바뀐다', () => {
  const c = runDeepLink('https://x.io/pureunall/pu-cards.html?view=mail&q=김철수&sso=1&v=123');
  const u = new URL('https://x.io' + String(c._url));
  assert.equal(u.searchParams.get('q'), null, '★ q 가 안 지워졌다');
  assert.equal(u.searchParams.get('view'), 'mail',
    '★★ view=mail 이 사라졌다 — 메일 창이 새로고침되면 명함 화면이 열린다');
  assert.equal(u.searchParams.get('sso'), '1', '★ sso 가 사라졌다');
  assert.equal(u.pathname, '/pureunall/pu-cards.html', '★ 경로가 바뀌었다');
});

test('★★ q 가 없으면 주소를 «건드리지 않는다» — 헛일은 하지 않는다', () => {
  const c = runDeepLink('https://x.io/pureunall/pu-cards.html?sso=1&v=123');
  assert.equal(c._url, undefined, '★ q 도 없는데 주소를 고쳤다');
  assert.equal(c.state.q, undefined, '★ 없는 검색어를 걸었다');
});

test('★★ 지우기가 «검색을 건 뒤»에 온다 — 먼저 지우면 검색어를 잃는다', () => {
  const seg = CARDS.slice(CARDS.indexOf(A), CARDS.indexOf(B));
  const at = seg.indexOf('state.q = _uq');
  const del = seg.indexOf("searchParams.delete('q')");
  assert.ok(at > 0 && del > at,
    '★ 주소를 먼저 지운다 — 그 뒤에 읽으면 검색어가 빈 채로 걸린다');
});

/* ══════ ④⑤ 포털 — 창을 다시 쓸 때 무엇을 견주나 ══════ */

function portal() {
  const a = ENTER.indexOf('var PORTAL_URL_NOISE');
  const b = ENTER.indexOf('function navigatePortalApp');
  assert.ok(a > 0 && b > a, '포털 견주기 덩이를 못 찾았다');
  const ctx = { console, Object, String, Array, URL, URLSearchParams,
    location: { href: 'https://nabaho.github.io/pureunall/enter.html' } };
  vm.createContext(ctx);
  vm.runInContext(ENTER.slice(a, b).replace(/^\s*var PORTAL_URL_NOISE/m, 'var PORTAL_URL_NOISE'), ctx);
  ctx.hit = (now, want) => ctx.portalAppUrlMatches({ location: { href: now } }, want);
  return ctx;
}
const TILE = 'pu-cards.html?sso=1&v=2981415';          /* 기업정보함 타일이 여는 주소 */
const BASE = 'https://nabaho.github.io/pureunall/';

test('★★★ 검색에 갇힌 창은 «다시 옮겨 준다» — 이것이 대표가 겪은 증상이다', () => {
  const p = portal();
  assert.equal(p.hit(BASE + 'pu-cards.html?q=010-7797-7572&v=ebf570f6', TILE), false,
    '★★ 「이미 그 화면」으로 보고 focus 만 한다 — 타일을 눌러도 그 한 사람만 계속 보인다');
});

test('★★★ 그냥 열려 있는 창은 «그대로 둔다» — 10분마다 자리를 잃으면 안 된다', () => {
  const p = portal();
  /* 타일이 붙이는 v 는 10분 버킷이라 계속 달라진다. 이것까지 견주면 새로고침된다. */
  assert.equal(p.hit(BASE + 'pu-cards.html?sso=1&v=2981415', TILE), true,
    '★ 같은 화면인데 다시 읽는다');
  assert.equal(p.hit(BASE + 'pu-cards.html?sso=1&v=2981499', TILE), true,
    '★★ v 가 달라졌다고 새로고침한다 — 10분마다 보던 자리를 잃는다');
  assert.equal(p.hit(BASE + 'pu-cards.html?v=ebf570f6', TILE), true,
    '★★ 새 판으로 갈아탄 창을 다시 읽는다 — 새 판이 올 때마다 자리를 잃는다');
  assert.equal(p.hit(BASE + 'pu-cards.html', TILE), true, '★ 쿼리 없는 창을 다시 읽는다');
});

test('★★★ 메일과 명함은 «다른 화면»이다 — 같은 파일이라 pathname 으로는 못 가린다', () => {
  const p = portal();
  const MAIL = 'pu-cards.html?view=mail&sso=1&v=2981415';
  assert.equal(p.hit(BASE + 'pu-cards.html?view=mail&v=1', MAIL), true, '★ 메일 창을 다시 읽는다');
  assert.equal(p.hit(BASE + 'pu-cards.html?sso=1&v=1', MAIL), false,
    '★★ 명함 화면을 「메일이 이미 열려 있다」고 본다');
  assert.equal(p.hit(BASE + 'pu-cards.html?view=mail&v=1', TILE), false,
    '★★ 메일 화면을 「명함이 이미 열려 있다」고 본다 — 타일을 눌러도 메일이 그대로다');
});

test('★★ 쿼리 «차례»가 달라도 같은 화면이다 — 차례로 갈리면 헛 새로고침이 난다', () => {
  const p = portal();
  /* ⚠ 뜻 있는 쿼리가 «둘 이상»이어야 차례를 봤는지 알 수 있다 — 하나면 차례가 없다
       (2026-09-08 고장넣기에서 실제로 샜다: view=mail 하나만 두고 견주었다). */
  assert.equal(p.hit(BASE + 'pu-cards.html?q=김철수&view=mail&sso=1&v=aaa',
    'pu-cards.html?view=mail&q=김철수&v=bbb&sso=1'),
    true, '★ 차례가 다르다고 다른 화면으로 본다 — 눌를 때마다 헛 새로고침이 난다');
  assert.equal(p.hit(BASE + 'pu-cards.html?a=1&b=2', 'pu-cards.html?b=2&a=1'),
    true, '★ 차례를 안 맞춘다');
});

test('★★ 다른 앱·다른 곳은 예전대로 «다른 화면»이다', () => {
  const p = portal();
  assert.equal(p.hit(BASE + 'pu-photos.html?sso=1&v=1', TILE), false, '★ 다른 앱을 같다고 본다');
  assert.equal(p.hit('about:blank', TILE), false, '★ 갓 만든 빈 창을 같다고 본다');
  assert.equal(p.hit('https://other.example/pureunall/pu-cards.html?sso=1', TILE), false,
    '★ 다른 곳(origin)을 같다고 본다');
});

test('★ 못 읽는 창(다른 곳이라 막힘)은 «다르다»고 본다 — 그래야 새로 옮긴다', () => {
  const p = portal();
  const blocked = { get location() { throw new Error('cross-origin'); } };
  assert.equal(p.portalAppUrlMatches(blocked, TILE), false, '★ 못 읽었는데 같다고 한다');
});

test('★★ 견주기에서 빼는 것은 «v·sso 둘»뿐이다 — 늘어나면 화면을 못 가린다', () => {
  const p = portal();
  assert.equal(p.PORTAL_URL_NOISE.join(','), 'v,sso',
    '★ 빼는 목록이 바뀌었다. q·view 를 여기 넣으면 이 고장이 그대로 돌아온다');
});

/* ══════ 이 딥링크가 어디서 오는지 — 고친 곳이 맞는지 못 박는다 ══════ */

test('★★ ?q= 에 «전화번호»를 담아 여는 곳은 사진첩의 그 단추다', () => {
  const i = PHOTOS.indexOf('function openFiledCard()');
  assert.ok(i > 0, '★ openFiledCard 가 사라졌다');
  const fn = PHOTOS.slice(i, PHOTOS.indexOf('\n}', i));
  assert.match(fn, /pu-cards\.html\?q=/, '★ 기업정보함으로 가는 길이 바뀌었다');
  assert.match(fn, /f\.mobile/, '★ 첫 후보가 휴대폰이 아니다 — 주소의 010-… 이 여기서 온다');
  /* 링크 자체는 그대로 둔다 — 고장은 「한 번 쓰고 지우지 않은 것」이었다 */
  assert.match(PHOTOS, /onclick="openFiledCard\(\)"/, '★ 단추가 사라졌다');
});
