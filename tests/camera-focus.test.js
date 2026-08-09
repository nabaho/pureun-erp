/* 초점 — 폰이 스스로 선명도를 찾게 둔다 (대표 보고 2026-08-08)
   "폰이 자동으로 선명도를 찾아야 되는데 왜 잘 안 되나?"

   폰의 자동 초점은 돌고 있었다. 우리가 세 군데서 방해했다.
     ① 손이 멎는 순간 찍었다 — 그 순간이 곧 초점이 새로 도는 순간이다
        (→ camera-auto-shot.test.js 에서 시험한다)
     ② 화면을 한 번 누르면 초점이 **그 거리에 잠겼다**. 다음 명함을 놓아도
        잠긴 채라 계속 흐렸다 — 여기서 시험한다
     ③ 흐리게 찍혀도 아무 말이 없었다 — 여기서 시험한다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── ② 짚어 준 초점을 되돌린다 ── */
test('★ 화면을 눌러 잡은 초점은 잠시 뒤 저절로 풀린다', () => {
  const m = html.match(/async function camTapFocus\([\s\S]*?\n\}/);
  assert.ok(m, 'camTapFocus 를 찾지 못했습니다.');
  assert.ok(/single-shot/.test(m[0]), '짚은 자리에 초점을 맞추는 부분이 없습니다.');
  assert.ok(/armRefocus\(\)/.test(m[0]),
    'single-shot 은 초점을 그 거리에 **잠근다**. 안 풀면 다음 명함이 계속 흐립니다.');

  const r = html.match(/function armRefocus\(\)[\s\S]*?\n\}/);
  assert.ok(r, 'armRefocus 를 찾지 못했습니다.');
  assert.ok(/focusMode: 'continuous'/.test(r[0]), '되돌릴 곳이 「계속 초점」이어야 합니다.');
  assert.ok(/setTimeout/.test(r[0]), '곧바로 되돌리면 짚어 준 뜻이 없습니다.');
});

test('★ 되돌리기까지 한 장 찍을 틈은 준다', () => {
  const m = html.match(/const FOCUS_HOLD_MS = (\d+);/);
  assert.ok(m, 'FOCUS_HOLD_MS 가 없습니다.');
  const ms = +m[1];
  assert.ok(ms >= 1500, '너무 빨리 풀면 짚어 준 초점으로 찍기도 전에 풀립니다: ' + ms + 'ms');
  assert.ok(ms <= 6000, '너무 늦게 풀면 다음 명함이 계속 흐립니다: ' + ms + 'ms');
});

test('★ 카메라를 끄면 되돌리기 예약도 지운다', () => {
  const m = html.match(/function camStop\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'camStop 을 찾지 못했습니다.');
  assert.ok(/clearTimeout\(camRefocusTimer\)/.test(m[0]),
    '꺼진 카메라에 손대면 오류가 납니다.');
});

test('★ 카메라가 이미 꺼졌으면 손대지 않는다', () => {
  const r = html.match(/function armRefocus\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(!camTrack\) return;/.test(r[0]),
    '끊긴 카메라에 초점을 걸면 오류가 납니다.');
});

/* ── ③ 흐리면 말해 준다 ── */
/* ⚠ 2026-08-09 다시 겨눔 — 알리는 **방법**이 바뀌었다. 잠깐 떴다 사라지는 알림
   한 줄이라 지나치기 쉬웠고 흐린 채로 담겼다(대표 지시: "자동으로 화질 검색").
   이제 답할 때까지 남는 물음창(#camWarn)이다. 못 박을 것은 **재고·알리고·
   버리지 않는다**이지 알리는 모양이 아니다. */
test('★ 흐리게 찍히면 알려 준다', () => {
  const m = html.match(/async function camShoot\([\s\S]*?\r?\n\}/);
  assert.ok(m, 'camShoot 을 찾지 못했습니다.');
  assert.ok(/grabSharp\(c, cw, ch\)/.test(m[0]) && /MIN_SHARP/.test(m[0]),
    '찍은 사진이 흐린지 아무도 안 보면, 판독이 안 될 때에야 압니다.');
  assert.ok(/setCamWarn\(true\)/.test(m[0]), '재고서 아무 말도 안 하면 잰 보람이 없습니다.');
  assert.ok(/흐리게 찍혔습니다/.test(html), '무엇이 잘못됐는지 말해야 고치실 수 있습니다.');
});

test('★ 흐려도 사진을 버리지는 않는다', () => {
  const m = html.match(/async function camShoot\([\s\S]*?\r?\n\}/);
  const i = m[0].indexOf('setCamWarn(true)');
  const j = m[0].indexOf('camShots.push(');
  assert.ok(i > 0 && j > 0, '두 곳을 다 찾지 못했습니다.');
  assert.ok(j < i, '담고 나서 물어야 합니다 — 먼저 물으면 딴 데를 누르는 순간 사진이 사라집니다.');
  /* 빼는 것은 「다시 찍기」를 사람이 골랐을 때뿐이다(camWarnRetake). 여기서 스스로 버리면 안 된다. */
  assert.ok(!/camShots\.pop\(\)/.test(m[0]),
    '흐리다고 스스로 버리면, 다시 갈 수 없는 자리의 사진을 잃습니다.');
});

test('★ 「작게 찍혔다」와 겹쳐 말하지 않는다', () => {
  const m = html.match(/async function camShoot\([\s\S]*?\r?\n\}/);
  assert.ok(/small = true;/.test(m[0]), '작게 찍힌 것을 표시해 두지 않습니다.');
  assert.ok(/!small && sharp < MIN_SHARP/.test(m[0]),
    '두 가지를 한꺼번에 말하면 무엇을 고쳐야 할지 헷갈립니다.');
});

test('★ 흐림의 기준이 사람 눈과 크게 어긋나지 않는다', () => {
  const m = html.match(/const MIN_SHARP = (\d+);/);
  assert.ok(m, 'MIN_SHARP 가 없습니다.');
  const v = +m[1];
  assert.ok(v > 0, '0 이면 아무것도 안 걸러집니다.');
  assert.ok(v <= 20, '너무 높으면 멀쩡한 사진마다 흐리다고 합니다: ' + v);
});

/* ── 폰이 스스로 찾게 두는 부분 ── */
test('★ 카메라를 열 때 「계속 초점」을 건다', () => {
  const m = html.match(/async function openCam\([\s\S]*?\n\}/);
  assert.ok(m, 'openCam 을 찾지 못했습니다.');
  assert.ok(/focusMode: 'continuous'/.test(m[0]),
    '폰이 스스로 초점을 좇게 두지 않으면 사람이 매번 짚어야 합니다.');
});

test('★ 못 하는 기기에서는 조용히 넘어간다', () => {
  const m = html.match(/async function openCam\([\s\S]*?\n\}/);
  const i = m[0].indexOf("focusMode: 'continuous'");
  assert.ok(/catch \(_\) \{ \}/.test(m[0].slice(i, i + 160)),
    '초점을 못 거는 기기에서 카메라가 아예 안 열리면 안 됩니다.');
});
