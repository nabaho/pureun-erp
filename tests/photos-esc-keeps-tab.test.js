/* ESC 한 번에 한 가지만 — 대표 보고 2026-08-10
   "기타서류 클릭 후 개별 서류를 클릭했는데 ESC 를 누르니 다시 전체사진으로
    돌아간다. 탭 안에서 보다가 뒤돌아가는 경우 그 탭으로 다시 돌아오게 만들어라."

   원인은 ESC 를 듣는 곳이 **세 군데**였다는 것이다. 크게 보기를 닫는 처리기가
   먼저 돌아 viewerId 를 비우고, 뒤이어 도는 「뒤로」 처리기가 그 빈 값을 보고
   "크게 보기는 안 열려 있네" 하며 탭까지 풀어 버렸다. 한 번 누른 것이 두 가지
   일을 한 셈이다.

   여기서는 **실제로 돌려 보고** 확인한다 — 글자 모양만 보면 순서가 뒤바뀌는
   것을 못 잡는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const src = html.match(/function escOnce\(\)[\s\S]*?\n\}/)[0];

/* 화면 대신 쓸 가짜 판. hidden 인 것은 'none' 으로 둔다. */
function run(state) {
  const log = [];
  const el = { style: { display: 'none' } };
  const ctx = {
    viewerId: state.viewerId || null,
    $: function (id) {
      return { style: { display: state.open === id ? 'flex' : 'none' } };
    },
    closeKindPopup: function () { log.push('closeKindPopup'); },
    closeViewer: function () { log.push('closeViewer'); ctx.viewerId = null; },
    phSheetOpen: function () { return !!state.sheet; },
    closePhSheet: function () { log.push('closePhSheet'); },
    whereNow: function () { return state.where || null; },
    goBack: function () { log.push('goBack'); },
    el: el
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.escOnce();
  return log;
}

test('★ 탭 안에서 서류를 보다 ESC — 크게 보기만 닫고 탭은 남는다', () => {
  /* 이것이 대표님이 겪으신 그 상황이다: 「기타서류」를 보는 중에 서류 한 장을
     열고 ESC. 예전에는 여기서 goBack 까지 불려 전체사진으로 튀었다. */
  const log = run({ viewerId: 'p1', where: '「기타서류」만 보는 중' });
  assert.deepEqual(log, ['closeViewer'],
    'ESC 한 번에 두 가지가 일어납니다 — 탭이 풀려 전체사진으로 튑니다.');
});

test('★ 크게 보기가 닫힌 뒤 다시 ESC — 그때 탭이 풀린다', () => {
  const log = run({ viewerId: null, where: '「기타서류」만 보는 중' });
  assert.deepEqual(log, ['goBack'], '두 번째 ESC 로는 한 단계 뒤로 가야 합니다.');
});

test('★ 처음 화면에서 ESC — 아무 일도 없다', () => {
  const log = run({ viewerId: null, where: null });
  assert.deepEqual(log, [], '볼 것이 없는데 화면이 움직이면 안 됩니다.');
});

test('팝업이 크게 보기보다 먼저 닫힌다', () => {
  /* 팝업은 크게 보기 위에 뜬다 — 아래 것부터 닫으면 팝업만 덩그러니 남는다. */
  const log = run({ viewerId: 'p1', open: 'kindPopup', where: '「명함」만 보는 중' });
  assert.deepEqual(log, ['closeKindPopup'], '팝업이 떠 있는데 뒤엣것이 먼저 닫힙니다.');
});

test('카메라가 켜져 있으면 ESC 가 화면을 안 건드린다', () => {
  /* 카메라·확인 화면은 저마다 닫는 길이 따로 있다. 여기서 뒤로 가면
     찍어 둔 것을 두고 화면만 바뀐다. */
  ['camOv', 'camRev', 'shareRev'].forEach(function (id) {
    const log = run({ viewerId: null, open: id, where: '「명함」만 보는 중' });
    assert.deepEqual(log, [], id + ' 이 켜져 있는데 화면이 뒤로 갑니다.');
  });
});

test('폰 창이 열려 있으면 그것부터 닫는다', () => {
  const log = run({ viewerId: null, sheet: true, where: '「명함」만 보는 중' });
  assert.deepEqual(log, ['closePhSheet'], '창이 열린 채 화면이 뒤로 갑니다.');
});
