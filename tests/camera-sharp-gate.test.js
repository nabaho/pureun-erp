const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const shoot = photos.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);

test('연속촬영은 흐림 확인창으로 멈추지 않는다', () => {
  assert.ok(shoot, 'camShoot 을 찾지 못했습니다.');
  assert.doesNotMatch(photos, /id="camWarn"|function camWarnRetake|function camWarnKeep/);
  assert.doesNotMatch(shoot[0], /setCamWarn|다시 찍기|그대로 쓰기/);
  assert.match(shoot[0], /camShots\.push\(/);
  assert.match(shoot[0], /renderCamStrip\(\)/);
});

test('선명도 수치는 사진 정보에 남아 사후 판단할 수 있다', () => {
  assert.match(shoot[0], /sharp: Math\.round\(sharp \* 10\) \/ 10/);
  assert.match(photos, /meta\.sharp = cp\.sharp/);
  assert.match(photos, /선명도 ' \+ it\.meta\.sharp/);
});
