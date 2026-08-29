/* 하루 폭주 알림 · AI 칸 (대표 지시 2026-08-29)

   ★ 왜 만들었나 — 2026-08-16 에 백업이 폭주해 **하루에 86,042원**이 나갔는데
     **아무 알림도 없었다.** 걸려 있던 알림은 「총액이 얼마를 넘으면」이라,
     그 금액에 닿을 때쯤이면 이미 다 나간 뒤였다.

   ⚠ 이 검사는 판정 함수를 **실제로 돌린다.** 글자만 보면 관문을 없애도 통과한다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const BA = require(path.join(ROOT, 'functions', 'billing-alert.js'));

const DAY = 86400000;
/* 한국 시간 정오 — 날짜 자르기가 UTC 로 새지 않는지 함께 본다 */
function noonKst(dayStr) { return Date.parse(dayStr + 'T03:00:00Z'); }
/* {시각: 누적금액} 판을 만든다 — 날마다 마지막 값만 쓰이므로 하루 한 줄이면 된다 */
function hist(pairs) {
  const h = {};
  pairs.forEach(([d, cum]) => { h[String(noonKst(d))] = cum; });
  return h;
}

/* ══════ ① 날짜 자르기 ══════ */

test('날짜는 한국 시간으로 자른다 — UTC 로 자르면 아침 돈이 전날에 붙는다', () => {
  /* 한국 8/17 오전 8시 = UTC 8/16 23시 */
  assert.strictEqual(BA.kstDay(Date.parse('2026-08-16T23:00:00Z')), '2026-08-17');
  assert.strictEqual(BA.kstDay(Date.parse('2026-08-17T14:59:00Z')), '2026-08-17');
  assert.strictEqual(BA.kstDay(Date.parse('2026-08-17T15:00:00Z')), '2026-08-18');
});

/* ══════ ② 누적을 증가분으로 ══════ */

test('기록은 «누적»이라 차를 내야 한다 — 그대로 더하면 안 된다', () => {
  const rows = BA.dailyIncreases(hist([
    ['2026-08-10', 1000], ['2026-08-11', 1400], ['2026-08-12', 1500],
  ]));
  assert.deepStrictEqual(rows, [
    { day: '2026-08-11', inc: 400 },
    { day: '2026-08-12', inc: 100 },
  ]);
});

test('첫날은 증가분을 «없음»으로 둔다 — 0 으로 두면 다음 날이 통째로 폭주가 된다', () => {
  const rows = BA.dailyIncreases(hist([['2026-08-10', 5000], ['2026-08-11', 5100]]));
  assert.strictEqual(rows.length, 1, '첫날 몫이 끼면 안 된다');
  assert.strictEqual(rows[0].day, '2026-08-11');
});

test('달이 바뀌어 0 부터 다시 세는 «큰 마이너스»는 증가가 아니다', () => {
  const rows = BA.dailyIncreases(hist([
    ['2026-08-30', 100000], ['2026-08-31', 101000], ['2026-09-01', 300],
  ]));
  assert.ok(rows.every(r => r.inc >= 0), '마이너스가 섞이면 평균이 망가진다');
  assert.ok(!rows.some(r => r.day === '2026-09-01'), '달이 바뀐 날은 견줄 수 없다');
});

/* ══════ ③ 폭주 판정 ══════ */

test('8/16 같은 날을 잡는다 — 이것이 이 기능의 존재 이유다', () => {
  const rows = [];
  for (let d = 8; d <= 15; d++) rows.push(['2026-08-' + String(d).padStart(2, '0'), (d - 8) * 420]);
  rows.push(['2026-08-16', 7 * 420 + 86042]);          // 그날 86,042원
  const hit = BA.spikeCheck(hist(rows), noonKst('2026-08-16'));
  assert.ok(hit, '하루에 86,042원이 나갔는데 못 잡으면 이 기능은 없는 것이다');
  assert.strictEqual(hit.inc, 86042);
  assert.strictEqual(hit.avg, 420);
  assert.ok(hit.ratio > 100, '배수를 제대로 못 냈다');
  assert.strictEqual(hit.day, '2026-08-16');
});

test('평소대로 쓴 날은 조용하다 — 늘 뜨는 경고는 아무도 안 본다', () => {
  const rows = [];
  for (let d = 10; d <= 20; d++) rows.push(['2026-08-' + d, (d - 10) * 500]);
  assert.strictEqual(BA.spikeCheck(hist(rows), noonKst('2026-08-20')), null);
});

