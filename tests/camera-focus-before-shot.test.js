/* 셔터를 누르면 먼저 초점부터 — 대표 지시 2026-08-09
   "폰에서 자동으로 초점잡는 기능 만들어 둘 수 없나?"

   초점이 멎기를 기다렸다 찍는 장치는 원래 있었다. 그런데 **「멈추면 저절로 찍기」를
   켰을 때만** 돌았다. 셔터를 직접 누르면 그 과정을 통째로 건너뛰고 그 순간의
   화면을 담았다 — 초점이 도는 중이면 흐리다. 대표님 명함이 3000×4000 으로
   찍히고도 흐렸던 이유가 이것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const shoot = photos.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);
const settle = photos.match(/async function focusThenSettle\(\)[\s\S]*?\n\}/);

test('★ 셔터를 누르면 초점을 먼저 잡는다', () => {
  assert.ok(shoot, 'camShoot 를 찾지 못했습니다.');
  assert.ok(settle, 'focusThenSettle 이 없습니다 — 기다리는 장치가 사라졌습니다.');
  assert.ok(/await focusThenSettle\(\)/.test(shoot[0]),
    '누르는 즉시 찍으면 초점이 도는 중일 때 흐리게 담깁니다.');
});

test('★ 틀 가운데에 초점을 부른다', () => {
  assert.ok(/pointsOfInterest: \[\{ x: 0\.5, y: 0\.5 \}\]/.test(settle[0]),
    '명함은 틀 가운데 있습니다 — 거기에 초점을 잡아야 글씨가 삽니다.');
  assert.ok(/single-shot/.test(settle[0]), '한 번 확실히 잡아야 합니다.');
});

test('★ 선명도가 더 안 오를 때까지만 기다린다', () => {
  assert.ok(/grabSharp\(v, v\.videoWidth, v\.videoHeight\)/.test(settle[0]),
    '재지 않으면 언제 멎었는지 알 수 없습니다.');
  assert.ok(/SETTLE_GAIN/.test(settle[0]) && /SETTLE_FLAT/.test(settle[0]),
    '저절로 찍기가 쓰던 판단과 같아야 합니다 — 두 곳이 다르면 결과가 갈립니다.');
});

test('★ 영원히 기다리지 않는다', () => {
  assert.ok(/SETTLE_MAX_MS/.test(settle[0]),
    '초점을 못 잡는 곳(어두운 데·너무 가까이)에서 한 장도 못 건지면 안 됩니다.');
  assert.ok(/while \(Date\.now\(\) < until\)/.test(settle[0]), '시간 제한이 실제로 걸려 있어야 합니다.');
});

test('카메라가 닫히면 기다리기를 멈춘다', () => {
  assert.ok(/if \(!camTrack\) return;/.test(settle[0]),
    '닫힌 카메라를 계속 재면 오류가 나거나 배터리를 먹습니다.');
});

test('못 하는 기기에서는 초점 부르기를 건너뛴다', () => {
  assert.ok(/if \(camTrack && camCanFocus\)/.test(settle[0]),
    '못 받아 주는 기기에서 터지면 촬영 자체가 막힙니다.');
});

test('★ 저절로 찍기는 두 번 기다리지 않는다', () => {
  assert.ok(/camShoot\(\{ settled: true \}\)/.test(photos),
    '이미 기다린 뒤인데 또 기다리면 찍는 순간이 늦어 장면이 바뀝니다.');
  assert.ok(/if \(!\(opts && opts\.settled\)\)/.test(shoot[0]),
    '저절로 찍기가 부른 것인지 가려야 합니다.');
});

test('기다리는 동안 무슨 일인지 알려 준다', () => {
  assert.ok(/초점을 잡는 중…/.test(shoot[0]),
    '아무 말 없이 멈춰 있으면 「눌렀는데 안 찍히네」가 됩니다.');
});
