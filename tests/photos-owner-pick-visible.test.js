/* 「누구 사진」 고르개를 찾을 수 있는가 — 대표 보고 2026-08-10
   "다른직원이 찍어서 올린 사진이나 스켄은 왜 권형하가 안보이게 되어 있는.
    이 부분 개선한 것 아니었나?"

   기능은 2026-08-09 에 만들어져 있었다(전체 근로자 보기). 그런데 2026-08-08 에
   "칸에 이미 「내 사진」이라고 적혀 있다"며 **이름표를 뺐다.** 그러면 이 칸이
   무엇을 고르는 칸인지 알 수가 없다 — 줄 하나를 아끼려다 기능 하나를 숨긴 셈이다.
   만든 기능을 못 찾으면 없는 것과 같다. 그래서 검사로 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 고르개에 이름표가 붙어 있다', () => {
  const m = app.match(/<div id="ownerPick"[\s\S]*?<\/div>/);
  assert.ok(m, 'ownerPick 을 찾지 못했습니다.');
  assert.ok(/누구 사진/.test(m[0]),
    '이름표가 없으면 이 칸이 무엇을 고르는지 몰라서, 만들어 둔 기능을 못 찾습니다.');
  assert.ok(/<select id="ownerSel"/.test(m[0]), '고르개가 사라졌습니다.');
});

test('★ 「전체 근로자」가 둘째 줄에 있다', () => {
  const m = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderOwnerPick 을 찾지 못했습니다.');
  /* 관리자가 아닐 때의 고르개가 앞쪽에 따로 있다 — 관리자 쪽만 잘라서 본다 */
  const admin = m[0].slice(m[0].indexOf('migAllowed'));
  const mine = admin.indexOf('내 사진</option>');
  const all = admin.indexOf('ALL_OWNERS');
  const shared = admin.indexOf('SHARED_OWNER + \'">나와 공유된 사진');
  assert.ok(mine > 0 && all > 0 && shared > 0, '세 줄이 다 있어야 합니다.');
  assert.ok(mine < all && all < shared,
    '총괄책임자가 가장 자주 찾는 「전체 근로자」가 아래에 묻히면 못 찾습니다.');
});

test('몇 명인지 함께 보여 준다', () => {
  const m = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/);
  assert.ok(/ids\.length \+ 1\) \+ '명/.test(m[0]),
    '숫자가 있으면 「볼 것이 있다」는 것이 눈에 들어옵니다.');
});

test('관리자가 아니면 「전체 근로자」가 없다', () => {
  const m = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/);
  const head = m[0].slice(0, m[0].indexOf('migAllowed'));
  assert.ok(!/ALL_OWNERS/.test(head),
    '직원에게 남의 사진을 볼 길이 화면에 보이면 안 됩니다(규칙도 막지만 이중으로).');
});

test('★ 누가 올렸는지 알 방법이 남아 있다', () => {
  /* ⚠ 2026-08-16 대표 지시로 **칸의 이름 띠(.who)를 뺐다** — 띠가 셋이면
     폰에서 칸 104px 중 60px 을 덮어 그림이 절반도 안 남았다.
     그래서 「칸에 보인다」로 못 박지 않는다. 지킬 것은 자리가 아니라
     **누가 올렸는지 알아낼 수 있는가**다.
     이름이 담긴 곳은 `__ownerName` 하나뿐이라, 이것을 아무 데도 안 그리면
     누구 사진인지 알 방법이 **아예 사라진다.** */
  /* ⚠ 글자를 찾지 않고 **함수를 돌린다** — 「__ownerName 이 있나」로는 못 잡는다.
     조건만 죽여도(`m.__ownerName ?` → `false ?`) 뒤쪽 문자열에 낱말이 남아 통과한다.
     실제로 이 뮤테이션이 한 번 살아남았다. */
  const i = app.indexOf('function whenBox(');
  const body = app.slice(i, app.indexOf('\n}', i) + 2);
  const whenBox = new Function('whenText', 'dayKey', 'esc', body + '\nreturn whenBox;')(
    function () { return '때'; }, String, String);
  assert.match(whenBox({ meta: { __ownerName: '김보람', upAt: 1786000000000 } }), /김보람/,
    '사진을 열어도 올린 사람이 안 나오면, 누구 것인지 알 길이 없어집니다.');
});
