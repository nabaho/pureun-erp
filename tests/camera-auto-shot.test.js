/* 자동 촬영 — 멈추면 저절로 찍힌다 (대표 지시 2026-08-08, 계획서 3단계)
   셔터를 누르는 순간 손이 흔들려 흐려진다.

   ⚠ 이 기능의 대부분은 **헛찍기를 막는 장치**다:
     ① 찍고 나면 잠시 아무것도 안 찍는다
     ② 그 뒤에도 화면이 크게 바뀌어야(명함을 바꿔 놓아야) 다시 겨눈다
     ③ 너무 밋밋하면(어둠·빈 책상) 안 찍는다
   그래서 검사도 「찍힌다」보다 **「안 찍힌다」**를 더 많이 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 상수와 판단 함수만 떼어 진짜로 돌린다 */
function boot(over) {
  const names = ['grabTiny', 'tinyDiff', 'tinyContrast', 'autoTick', 'startAutoWatch', 'stopAutoWatch'];
  const consts = html.match(/const CAM_AUTO_LS[\s\S]*?const MIN_CONTRAST = \d+;/);
  assert.ok(consts, '자동 촬영 상수를 찾지 못했습니다.');
  const state = html.match(/let autoTimer = null[^\n]*\n/);
  assert.ok(state, '자동 촬영 상태 변수를 찾지 못했습니다.');

  const shots = [];
  const ctx = Object.assign({
    Math, Date, Uint8Array, console,
    localStorage: { getItem: () => '1', setItem() {} },
    document: { createElement: () => ({ getContext: () => ({}) }) },
    setInterval: () => 1, clearInterval() {},
    camBusy: false,
    camShoot: () => { shots.push(Date.now()); },
    $: (id) => (id === 'camOv' ? { style: { display: 'flex' } } : { style: {}, textContent: '' }),
    camAutoPref: () => true
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(consts[0].replace(/^const /gm, 'var '), ctx);
  vm.runInContext(state[0].replace(/^let /, 'var '), ctx);
  names.forEach(function (n) {
    const m = html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'));
    if (m) vm.runInContext(m[0], ctx);
  });
  ctx.__shots = shots;
  return ctx;
}

/* 장면을 흉내낸다 — grabTiny 를 갈아끼워 우리가 준 밝기 배열을 돌려준다 */
function scene(fill) {
  const g = new Uint8Array(40 * 30);
  for (let i = 0; i < g.length; i++) g[i] = fill(i);
  return g;
}
const flat = (v) => scene(() => v);                       // 밋밋한 화면(어둠·빈 책상)
const card = (o) => scene((i) => ((i % 40) < 20 ? 30 : 200) + (o || 0));   // 대비가 있는 화면

function run(ctx, frames) {
  frames.forEach(function (g) { ctx.grabTiny = () => g; ctx.autoTick(); });
}

/* ── 찍히는 경우 ── */
test('★ 대비가 있고 멎어 있으면 찍는다', () => {
  const c = boot();
  const g = card();
  run(c, [g, g, g, g, g]);   // 첫 장은 견줄 것이 없고, 그 뒤 세 번 멎으면 찍힌다
  assert.equal(c.__shots.length, 1, '멎었는데 안 찍히면 자동 촬영이 아닙니다.');
});

/* ── 안 찍혀야 하는 경우 (이쪽이 더 중요하다) ── */
test('★ 흔들리는 동안에는 안 찍는다', () => {
  const c = boot();
  run(c, [card(0), card(40), card(0), card(40), card(0), card(40)]);
  assert.equal(c.__shots.length, 0, '흔들릴 때 찍으면 흐린 사진만 쌓입니다.');
});

test('★ 밋밋하면 안 찍는다 (어둠·빈 책상·손바닥)', () => {
  const c = boot();
  const g = flat(120);
  run(c, [g, g, g, g, g, g]);
  assert.equal(c.__shots.length, 0, '볼 것이 없는데 찍으면 헛사진이 쌓입니다.');
});

test('★ 찍고 나면 곧바로 또 찍지 않는다', () => {
  const c = boot();
  const g = card();
  run(c, [g, g, g, g]);                     // 한 장 찍힘
  assert.equal(c.__shots.length, 1);
  run(c, [g, g, g, g, g, g, g, g]);         // 그대로 두면
  assert.equal(c.__shots.length, 1, '같은 명함을 계속 찍으면 안 됩니다.');
});

test('★ 명함을 바꿔 놓아야 다음 장을 받는다', () => {
  const c = boot();
  const g1 = card();
  run(c, [g1, g1, g1, g1]);
  assert.equal(c.__shots.length, 1);
  /* 쉬는 시간이 지났다고 치고, 장면을 크게 바꾼다 */
  c.autoCoolUntil = 0;
  const g2 = card(60);
  run(c, [g2]);                              // 크게 바뀜 → 다시 겨눔
  run(c, [g2, g2, g2]);                      // 멎음 → 찍힘
  assert.equal(c.__shots.length, 2);
});

/* ⚠ 위 검사만으로는 두 장치(쉬는 시간·다시 겨눔)가 **서로 가려 준다** —
   하나를 없애도 다른 하나가 막아서 안 잡힌다. 그래서 각각을 따로 시험한다. */
test('★ 쉬는 시간만으로도 막힌다 (겨눔이 풀려 있어도)', () => {
  const c = boot();
  const g = card();
  run(c, [g, g, g, g]);
  assert.equal(c.__shots.length, 1);
  c.autoArmed = true;                 // 장면이 바뀐 척 — 겨눔은 풀렸다
  run(c, [g, g, g, g]);               // 그래도 쉬는 시간 안이다
  assert.equal(c.__shots.length, 1, '찍자마자 또 찍으면 같은 장이 연타로 쌓입니다.');
});

test('★ 「다시 겨눔」만으로도 막힌다 (쉬는 시간이 지나도)', () => {
  const c = boot();
  const g = card();
  run(c, [g, g, g, g]);
  assert.equal(c.__shots.length, 1);
  c.autoCoolUntil = 0;                // 쉬는 시간은 지났다
  run(c, [g, g, g, g, g, g]);         // 장면은 그대로다
  assert.equal(c.__shots.length, 1, '명함을 안 바꿨는데 또 찍으면 같은 것이 쌓입니다.');
});

test('자동이 꺼져 있으면 아무 일도 없다', () => {
  const c = boot({ camAutoPref: () => false });
  const g = card();
  run(c, [g, g, g, g, g]);
  assert.equal(c.__shots.length, 0);
});

test('카메라가 닫혀 있으면 안 찍는다', () => {
  const c = boot({ $: () => ({ style: { display: 'none' }, textContent: '' }) });
  const g = card();
  run(c, [g, g, g, g, g]);
  assert.equal(c.__shots.length, 0);
});

test('찍는 중이면 겹쳐 찍지 않는다', () => {
  const c = boot({ camBusy: true });
  const g = card();
  run(c, [g, g, g, g, g]);
  assert.equal(c.__shots.length, 0);
});

/* ── 재는 방식 ── */
test('밝기 차이와 대비를 제대로 센다', () => {
  const c = boot();
  assert.equal(c.tinyDiff(flat(10), flat(20)), 10);
  assert.equal(c.tinyDiff(null, flat(10)), 999, '견줄 것이 없으면 「많이 다르다」로 봅니다.');
  assert.equal(c.tinyContrast(flat(100)), 0);
  assert.ok(c.tinyContrast(card()) > 100);
});

/* ── 발열·배터리 ── */
test('★ 매 프레임 재지 않는다 (발열)', () => {
  const m = html.match(/const SAMPLE_MS = (\d+)/);
  assert.ok(m, 'SAMPLE_MS 가 없습니다.');
  assert.ok(+m[1] >= 80, '너무 자주 재면 폰이 뜨거워집니다: ' + m[1] + 'ms');
  assert.ok(!/requestAnimationFrame\([\s\S]{0,40}autoTick/.test(html),
    '매 프레임 도는 방식이면 발열을 못 잡습니다.');
});

test('★ 아주 작게 줄여서 잰다', () => {
  assert.ok(/autoCan\.width = 40; autoCan\.height = 30;/.test(html),
    '큰 화면을 그대로 재면 폰이 버티지 못합니다.');
  assert.ok(/willReadFrequently: true/.test(html), '자주 읽는다고 알려야 느려지지 않습니다.');
});

test('★ 카메라를 닫으면 재는 것도 멈춘다', () => {
  const close = html.match(/function closeCam\(\)[\s\S]*?\n\}/);
  assert.ok(/stopAutoWatch\(\)/.test(close[0]), '닫았는데 계속 재면 배터리만 먹습니다.');
  const disc = html.match(/function camDiscard\(\)[\s\S]*?\n\}/);
  assert.ok(/stopAutoWatch\(\)/.test(disc[0]));
});

/* ── 사람이 고를 수 있어야 한다 ── */
test('★ 셔터 단추는 그대로 있다', () => {
  assert.ok(/id="camShut" onclick="camShoot\(\)"/.test(html),
    '자동이 안 잡히는 곳(어두운 데)에서 사람이 누를 길을 없애면 안 됩니다.');
});

test('껐다 켤 수 있고 기억한다', () => {
  assert.ok(/id="camAuto" onchange="setCamAutoPref\(this\.checked\)"/.test(html));
  const m = html.match(/function setCamAutoPref\(on\)[\s\S]*?\n\}/);
  assert.ok(/localStorage\.setItem\(CAM_AUTO_LS/.test(m[0]), '다음에 열 때도 그대로여야 합니다.');
  assert.ok(/startAutoWatch\(\)/.test(m[0]) && /stopAutoWatch\(\)/.test(m[0]));
});

test('★ 자동으로 찍는 중임을 화면이 말한다', () => {
  const m = html.match(/function setCamTip\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'setCamTip 이 없습니다.');
  assert.ok(/저절로 찍힙니다/.test(m[0]),
    '아무 말이 없으면 「왜 저절로 찍히지」가 됩니다.');
});
