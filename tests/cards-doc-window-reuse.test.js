/* 사진첩 서류 보기는 «한 창»으로 (대표 지적 2026-08-27)

   「원본보기 클릭하면 계속해서 새로운 사진첩으로 나온다 —
     팝업된 사진첩 한 번으로만 가게 해달라」

   기업정보함에서 서류 몇 개를 훑어보면 사진첩 탭이 그만큼 쌓였다. 나중에는
   어느 탭이 무엇인지도 모르고 하나씩 닫아야 했다.

   ⚠ 그렇다고 «지금 창»에서 열면 안 된다 — 보던 회사와 고르던 것이 다 날아간다.
     새 창은 그대로 두되, **이름을 붙여** 그 창을 다시 쓰게 한다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');
const APPBAR = require('./lib-appbar-load.js');

const R = path.join(__dirname, '..');
const CARDS = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

/* 실제로 돌려 본다 — 창 이름을 무엇으로 부르는지, 앞으로 끌어오는지까지.
 *
 * ⚠ 2026-09-08 — 창 이름을 «앱이 짓지 않는다». 공용 층(PuAppBar.goApp)이 주소에서
 *   뽑는다(대표 지시 「모든 창은 2개가 열리지 않고 하나만」). 그래서 대역을 만들지
 *   «않고» 진짜 공용 층을 상자에 실어 돌린다 — 대역을 만들면 화면과 다른 규칙을 본다.
 * ⚠ 앱이 window.open 을 «직접» 부르면 그 자리에서 터지게 둔다 — 되살아나면 알아야 한다.
 */
function run(o) {
  o = o || {};
  const opened = [];
  let focused = 0;
  const bar = APPBAR.load();
  bar.__setOpen(function (url, name) {
    opened.push({ url: url, name: name });
    if (o.blocked) return null;
    return { focus: function () { focused++; if (o.focusThrows) throw new Error('막힘'); } };
  });
  const ctx = {
    encodeURIComponent, String, console,
    PuAppBar: bar,
    toast: function (m) { ctx.said = m; },
    window: {
      open: function () {
        throw new Error('앱이 창을 직접 열면 안 됩니다 — PuAppBar.goApp 을 쓰세요');
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(CARDS, 'function openCoDoc('), ctx);
  return { ctx: ctx, opened: opened, focused: function () { return focused; }, nav: bar.__nav };
}

test('★ 두 번 눌러도 창은 «같은 이름» — 브라우저가 그 창을 다시 쓴다', () => {
  const r = run();
  r.ctx.openCoDoc('2026', 'p1', 'U9');
  r.ctx.openCoDoc('2025', 'p2', 'U9');
  assert.equal(r.opened.length, 2, '두 번 다 창을 열어야 합니다(같은 이름으로)');
  assert.ok(r.opened[0].name, '★ 창에 이름이 없습니다 — 이름이 없으면 누를 때마다 새 탭이 쌓입니다');
  assert.equal(r.opened[0].name, r.opened[1].name,
    '★ 창 이름이 서로 다릅니다 — 그러면 탭이 계속 늘어납니다: ' +
    r.opened[0].name + ' / ' + r.opened[1].name);
  assert.notEqual(r.opened[0].name, '_blank',
    '★ _blank 는 «늘 새 탭»입니다 — 이름을 붙여 주세요');
});

test('★ 이미 열려 있던 창을 앞으로 끌어온다 — 안 그러면 「아무 일도 안 일어난」 것처럼 보인다', () => {
  const r = run();
  r.ctx.openCoDoc('2026', 'p1', 'U9');
  assert.equal(r.focused(), 1, '★ 뒤에 가려진 창이 그대로 있으면 눌러도 반응이 없어 보입니다');
});

test('서류가 바뀌면 주소도 바뀐다 — 같은 창에 새 서류가 실린다', () => {
  const r = run();
  r.ctx.openCoDoc('2026', 'p1', 'U9');
  r.ctx.openCoDoc('2025', 'p2', 'U8');
  assert.match(r.opened[0].url, /photo=p1&year=2026&owner=U9/);
  assert.match(r.opened[1].url, /photo=p2&year=2025&owner=U8/);
});

test('해·주인이 없어도 사진 번호만으로 연다', () => {
  const r = run();
  r.ctx.openCoDoc('', 'p1', '');
  assert.equal(r.opened[0].url, 'pu-photos.html?photo=p1');
});

test('사진 번호가 없으면 열지 않고 까닭을 말한다', () => {
  const r = run();
  r.ctx.openCoDoc('2026', '', 'U9');
  assert.equal(r.opened.length, 0, '번호도 없이 사진첩을 열면 빈 화면만 뜹니다');
  assert.match(r.ctx.said, /사진 번호가 없습니다/);
});

test('팝업이 막혀도 넘어지지 않는다 — 주소는 이미 바뀌었다', () => {
  assert.doesNotThrow(function () { run({ blocked: true }).ctx.openCoDoc('2026', 'p1', 'U9'); });
  assert.doesNotThrow(function () { run({ focusThrows: true }).ctx.openCoDoc('2026', 'p1', 'U9'); });
});

test('★ 사진첩 서류를 여는 길은 이 한 곳뿐이다 — 여럿이면 한쪽만 고쳐진다', () => {
  /* 서류 보기 자리가 다섯 군데인데(기업 상세·읽은 칸·고아 알림 등) 모두 여기를 거친다.
     따로 window.open 하는 곳이 생기면 그 길만 다시 탭을 쌓는다. */
  /* ⚠ 2026-09-08 — 이제 window.open 이 아니라 공용 층(PuAppBar.goApp)으로 연다.
       「여는 곳은 한 군데」라는 규칙은 그대로이므로 겨눔만 옮겼다. */
  const direct = (CARDS.match(/goApp\('pu-photos\.html/g) || []).length;
  assert.equal(direct, 1,
    '★ 사진첩을 여는 곳이 ' + direct + '군데입니다 — openCoDoc 하나로 모아 주세요');
  assert.ok(!/window\.open\('pu-photos\.html/.test(CARDS),
    '★★ 사진첩을 «직접» 여는 곳이 되살아났습니다 — 그 길만 다시 탭을 쌓습니다');
  const uses = (CARDS.match(/openCoDoc\(/g) || []).length;
  assert.ok(uses >= 5, '서류 보기 자리를 ' + uses + '군데만 찾았습니다 — 찾는 규칙이 어긋났습니다');
});
