const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const best = html.match(/async function captureBestSource\(v\)[\s\S]*?\n\}/);

test('명함·서류는 세 장 중 가장 선명한 장을 고른다', () => {
  assert.ok(best, 'captureBestSource 를 찾지 못했습니다.');
  assert.match(html, /const CAM_DOC_BURST = 3/);
  assert.match(best[0], /camCaptureMode === 'document' \? CAM_DOC_BURST : 1/);
  assert.match(best[0], /sharp:grabSharp\(image, w, h\)/);
  assert.match(best[0], /sort\(function \(a, b\) \{ return b\.sharp - a\.sharp; \}\)/);
  assert.match(best[0], /return usable\[0\]/);
});

test('일반사진은 빠르게 한 장만 찍고 사각 틀을 쓰지 않는다', () => {
  assert.match(best[0], /camCaptureMode === 'document' \? CAM_DOC_BURST : 1/);
  assert.match(html, /function frameOn\(\) \{ return camCaptureMode === 'document'; \}/);
});

test('고해상도 촬영이 실패하거나 작아도 사진은 남는다', () => {
  assert.match(best[0], /const fallback =/);
  assert.match(best[0], /if \(!camCap\) return fallback/);
  assert.match(best[0], /Math\.max\(c\.w, c\.h\) >= minEdge/);
  assert.match(best[0], /return fallback/);
});
