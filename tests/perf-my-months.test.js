'use strict';
// 내 성과급이 달마다 나오는가 — node --test tests/perf-my-months.test.js
//
// 왜: 「내 성과급도 월별로 나와야 되는데 왜 안 나오나」
//     실제로는 달마다 카드가 나온다. 다만 «내 것이 있는 달»만 쌓이므로,
//     한 달만 뜨면 나머지 달이 어디 갔는지 화면이 아무 말도 안 했다.
//     게다가 내 것은 넉 달, 대표 전체 현황은 여섯 달을 봐서
//     대표 현황엔 있는 달이 내 화면엔 아예 없기도 했다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* ── 같은 창을 본다 ── */
test('★ 내 것과 대표 전체 현황이 같은 개월 수를 본다', () => {
  // 넉 달 대 여섯 달로 어긋나면, 대표 현황엔 있는 달이 내 화면엔 아예 없다
  assert.match(src, /var PC_MONTHS=6;/);
  assert.match(grab('pcLoad'), /pcMonths\(PC_MONTHS\)/);
  assert.match(grab('pcLoadAll'), /pcMonths\(PC_MONTHS\)/);
  assert.ok(src.indexOf('pcMonths(4)') < 0, '넉 달로 못 박힌 곳이 남으면 또 어긋난다');
  assert.ok(src.indexOf('pcMonths(6)') < 0, '숫자를 두 곳에 적으면 다시 갈라진다');
});

/* ── 없는 달을 말해 준다 ── */
test('빈 달도 기억해 둔다', () => {
  const l = grab('pcLoad');
  assert.match(l, /S\.perfNone = r\.filter\(function\(x\)\{ return x && !x\.p; \}\)\.map\(function\(x\)\{ return x\.ym; \}\);/);
  assert.match(l, /return r\.filter\(function\(x\)\{ return x && x\.p; \}\)/, '있는 달만 카드로 쌓는 것은 그대로');
});

test('막힌 달도 «없는 달»로 센다 (조용히 사라지지 않게)', () => {
  assert.match(grab('pcLoad'), /\.catch\(function\(\)\{ return \{ym:ym, p:null\}; \}\)/);
});

test('없는 달을 화면에 적는다', () => {
  const n = grab('pcNoneHTML');
  assert.match(n, /은 내 성과급이 없습니다/);
  assert.match(src, /h\+=pcNoneHTML\(\);/);
});

test('★ 까닭 두 가지를 다 적는다 (하나만 적으면 절반은 거짓말)', () => {
  // 직원 화면에서는 ①내게 붙은 건이 없었다 와 ②아직 발행 전 을 갈라볼 수 없다
  const n = grab('pcNoneHTML');
  assert.match(n, /나에게 붙은 건이 없었거나/);
  assert.match(n, /아직 그 달을 내보내지 않았습니다/);
});

test('몇 달치를 보는지 밝힌다', () => {
  assert.match(grab('pcNoneHTML'), /최근 '\+PC_MONTHS\+'개월만 봅니다/);
  assert.match(grab('pcNoneHTML'), /더 이전 달은 대표님께 문의하세요/);
});

test('하나도 없을 때도 어느 달을 봤는지 적는다', () => {
  // 「몇 달치를 봤나」를 모르면 «없다»는 말도 믿을 수 없다
  const r = grab('renderPerf');
  assert.match(r, /최근 '\+PC_MONTHS\+'개월\('\+esc\(\(S\.perfNone\|\|\[\]\)/);
});

test('없는 달이 하나도 없으면 아무 말도 안 한다', () => {
  const box = { S:{ perfNone:[] }, PC_MONTHS:6, esc:(x)=>String(x) };
  vm.createContext(box);
  vm.runInContext(grab('pcYmLabel') + '\n' + grab('pcNoneHTML') + '\nthis.f = pcNoneHTML;', box);
  assert.equal(box.f(), '', '다 나온 달만 있으면 군더더기를 안 붙인다');
});

/* ── 실제로 돌려 본다 ── */
test('없는 달을 최신순으로 적는다', () => {
  const box = { S:{ perfNone:['2026-05','2026-08','2026-07'] }, PC_MONTHS:6, esc:(x)=>String(x) };
  vm.createContext(box);
  vm.runInContext(grab('pcYmLabel') + '\n' + grab('pcNoneHTML') + '\nthis.f = pcNoneHTML;', box);
  const out = box.f();
  assert.match(out, /8월 · 7월 · 5월/, '최신 달이 앞이라야 눈이 따라간다');
  assert.ok(out.indexOf('2026-05') < 0, '연도까지 늘어놓지 않는다');
});

test('★ 기억해 둔 것을 고치지 않는다', () => {
  // sort() 는 원래 배열을 뒤집는다 — 그대로 쓰면 다음에 그릴 때 순서가 달라진다
  const box = { S:{ perfNone:['2026-05','2026-08'] }, PC_MONTHS:6, esc:(x)=>String(x) };
  vm.createContext(box);
  vm.runInContext(grab('pcYmLabel') + '\n' + grab('pcNoneHTML') + '\nthis.f = pcNoneHTML;', box);
  box.f(); box.f();
  assert.deepEqual(Array.from(box.S.perfNone), ['2026-05','2026-08'], '원래 순서가 그대로여야 한다');
});

test('달 이름은 「n월」로 짧게', () => {
  const box = {};
  vm.createContext(box);
  vm.runInContext(grab('pcYmLabel') + '\nthis.f = pcYmLabel;', box);
  assert.equal(box.f('2026-08'), '8월');
  assert.equal(box.f('2026-05'), '5월');
});

/* ── 지켜야 할 것 ── */
test('달마다 카드가 따로 나오는 방식은 그대로', () => {
  // 여러 달이 밀렸을 때 한 화면에서 다 보이는 것이 이 화면의 값어치다
  assert.match(grab('renderPerf'), /h\+=list\.map\(pcMonthHTML\)\.join\(''\);/);
  assert.match(src, /'년 '\+\(\+ym\.slice\(5,7\)\)\+'월 성과급/, '카드마다 달 이름이 붙는다');
});

test('내 것은 여전히 로그인 본인 것만', () => {
  const l = grab('pcLoad');
  assert.match(l, /var sid=pcMySid\(\);/);
  assert.ok(!/\bsid\b/.test((grab('pcLoad').match(/function pcLoad\(([^)]*)\)/) || [])[1] || ''),
    'sid 를 밖에서 받으면 남의 것이 보인다');
});
