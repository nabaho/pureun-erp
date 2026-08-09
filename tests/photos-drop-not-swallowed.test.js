/* 끌어다 놓은 파일이 조용히 무시되던 것 — 대표 보고 2026-08-09
   "사진첩에서 사진을 드래그해서 넣었는데 사진이 업로드 안 된다"

   원인: selfDrag(화면 안에서 드래그가 시작됐다는 표시)가 참으로 굳었다.
   풀리는 길이 **화면 안 mousedown 하나뿐**이었는데, 탐색기에서 파일을 끌어오는
   동작은 이 화면에 mousedown 을 내지 않는다. 그래서 사진을 탭으로 끌다 취소해
   한 번 굳으면, 그 뒤 진짜 파일을 놓아도 계속 무시됐다.

   ⚠ 원래 주석이 이미 걱정하던 일이다 — "이 값이 참으로 굳으면 진짜 파일 놓기가
      조용히 무시된다. 조용한 실패는 재복사보다 더 나쁘다." 그 원칙을 지킨다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 굳은 표시를 푸는 길이 셋이다', () => {
  assert.ok(/document\.addEventListener\('mousedown', function \(\) \{ selfDrag = false; \}/.test(html),
    '화면을 누르면 풀리는 길(원래 있던 것)이 사라졌습니다.');
  assert.ok(/window\.addEventListener\('blur', function \(\) \{ selfDrag = false; \}\)/.test(html),
    '파일을 가지러 탐색기로 가면 창이 초점을 잃습니다 — 그때 풀려야 합니다.');
  assert.ok(/SELF_DRAG_MS/.test(html) && /Date\.now\(\) - selfDragAt/.test(html),
    '시간이 지나도 안 풀리면, 초점·클릭이 둘 다 없는 상황에서 영영 굳습니다.');
});

test('★ 판단하는 곳이 모두 시간 제한을 탄다', () => {
  /* selfDrag 를 날것으로 보는 곳이 남아 있으면 그 길로 다시 샌다 */
  const drop = html.match(/window\.addEventListener\('drop'[\s\S]*?\n\}\);/);
  const enter = html.match(/window\.addEventListener\('dragenter'[\s\S]*?\n\}\);/);
  assert.ok(drop && enter, '드래그 처리기를 찾지 못했습니다.');
  assert.ok(/selfDragLive\(\)/.test(drop[0]), '놓을 때 시간 제한을 안 봅니다.');
  assert.ok(/selfDragLive\(\)/.test(enter[0]), '받는 자리를 열 때 시간 제한을 안 봅니다.');
});

test('★ 드래그를 시작할 때 시각을 남긴다', () => {
  assert.ok(/dragstart[\s\S]{0,80}selfDragAt = Date\.now\(\)/.test(html),
    '시각을 안 남기면 시간 제한이 늘 만료 상태가 되어 재복사가 되살아납니다.');
});

/* ── 실제로 돌려 본다 ── */
function harness() {
  const src = html.match(/const SELF_DRAG_MS[\s\S]*?function selfDragLive\(\)[^\n]*\n/)[0];
  const ctx = { Date, window: { addEventListener() {} }, selfDrag: false, selfDragAt: 0 };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/^const |^let /gm, 'var '), ctx);
  return ctx;
}

test('★ 방금 시작한 화면 안 드래그는 「우리 것」이다 (재복사 방지는 그대로)', () => {
  const c = harness();
  c.selfDrag = true; c.selfDragAt = Date.now();
  assert.equal(vm.runInContext('selfDragLive()', c), true,
    '이게 거짓이 되면 사진을 끌 때마다 같은 사진이 다시 올라갑니다.');
});

test('★ 오래 굳은 표시는 「우리 것」이 아니다 (조용한 실패 방지)', () => {
  const c = harness();
  c.selfDrag = true; c.selfDragAt = Date.now() - 60000;   // 1분 전에 굳었다
  assert.equal(vm.runInContext('selfDragLive()', c), false,
    '굳은 표시 때문에 진짜 파일 놓기가 무시되면 증빙이 누락됩니다.');
});

test('시작한 적이 없으면 「우리 것」이 아니다', () => {
  const c = harness();
  assert.equal(vm.runInContext('selfDragLive()', c), false);
});
