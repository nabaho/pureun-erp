'use strict';
/* 삭제 확인 쪽지가 «정말로» 눌린 단추 옆에 뜨는가 — 실제로 돌려 본다.

   ■ 왜 «돌려 보는» 검사가 필요한가
   글자만 보는 검사로는 「잰 값을 실제로 쓰는지」를 볼 수 없다. 되돌림 검사에서
   드러났다 — 단추 자리를 재 놓고 쪽지는 화면 가운데(left:'50%')에 붙이도록
   고쳐도 글자 검사는 통과했다. 대표가 고쳐 달라고 한 것이 바로 그 증상이다
   (「삭제클릭시 버튼이 너무 멀리 있다」).

   ■ 무엇을 보나 (좌표 값을 못 박지 않는다)
   ① 쪽지 오른쪽 끝이 «단추 오른쪽 끝 근처»에 온다
   ② 아래가 넉넉하면 단추 «아래»에, 좁으면 «위»에 뜬다
   ③ 화면 밖으로 나가지 않는다
   재는 자는 「단추와 쪽지 사이 거리」다 — 픽셀 수가 아니라 «가까운가»를 본다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { cutFn } = require('./cut-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

/* ── 아주 작은 화면 흉내 ── */
function 판만들기(화면높이) {
  const 만든것 = [];
  function el(tag) {
    const e = {
      tagName: (tag || 'div').toUpperCase(), style: {}, children: [], id: '',
      _cls: {}, innerHTML: '', textContent: '', offsetWidth: 258, offsetHeight: 120,
      classList: {
        add(c) { e._cls[c] = 1; }, remove(c) { delete e._cls[c]; },
        toggle(c, on) { if (on) e._cls[c] = 1; else delete e._cls[c]; },
        contains(c) { return !!e._cls[c]; }
      },
      appendChild(c) { e.children.push(c); return c; },
      contains() { return false; },
      querySelector(sel) {
        /* 쪽지 안쪽 조각들 — 있는 척만 해 준다 */
        if (!e._parts) e._parts = {};
        if (!e._parts[sel]) e._parts[sel] = el('div');
        return e._parts[sel];
      },
      querySelectorAll() { return []; },
      setAttribute() {}, closest() { return null; },
      set onclick(f) { e._onclick = f; }, get onclick() { return e._onclick; }
    };
    만든것.push(e);
    return e;
  }
  const head = el('head'), body = el('body');
  const 판 = {
    console,
    window: {
      innerWidth: 1200, innerHeight: 화면높이,
      pageXOffset: 0, pageYOffset: 0,
      addEventListener() {}
    },
    document: {
      head, body,
      _byId: {},
      createElement: el,
      getElementById(id) { return 판.document._byId[id] || null; },
      addEventListener() {},
      documentElement: { scrollLeft: 0, scrollTop: 0 }
    },
    toast() {}
  };
  판.window.document = 판.document;
  /* appendChild 로 붙은 것을 id 로 찾을 수 있게 */
  const 원래 = body.appendChild.bind(body);
  body.appendChild = function (c) { if (c.id) 판.document._byId[c.id] = c; return 원래(c); };
  head.appendChild = function (c) { if (c.id) 판.document._byId[c.id] = c; return c; };
  return 판;
}

/* 진짜 코드 네 조각을 그대로 태운다 */
const 조각 = ['var _kcPopOn=null;',
  cutFn(src, 'function _kcPopEl('),
  cutFn(src, 'function kcPopClose('),
  cutFn(src, 'function _kcPopWire('),
  cutFn(src, 'function kcAskDelete(')].join('\n');
조각.split('\n').forEach(() => {});
assert.ok(cutFn(src, 'function kcAskDelete('), 'kcAskDelete 를 못 꺼냈다');

