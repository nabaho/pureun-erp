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

test('★ 전체 근로자 화면에서 누구 것인지 칸에 보인다', () => {
  /* 모아 놓기만 하고 누구 것인지 모르면 「훑어보기」가 안 된다 */
  assert.ok(/gridOwner === ALL_OWNERS && it\.meta\.__ownerName/.test(app),
    '누구 사진인지 칸에서 안 보이면 열어 봐야만 압니다.');
});
