/* 팝업창 옮기기 (2026-08-18 대표 지시: "팝업창 마우스로 움직일 수 있게 한다")

   ★ 드래그 장치는 이미 있었다(모든 .modal-h 에 자동 적용). 그런데 「묶어서 처리·나눠담기」
     창은 반 이름 없이 «인라인 모양» 으로만 그려져 손잡이가 없었다.
   ★ 왜 .modal 을 안 붙였나 — css/pu-erp.css 의 .modal 에 !important 가 걸려 있다
     (border-radius · overflow-y:auto · 좁은 화면 width:94vw). 속칸 스크롤을 쓰는 이 창에
     붙이면 «찌그러진다». 그래서 CSS 가 없는 짝(dragh/dragm)을 따로 두었다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'pu-erp.css'), 'utf8');

test('드래그가 새 손잡이(dragh)도 잡는다', () => {
  const a = S.indexOf('function onDragStart');
  const fn = S.slice(a, S.indexOf('\n  function ', a + 5));
  assert.strictEqual(/closest\('\.dragh'\)/.test(fn), true, '새 손잡이를 안 본다');
  assert.strictEqual(/closest\('\.dragm'\)/.test(fn), true, '옮길 창을 못 찾는다');
  // 예전 짝도 그대로 살아 있어야 한다
  assert.strictEqual(/closest\('\.modal-h'\)/.test(fn), true, '옛 손잡이가 죽었다');
  assert.strictEqual(/closest\('\.drag-handle'\)/.test(fn), true);
});

test('단추·입력칸을 눌렀을 때는 창이 안 끌린다', () => {
  /* 머리에 있는 ✕ 나 입력칸을 누를 때 창이 따라 움직이면 못 쓴다. */
  const a = S.indexOf('function onDragStart');
  const fn = S.slice(a, S.indexOf('\n  function ', a + 5));
  ['.x', 'button', 'input', 'select', 'textarea'].forEach(function (sel) {
    assert.strictEqual(fn.indexOf("closest('" + sel + "')") >= 0, true, sel + ' 를 안 걸러 낸다');
  });
});

test('★ dragh·dragm 에는 CSS 가 «없다» — 겉모습을 건드리지 않는다', () => {
  /* 이 짝의 존재 이유가 그것이다. 모양 규칙이 붙는 순간 .modal 과 같은 사고가 난다. */
  assert.strictEqual(/\.dragh\s*[,{]/.test(CSS), false, 'dragh 에 모양 규칙이 붙었다');
  assert.strictEqual(/\.dragm\s*[,{]/.test(CSS), false, 'dragm 에 모양 규칙이 붙었다');
});

test('★ 그 창에 .modal 반을 붙이지 않았다', () => {
  /* .modal 에는 !important 가 걸려 있어 속칸 스크롤 창을 찌그러뜨린다.
     실수로 붙이면 좁은 화면에서 width:94vw 가 인라인 1080px 를 이긴다. */
  assert.strictEqual(/!important/.test(CSS.split('\n').filter(function (l) {
    return /^\.modal\s*\{/.test(l.trim());
  }).join(' ')), true, '전제가 바뀌었다 — .modal 에 !important 가 없다면 이 검사를 다시 볼 것');
  const i = S.indexOf('묶어서 처리 · 통장 ');
  const around = S.slice(Math.max(0, i - 1400), i);
  assert.strictEqual(/className:'dragm'/.test(around), true, '옮길 창 표시가 없다');
  assert.strictEqual(/className:'modal'/.test(around), false, '.modal 을 붙였다 — 창이 찌그러진다');
});

test('묶어서 처리·나눠담기 창 머리가 손잡이다', () => {
  const i = S.indexOf('묶어서 처리 · 통장 ');
  assert.ok(i > 0, '그 창을 못 찾았다');
  const around = S.slice(Math.max(0, i - 700), i);
  assert.strictEqual(/className:'dragh'/.test(around), true, '머리가 손잡이가 아니다');
  assert.strictEqual(/cursor:'grab'/.test(around), true, '잡을 수 있다는 표시(손 모양)가 없다');
  assert.strictEqual(/userSelect:'none'/.test(around), true, '끌 때 글자가 선택된다');
});

test('무엇을 할 수 있는지 알려 준다', () => {
  /* 잡을 수 있다는 것을 모르면 있는 기능도 없는 기능이다. */
  const i = S.indexOf("className:'dragh'");
  const around = S.slice(i, i + 300);
  assert.strictEqual(/title:'머리를 잡아 끌면/.test(around), true, '알려 주는 말이 없다');
});