test('작은 금액은 배수가 커도 안 잡는다 — 20원에서 100원도 5배다', () => {
  const rows = [];
  for (let d = 10; d <= 19; d++) rows.push(['2026-08-' + d, (d - 10) * 20]);
  rows.push(['2026-08-20', 9 * 20 + 200]);            // 20원 → 200원 (10배)
  const hit = BA.spikeCheck(hist(rows), noonKst('2026-08-20'));
  assert.strictEqual(hit, null, '금액 바닥이 없으면 잡음이 매일 뜬다');
});

test('견줄 «평소»가 없으면 판정하지 않는다 — 없는 평소로 「몇 배」는 거짓말이다', () => {
  /* 달이 막 바뀌어 이틀치뿐 */
  const hit = BA.spikeCheck(hist([['2026-09-01', 0], ['2026-09-02', 90000]]), noonKst('2026-09-02'));
  assert.strictEqual(hit, null);
});

test('오늘 자료가 아직 없으면 «어제 것»을 오늘 일로 말하지 않는다', () => {
  const rows = [];
  for (let d = 10; d <= 19; d++) rows.push(['2026-08-' + d, (d - 10) * 400]);
  rows.push(['2026-08-20', 9 * 400 + 50000]);
  /* 하루 뒤에 물어본다 — 8/20 은 오늘이 아니다 */
  assert.strictEqual(BA.spikeCheck(hist(rows), noonKst('2026-08-21')), null);
});

/* ══════ ④ 어느 칸에서 느는가 ══════ */

test('가장 많이 는 칸을 짚어 준다 — 「어디서」가 있어야 손을 쓴다', () => {
  const mk = (a, b) => hist([['2026-08-15', a], ['2026-08-16', b]]);
  const who = BA.spikeCulprit({
    total: mk(0, 90000),          // 전체는 세지 않는다
    database: mk(0, 86000),
    storage: mk(0, 10),
    ai: mk(0, 3000),
  }, noonKst('2026-08-16'));
  assert.ok(who, '아무 칸도 못 짚었다');
  assert.strictEqual(who.key, 'database');
  assert.strictEqual(who.label, BA.LABELS.database);
});

/* ══════ ⑤ AI 칸 ══════ */

test('예산 이름 pu-ai 를 알아듣는다 — 모르면 쪽지를 조용히 버린다', () => {
  assert.strictEqual(BA.BUDGET_KEYS['pu-ai'], 'ai');
  assert.ok(BA.LABELS.ai, 'AI 칸 이름표가 없다');
  const p = BA.parseAlert({
    budgetDisplayName: 'pu-ai', costAmount: 9900, budgetAmount: 1000000,
    costIntervalStart: '2026-08-01T00:00:00Z', currencyCode: 'KRW',
  });
  assert.ok(p.ok, '쪽지를 못 알아들었다: ' + p.why);
  assert.strictEqual(p.key, 'ai');
  assert.strictEqual(p.row.label, BA.LABELS.ai);
});

test('화면도 AI 칸을 쪼개 보여 준다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'pu-billing.js'), 'utf8');
  const m = /var PARTS = \[([^\]]*)\]/.exec(src);
  assert.ok(m, 'PARTS 를 찾지 못했다');
  assert.ok(/'ai'/.test(m[1]),
    "AI 요금이 「그 밖」에 섞여 얼마나 쓰는지 볼 수가 없다");
});

/* ══════ ⑥ 화면이 지켜야 할 것 ══════ */

test('폭주 줄은 «오늘 것일 때만» 뜬다 — 어제 것이 붉게 남으면 곧 안 믿는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
  const a = src.indexOf('function billSpikeToday');
  assert.ok(a > 0, 'billSpikeToday 가 없다');
  const body = src.slice(a, a + 900);
  assert.ok(/sp\.day === today/.test(body), '오늘 것인지 안 본다');
  assert.ok(/3600000/.test(body), '한국 날짜로 안 견준다 — UTC 로 견주면 하루가 어긋난다');
});

test('폰에서 폭주 줄을 감추지 않는다 — 설명이 아니라 알림이다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
  /* 폰용 접기 규칙에 .bspike 가 끼면 폰으로만 보시는 분은 영영 못 본다 */
  assert.ok(!/\.bspike\s*\{[^}]*display:\s*none\s*!important/.test(src),
    '폰에서 폭주 줄이 접힌다');
});

test('「막았다」고 말하지 않는다 — Blaze 에는 자동 상한이 없다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
  const a = src.indexOf('function billPaintSpike');
  assert.ok(a > 0, 'billPaintSpike 가 없다');
  const body = src.slice(a, a + 1200);
  assert.ok(/멈추는 장치는 없습니다|자동으로 멈추지/.test(body),
    '멈추지 않는다는 말이 빠지면, 알림만 믿고 손을 안 쓰시게 된다');
});
