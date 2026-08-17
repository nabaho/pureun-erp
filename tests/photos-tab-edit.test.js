'use strict';
/* 분류 탭 손보기 · 「~만 보는 중」 띠 없애기 (대표 지시 2026-08-17)

   ① "캡처1 셀 없애 달라. 그냥 Esc 누르면 전체사진으로 돌아가면 된다."
      → 분류 탭에서는 띠를 안 그린다(탭 줄이 이미 파랗게 보여 준다).
      ⚠ 그런데 Esc 판단이 그 띠(whereNow)를 보고 있었다 — 띠를 없애면 Esc 가
        같이 죽는다. 대표가 원한 것이 바로 그 Esc 라, 판단을 isFiltered 로 갈랐다.
        이 검사가 그 하나를 못박는다.

   ② "탭 수정 변경 삭제 가능하게 해달라고 했는데 왜 안 되나 계속?"
      → 지금까지 ✎ 는 «직접 만든 분류»에만 붙었고, 화면의 탭은 전부 고정 분류라
        붙을 곳이 없었다. 이제 고정 분류에도 붙인다.
      ⚠ 고정 분류는 판독 AI 가 판정하는 갈래 그 자체라 «갈래»는 못 없앤다 —
        없애면 그 서류가 담길 칸이 사라져 기타서류로 쏟아진다. 그래서 여는 것은
        「보이는 이름 고치기」와 「탭 숨기기」 둘이다(사진은 한 장도 안 지워진다).

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

/* ⚠ 중괄호를 세어 «그 함수만» 자른다. 정규식 `[\s\S]*?\n\}` 로 자르면 들여쓴
   함수(저장 층은 IIFE 안이라 두 칸 들여쓰기)의 끝을 못 찾아 **뒤따르는 함수들까지
   통째로** 삼킨다 — 그러면 「사진 자리를 안 건드린다」 검사가 남의 코드를 보고
   운다. 실제로 여기서 한 번 속았다. */
function fnOf(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0, j = src.indexOf('{', i);
  assert.ok(j > i, name + ' 의 본문 시작을 찾지 못했습니다');
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* ══════ ① 띠는 없애고 Esc 는 살린다 ══════ */

function loadNav(state) {
  const ctx = Object.assign({
    view: 'photos', oldOnly: false, needOnly: false, gridQ: '', kindTab: 'all',
    KIND_TABS: [{ key: 'meeting', label: '회의사진' }],
    customTabLabel: () => '', String, Object
  }, state || {});
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'whereNow') + '\n' + fnOf(app, 'isFiltered'), ctx);
  return ctx;
}

test('★ 분류 탭을 볼 때는 「~만 보는 중」 띠를 안 그린다', () => {
  const c = loadNav({ kindTab: 'meeting' });
  assert.equal(c.whereNow(), null,
    '★ 탭 줄이 이미 보여 주는데 띠까지 그리면 같은 말이 두 번입니다');
});

test('★ 그래도 Esc 는 분류 탭에서 전체사진으로 돌아간다 — 이것이 대표가 원한 것', () => {
  const c = loadNav({ kindTab: 'meeting' });
  assert.equal(c.isFiltered(), true,
    '★ Esc 판단이 띠를 보고 있으면, 띠를 없앤 순간 Esc 가 같이 죽습니다');
});

test('확인 필요·보유기간·찾기 띠는 그대로 둔다 — 0장이면 화면이 통째로 빈다', () => {
  assert.match(loadNav({ needOnly: true }).whereNow(), /확인이 필요한/);
  assert.match(loadNav({ oldOnly: true }).whereNow(), /보유기간/);
  assert.match(loadNav({ gridQ: '가야' }).whereNow(), /가야/);
});

test('처음 화면에서는 Esc 가 할 일이 없다', () => {
  assert.equal(loadNav().isFiltered(), false);
  assert.equal(loadNav().whereNow(), null);
});

test('★ Esc 처리기가 isFiltered 로 가른다 — whereNow 로 되돌리면 안 된다', () => {
  const fn = fnOf(app, 'escOnce');
  assert.match(fn, /if \(!isFiltered\(\)\) return;/,
    '★ whereNow() 로 가르면 분류 탭에서 Esc 가 죽습니다');
});

/* ══════ ② 고정 탭도 손볼 수 있다 ══════ */

test('★ ✎ 가 고정 분류에도 붙는다 — 이것이 "왜 안 되나"의 답이었다', () => {
  const fn = fnOf(app, 'renderKindTabs');
  assert.match(fn, /k !== 'all' && kindTab === k && PuPhotoStore\.amAdmin\(\)/,
    '★ 직접분류(!t)에만 붙이면 화면의 탭은 전부 고정이라 ✎ 가 아예 안 보입니다');
});