function 띄워보기(단추자리, 화면높이) {
  const 판 = 판만들기(화면높이);
  vm.createContext(판);
  vm.runInContext(조각.replace(/\r\n/g, '\n'), 판);
  const 단추 = {
    getBoundingClientRect: () => 단추자리,
    contains: () => false, closest: () => null
  };
  vm.runInContext('kcAskDelete(__btn, { detail:"x" }, function(){})',
    Object.assign(판, { __btn: 단추 }));
  const p = 판.document.getElementById('kcDelPop');
  assert.ok(p, '쪽지를 안 만들었다');
  return { p, 판 };
}

const 단추 = { left: 1000, right: 1080, top: 300, bottom: 322, width: 80, height: 22 };

test('쪽지가 «눌린 단추 옆»에 뜬다 — 화면 가운데가 아니다', () => {
  const { p } = 띄워보기(단추, 800);
  const L = parseFloat(p.style.left), T = parseFloat(p.style.top);
  assert.ok(!isNaN(L) && !isNaN(T),
    '쪽지 자리가 숫자가 아니다 (left=' + p.style.left + ', top=' + p.style.top + ') — '
    + '화면 가운데(50%)에 붙이면 단추와 멀어진다');
  const 쪽지오른쪽 = L + p.offsetWidth;
  assert.ok(Math.abs(쪽지오른쪽 - 단추.right) <= 40,
    '쪽지 오른쪽 끝(' + 쪽지오른쪽 + ')이 단추 오른쪽 끝(' + 단추.right + ')과 멀다 — '
    + '「버튼이 너무 멀리 있다」가 그대로 남는다');
  assert.ok(Math.abs(T - 단추.bottom) <= 40,
    '쪽지 위쪽(' + T + ')이 단추 아래(' + 단추.bottom + ')와 멀다');
});

test('아래가 넉넉하면 단추 «아래»에 뜬다', () => {
  const { p } = 띄워보기(단추, 800);
  assert.ok(p.classList.contains('below'), '아래에 자리가 있는데 위로 뒤집었다');
  assert.ok(parseFloat(p.style.top) >= 단추.bottom, '단추를 가리고 뜬다');
});

test('아래가 좁으면 «위»로 뒤집는다 — 표 맨 아랫줄에서 쪽지가 잘리지 않게', () => {
  /* 단추가 화면 밑바닥에 있는 경우 — 대표 화면의 마지막 줄이 이렇다 */
  const 밑줄 = { left: 1000, right: 1080, top: 760, bottom: 782, width: 80, height: 22 };
  const { p } = 띄워보기(밑줄, 800);
  assert.ok(p.classList.contains('above'), '아래에 자리가 없는데 아래로 띄웠다 — 쪽지가 잘린다');
  const T = parseFloat(p.style.top);
  assert.ok(T + p.offsetHeight <= 밑줄.top, '위로 뒤집었다면서 단추를 덮고 있다');
  assert.ok(T >= 0, '쪽지가 화면 위로 넘어갔다');
});

test('화면 왼쪽·오른쪽으로 넘어가지 않는다', () => {
  /* 단추가 화면 맨 왼쪽에 붙어 있으면, 왼쪽으로 펼치다 밖으로 나갈 수 있다 */
  const 왼끝 = { left: 4, right: 40, top: 300, bottom: 322, width: 36, height: 22 };
  const { p } = 띄워보기(왼끝, 800);
  const L = parseFloat(p.style.left);
  assert.ok(L >= 0, '쪽지가 화면 왼쪽 밖으로 나갔다 (left=' + L + ')');
  assert.ok(L + p.offsetWidth <= 1200, '쪽지가 화면 오른쪽 밖으로 나갔다');
});

test('단추를 못 받아도 터지지 않는다', () => {
  /* 어딘가에서 this 를 안 넘겨도 «지우기 자체»는 되어야 한다 */
  const 판 = 판만들기(800);
  vm.createContext(판);
  vm.runInContext(조각.replace(/\r\n/g, '\n'), 판);
  vm.runInContext('kcAskDelete(null, { detail:"x" }, function(){})', 판);
  const p = 판.document.getElementById('kcDelPop');
  assert.ok(p && p.classList.contains('open'), '단추 없이 부르면 쪽지가 아예 안 뜬다');
});
