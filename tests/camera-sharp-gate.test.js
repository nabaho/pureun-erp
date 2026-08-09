/* 자동 화질 검사 — 대표 지시 2026-08-09
   "폰에서 자동으로 화질 검색하는 기능 만들 수 없나?"

   해상도는 잡혔다(사진 3000×4000). 그런데도 글씨가 흐렸다 — 초점이다.
   선명도를 재는 코드는 원래 있었으나 **잠깐 떴다 사라지는 알림 한 줄**이라
   지나치기 쉬웠고, 흐린 채로 그냥 담겼다. 답할 때까지 남는 물음으로 바꾼다.

   ⚠ 버리지 않는다 — 흐려도 그 자리에 다시 갈 수 없는 사진일 수 있다(2026-08-06 원칙). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const shoot = photos.match(/async function camShoot\(\)[\s\S]*?(?=\nfunction renderCamStrip)/);

test('camShoot 을 찾을 수 있다', () => {
  assert.ok(shoot, 'camShoot 를 못 찾으면 아래 검사가 아무것도 못 지킵니다.');
});

test('★ 흐리면 답할 때까지 남는 물음을 띄운다', () => {
  assert.ok(/id="camWarn"/.test(photos), '흐림 물음창이 없습니다.');
  assert.ok(/if \(blurry\) \{ setCamWarn\(true\); return; \}/.test(shoot[0]),
    '잠깐 뜨는 알림으로는 지나칩니다 — 답할 때까지 남아야 합니다.');
});

test('★ 흐려도 사진은 이미 담겨 있다 (버리지 않는다)', () => {
  const push = shoot[0].indexOf('camShots.push');
  const warn = shoot[0].indexOf('setCamWarn(true)');
  assert.ok(push > 0 && warn > 0 && push < warn,
    '물음을 먼저 띄우고 나중에 담으면, 딴 데를 누르는 순간 사진이 사라집니다.');
});

test('★ 「다시 찍기」를 골라야 비로소 뺀다', () => {
  const m = photos.match(/function camWarnRetake\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'camWarnRetake 가 없습니다.');
  assert.ok(/camShots\.pop\(\)/.test(m[0]), '고른 장을 빼야 다시 찍은 것과 안 겹칩니다.');
  assert.ok(/revokeObjectURL/.test(m[0]), '미리보기 주소를 안 놓으면 기억이 샙니다.');
});

test('뒷면을 다시 찍을 때 앞면 고리를 되돌린다', () => {
  const m = photos.match(/function camWarnRetake\(\)[\s\S]*?\n\}/);
  assert.ok(/camPairWith = s\.pairWith/.test(m[0]),
    '뒷면을 빼고 고리를 안 되돌리면, 다시 찍은 뒷면이 앞면에 안 붙습니다.');
});

test('★ 「그대로 쓰기」면 명함 모드에서 뒷면 물음으로 이어진다', () => {
  const m = photos.match(/function camWarnKeep\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'camWarnKeep 이 없습니다.');
  assert.ok(/camCardMode && camCardStage === 'front'/.test(m[0]),
    '흐림 물음에 답하고 나면 원래 흐름(뒷면 묻기)으로 돌아가야 합니다.');
});

test('★ 흐림 물음이 뒷면 물음보다 앞선다', () => {
  const warn = shoot[0].indexOf('setCamWarn(true)');
  const ask = shoot[0].indexOf('setCamAsk(true)');
  assert.ok(warn > 0 && ask > 0 && warn < ask,
    '흐린 앞면에 뒷면을 붙여 봐야 결국 둘 다 다시 찍어야 합니다.');
});

/* ── 숫자를 남긴다 — 기준값을 실제 사진으로 맞추려면 필요하다 ── */
test('★ 잰 선명도를 사진에 적어 둔다', () => {
  assert.ok(/sharp: Math\.round\(sharp \* 10\) \/ 10/.test(shoot[0]),
    '숫자를 안 남기면 기준값(MIN_SHARP)이 맞는지 영영 알 수 없습니다.');
  assert.ok(/meta\.sharp = cp\.sharp/.test(photos), '사진 정보까지 실려야 나중에 볼 수 있습니다.');
});

test('★ 크게 보기에서 선명도가 보인다', () => {
  assert.ok(/선명도 ' \+ it\.meta\.sharp/.test(photos),
    '「크게 찍혔는데 왜 흐린가」를 이 숫자 하나로 가릅니다.');
});

test('물음창에도 잰 값과 기준을 함께 보여 준다', () => {
  const m = photos.match(/function setCamWarn\(on\)[\s\S]*?\n\}/);
  assert.ok(/선명도 '\s*\+ s\.sharp/.test(m[0]) && /MIN_SHARP/.test(m[0]),
    '숫자 없이 「흐립니다」만 뜨면 얼마나 흐린지 알 수 없습니다.');
});

/* ── 물음이 남아 돌아다니지 않게 ── */
test('카메라를 새로 열면 물음이 남아 있지 않다', () => {
  const m = photos.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(/setCamWarn\(false\)/.test(m[0]), '지난번 물음이 남아 있으면 엉뚱한 장을 가리킵니다.');
});

test('물음을 둔 채 셔터를 또 누르면 물음이 닫힌다', () => {
  assert.ok(/setCamWarn\(false\);/.test(shoot[0]),
    '물음이 겹쳐 뜨면 어느 장 이야기인지 알 수 없습니다.');
});