test('「전체사진」에는 ✎ 를 안 붙인다 — 돌아갈 자리다', () => {
  const fn = fnOf(app, 'renderKindTabs');
  assert.match(fn, /k !== 'all'/);
  const st = fnOf(store, 'renameFixedKind');
  assert.match(st, /key === 'all'\) return Promise\.reject/, '저장 층도 막아야 합니다');
  assert.match(fnOf(store, 'setKindHidden'), /key === 'all'\) return Promise\.reject/);
});

test('★ 고정 분류는 이름 고치기·탭 숨기기로 간다 — 갈래를 지우지 않는다', () => {
  const fn = fnOf(app, 'openRenameKind');
  assert.match(fn, /if \(!isCustomTab\(key\)\) \{ openFixedKind\(key\); return; \}/,
    '고정 분류가 직접분류 창으로 가면 엉뚱한 곳을 지웁니다');
  const fx = fnOf(app, 'openFixedKind');
  assert.match(fx, /탭 숨기기/, '숨기기 길이 없습니다');
  assert.match(fx, /보이는 이름표만/, '무엇이 바뀌는지 안 말합니다');
  assert.match(fx, /기타서류/, '★ 없앨 수 없는 까닭을 안 적으면 「또 안 되네」가 됩니다');
});

test('★ 숨겨도 사진은 안 지운다 — 저장 층이 이름표·숨김 칸만 만진다', () => {
  for (const name of ['renameFixedKind', 'setKindHidden']) {
    const fn = fnOf(store, name);
    assert.ok(!/items|blobs|thumbs/.test(fn),
      '★ ' + name + ' 이 사진 자리를 건드립니다 — 탭을 손보다 사진을 잃습니다');
  }
  assert.match(fnOf(store, 'setKindHidden'), /kindHiddenPath\(\) \+ '\/' \+ key/);
  assert.match(fnOf(store, 'renameFixedKind'), /kindLabelsPath\(\) \+ '\/' \+ key/);
});

test('총괄 관리자만 — 이름표·숨김은 전 직원이 함께 보는 공용이다', () => {
  assert.match(fnOf(store, 'renameFixedKind'), /!deps\.isAdmin\) return Promise\.reject/);
  assert.match(fnOf(store, 'setKindHidden'), /!deps\.isAdmin\) return Promise\.reject/);
  assert.match(fnOf(app, 'unhideKind'), /amAdmin\(\)/);
});

test('빈 이름으로 고치면 원래 이름으로 돌아간다 — 되돌릴 길이 있어야 한다', () => {
  const fn = fnOf(store, 'renameFixedKind');
  assert.match(fn, /clean \|\| null/,
    '빈 값을 null 로 안 쓰면 이름표가 영영 덮인 채 남습니다');
});

test('★ 숨긴 탭은 탭 줄에서 빠지고, 되살리는 길이 있다', () => {
  const fn = fnOf(app, 'renderKindTabs');
  assert.match(fn, /k === 'all' \|\| !KIND_HIDDEN\[k\]/, '숨김이 탭 줄에 안 걸립니다');
  const add = fnOf(app, 'openAddKind');
  assert.match(add, /감춘 분류 되살리기/, '★ 숨기면 ✎ 로 못 들어가니 되살릴 길이 없어집니다');
  assert.match(add, /unhideKind/);
});

test('숨긴 탭을 보고 있었으면 전체사진으로 돌아간다 — 빈 화면에 남기지 않는다', () => {
  const fn = fnOf(app, 'loadCustomKinds');
  assert.match(fn, /KIND_HIDDEN\[kindTab\]\) kindTab = 'all'/);
});

test('바꿔 놓은 이름표가 탭·분류 지정 목록에서 함께 쓰인다', () => {
  const fn = fnOf(app, 'tabLabelOf');
  assert.match(fn, /KIND_LABELS\[key\]/,
    '한 곳만 고치면 탭과 분류 지정 창의 이름이 서로 다르게 보입니다');
});

test('★ 저장 층을 고쳤으니 ?v= 을 올렸다 — 네 앱 전부', () => {
  for (const f of ['pu-photos.html', 'pu-erp.html', 'fund.html', 'gov-consulting.html']) {
    const html = fs.readFileSync(path.join(R, f), 'utf8');
    const m = html.match(/js\/pu-photo-store\.js\?v=(\d+)/);
    assert.ok(m && Number(m[1]) >= 4, '★ ' + f + ' 의 ?v= 를 안 올려 새 기능이 캐시에 묻힙니다');
  }
});
