/* 🎤 음성 검색 단추 — «쓸 수 있는 화면에만» 뜬다
   (대표 지적 2026-08-25 「마이크 아이콘 필요없는 거 같다, 검토해달라」)

   ★ 이 단추가 하는 일은 하나뿐이다 — 지금 화면의 «검색창» 에 말한 것을 넣어 준다.
     그런데 폰이면 화면을 가리지 않고 늘 떠 있었다(position:fixed).
     달력처럼 검색창이 없는 화면에서 누르면 「이 화면에는 검색창이 없습니다」만 떴다.
     곧 대부분의 화면에서 «가리기만 하는 단추» 였다 — 대표 달력에서 일정 칸 둘을 덮었다.

   ★ 없애지는 않았다. 계약·업체 목록에서는 쓸모가 있다. 다만 거기서만 뜬다.
     ⚠ 「안 보이면 없는 것」이라는 이 저장소의 교훈과 어긋나지 않는다 —
       숨긴 화면에서는 애초에 «할 수 있는 일이 없다». 기능을 감춘 것이 아니다.

   이 검사가 못 박는 것 —
     ① 처음에는 숨어 있다  ② 검색창이 있으면 나온다  ③ 화면이 바뀌면 다시 본다
     ④ 「검색창이 없습니다」 라고 나무라지 않는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const at = erp.indexOf("btn.id='erp-voice-btn'");
const blk = erp.slice(at - 400, at + 3000);

test('★ 처음에는 숨어 있다 — 뜰지 말지는 화면을 보고 정한다', () => {
  assert.ok(at > 0, '🎤 단추를 찾지 못했습니다');
  const style = blk.match(/btn\.style\.cssText='([^']*)'/);
  assert.ok(style, '단추 모양을 찾지 못했습니다');
  assert.match(style[1], /display:none/,
    '★ 처음부터 보이면, 검색창 없는 화면에서 한 번 깜빡였다가 사라집니다.');
});

test('★ 검색창이 있으면 나오고, 없으면 사라진다', () => {
  assert.match(blk, /function showIfUsable\(\)/, '보일지 정하는 곳이 없습니다.');
  assert.match(blk, /btn\.style\.display = findSearchInput\(\) \? 'block' : 'none'/,
    '★ «지금 화면에 검색창이 있는가» 로 정해야 합니다.');
});

test('★ 화면이 다시 그려지면 다시 본다 — 한 번만 보면 탭을 옮길 때 안 맞는다', () => {
  assert.match(blk, /MutationObserver\(scheduleCheck\)/,
    '★ 화면 바뀜을 안 보면 달력 → 업체목록으로 옮겨도 단추가 안 나옵니다.');
  /* ⚠ 그대로 두면 리액트가 다시 그릴 때마다 부른다 — 묶어서 한 번만 */
  assert.match(blk, /setTimeout\(function\(\)\{ _voiceT=null; showIfUsable\(\); \}, 500\)/,
    '★ 검사를 안 묶으면 다시 그릴 때마다 화면 전체를 훑습니다.');
});

test('★ 「이 화면에는 검색창이 없습니다」 라고 나무라지 않는다', () => {
  /* 단추가 숨어 있으니 그런 말을 할 일이 없다. 남겨 두면 «없는 상황» 을 설명하는
     글만 남아, 다음 사람이 「왜 이런 알림이 있지」 하고 되살린다. */
  /* ⚠ 글자만 찾으면 «왜 없앴는지 적어 둔 주석» 까지 걸린다(실제로 걸렸다).
     보는 것은 «그 말로 나무라는 alert 가 있는가» 다. */
  assert.doesNotMatch(blk, /alert\('이 화면에는 검색창이 없습니다/,
    '★ 쓸 수 없는 화면에서는 아예 안 뜨므로 이 알림은 뜻이 없습니다.');
});
