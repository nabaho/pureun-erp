/* 사용액 시간별 기록 (2026-08-17 대표 지시)
   "몇 시에 체크 시 얼마 그리고 얼마 상승 · 각 항목마다 시간당 얼마씩 · 창고·DB·서버·그밖 각각"

   ★ 이 숫자가 오는 방식이 규칙을 정한다 —
     구글은 「금액이 움직일 때만」 쏘고, 항목 넷이 «각각 따로» 온다.
     그래서 ①시각을 그대로 나누지 않고 한 시간 칸으로 묶는다
          ②소식 없는 시간을 «0 원으로 적지 않는다» (0 은 「공짜였다」로 읽힌다) */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const BA = require(path.join(ROOT, 'functions', 'billing-alert.js'));

/* ── 서버: 기록 한 줄을 어디에 무엇으로 담나 ── */
function alert(o) {
  return {
    budgetDisplayName: o.name || 'pu-database',
    costAmount: o.cost,
    budgetAmount: o.budget,
    currencyCode: 'KRW',
    costIntervalStart: o.start || '2026-08-01T00:00:00Z',
    alertThresholdExceeded: o.th
  };
}

test('기록 한 줄을 만든다', () => {
  const p = BA.parseAlert(alert({ cost: 81225 }));
  const e = BA.historyEntry(p, 1755419280000);
  assert.strictEqual(e.path, 'billing/history/2026-08/database/1755419280000');
  assert.strictEqual(e.value, 81225);
});

test('달은 «집계 시작일» 에서 뽑는다 — 도착 시각이 아니다', () => {
  /* ★ 도착 시각으로 뽑으면 월말 자정 무렵 쪽지가 엉뚱한 달에 담긴다.
     달이 어긋나면 증가분 계산이 «큰 마이너스» 로 터진다. */
  const p = BA.parseAlert(alert({ cost: 100, start: '2026-08-01T00:00:00Z' }));
  // 도착은 9월 1일인데 집계는 8월분이다
  const e = BA.historyEntry(p, Date.parse('2026-09-01T00:05:00Z'));
  assert.strictEqual(e.path.indexOf('billing/history/2026-08/') === 0, true, '9월에 담겼다: ' + e.path);
});

test('항목마다 제 자리에 담긴다', () => {
  const kinds = [['pu-total', 'total'], ['pu-storage', 'storage'],
    ['pu-database', 'database'], ['pu-functions', 'functions']];
  kinds.forEach(function (k) {
    const p = BA.parseAlert(alert({ name: k[0], cost: 1 }));
    const e = BA.historyEntry(p, 1000);
    assert.strictEqual(e.path, 'billing/history/2026-08/' + k[1] + '/1000');
  });
});

test('값은 숫자 하나다 — 자료를 가볍게 둔다', () => {
  const p = BA.parseAlert(alert({ cost: 81225, budget: 50000 }));
  const e = BA.historyEntry(p, 1000);
  assert.strictEqual(typeof e.value, 'number');
});

test('0원도 담는다 — 달이 막 바뀌면 0 이다', () => {
  const p = BA.parseAlert(alert({ cost: 0 }));
  assert.strictEqual(BA.historyEntry(p, 1000).value, 0);
});

test('못 알아보는 쪽지에는 아무것도 안 만든다', () => {
  /* 반쪽을 담으면 화면에 0 원이 뜨고, 0 원은 「안 썼다」로 읽힌다 */
  assert.strictEqual(BA.historyEntry({ ok: false, why: 'x' }, 1000), null);
  assert.strictEqual(BA.historyEntry(null, 1000), null);
  assert.strictEqual(BA.historyEntry(BA.parseAlert(alert({ cost: 1 })), null), null);
});

test('기록 쓰기가 실패해도 「지금 값」은 살린다', () => {
  /* ★ 지금 값이 더 중요하다 — 기록 때문에 지금 값이 안 올라가면 손해가 크다.
     그래서 ①current 트랜잭션이 «먼저» 오고 ②기록 쓰기는 try/catch 로 감싼다. */
  const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
  const fn = idx.slice(idx.indexOf('exports.recordBillingAlert'),
    idx.indexOf('exports.recordBillingAlert') + 3000);
  const tx = fn.indexOf('ref.transaction(');
  const hist = fn.indexOf('BA.historyEntry(');
  assert.ok(tx > 0 && hist > tx, '기록 쓰기가 지금 값 갱신보다 앞에 있다');
  /* ※ 함수 앞쪽에도 try 가 있다 — 「어딘가에 try 가 있다」로는 부족하다.
     지금 값 갱신 «뒤» 에 열린 try 안에 있어야 한다. */
  const t = fn.lastIndexOf('try {', hist);
  assert.ok(t > tx, '기록 쓰기가 try/catch 밖에 있다 (지금 값까지 함께 죽는다)');
});

/* ── 화면 셈: 한 시간 칸으로 묶기 ── */
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'pu-billing.js'), 'utf8');
const g = { window: {}, console, Math, Number, String, Object, Array, Date, isFinite, parseInt };
g.window = g;
vm.createContext(g);
vm.runInContext(SRC, g);
const B = g.PuBilling;

// 시각 만들기 도우미 (그 달 17일 h시 m분, UTC 로 고정해 검사가 시간대에 안 흔들리게)
const T = (h, m) => Date.parse('2026-08-17T' + String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0') + ':00Z');

test('한 시간 칸으로 묶어 증가분을 낸다', () => {
  const buckets = B.hourBuckets({
    total: { [T(16, 10)]: 100, [T(17, 5)]: 150, [T(18, 2)]: 190 }
  }, { tz: 0 });
  const h17 = buckets.filter((b) => /T17$/.test(b.hour))[0];
  assert.strictEqual(h17.total, 50, '17시 증가분');
  const h18 = buckets.filter((b) => /T18$/.test(b.hour))[0];
  assert.strictEqual(h18.total, 40);
});

test('한 칸에 여러 쪽지가 오면 마지막 값으로 본다', () => {
  const buckets = B.hourBuckets({
    total: { [T(16, 0)]: 100, [T(17, 5)]: 120, [T(17, 40)]: 150, [T(17, 55)]: 160 }
  }, { tz: 0 });
  const h17 = buckets.filter((b) => /T17$/.test(b.hour))[0];
  assert.strictEqual(h17.total, 60, '100 → 160 이어야 한다');
});

test('첫 칸에는 증가분이 없다 — 0 이 아니다', () => {
  /* 앞이 없으니 「얼마 늘었나」를 모른다. 0 으로 적으면 「안 늘었다」로 읽힌다. */
  const buckets = B.hourBuckets({ total: { [T(16, 0)]: 100 } }, { tz: 0 });
  assert.strictEqual(buckets[0].known.total, false);
  assert.strictEqual(buckets[0].total, null);
});

test('쪽지 없는 칸은 0 이 아니라 「모른다」', () => {
  /* ★ 구글이 안 쏜 것뿐일 수 있다. 0 으로 적으면 「그 시간엔 공짜였다」로 읽힌다. */
  const buckets = B.hourBuckets({
    total: { [T(16, 0)]: 100, [T(18, 0)]: 200 }
  }, { tz: 0 });
  const h17 = buckets.filter((b) => /T17$/.test(b.hour))[0];
  assert.strictEqual(h17.known.total, false, '17시를 안다고 했다');
  assert.strictEqual(h17.total, null);
});

test('항목 넷을 각각 낸다', () => {
  const buckets = B.hourBuckets({
    total: { [T(16, 0)]: 1000, [T(17, 0)]: 1200 },
    storage: { [T(16, 0)]: 10, [T(17, 0)]: 12 },
    database: { [T(16, 0)]: 900, [T(17, 0)]: 1090 },
    functions: { [T(16, 0)]: 5, [T(17, 0)]: 5 }
  }, { tz: 0 });
  const h = buckets.filter((b) => /T17$/.test(b.hour))[0];
  assert.strictEqual(h.parts.storage, 2);
  assert.strictEqual(h.parts.database, 190);
  assert.strictEqual(h.parts.functions, 0);
  assert.strictEqual(h.parts.etc, 8, '그 밖 = 200 − (2+190+0)');
});

test('「그 밖」이 마이너스로 보이지 않는다', () => {
  /* 낡은 칸 몫이 새어 마이너스로 보이던 일이 있었다 (2026-08-16 「그 밖 착시」) */
  const buckets = B.hourBuckets({
    total: { [T(16, 0)]: 100, [T(17, 0)]: 110 },
    database: { [T(16, 0)]: 50, [T(17, 0)]: 90 }
  }, { tz: 0 });
  const h = buckets.filter((b) => /T17$/.test(b.hour))[0];
  assert.strictEqual(h.parts.etc, 0, '음수를 그대로 내놨다: ' + h.parts.etc);
});

test('빈 값에도 안 터진다', () => {
  // vm 안에서 만든 배열이라 deepStrictEqual 은 realm 이 달라 걸린다 — 길이로 본다
  assert.strictEqual(B.hourBuckets(null, { tz: 0 }).length, 0);
  assert.strictEqual(B.hourBuckets({}, { tz: 0 }).length, 0);
});

/* ── 시간당 ── */
test('시간당은 «아는 칸» 으로만 나눈다', () => {
  /* ★ 소식 없는 칸을 0 으로 치고 나누면 시간당이 실제보다 «낮게» 나온다 */
  const buckets = [
    { hour: 'x1', total: 100, parts: { database: 100 }, known: { total: true, database: true } },
    { hour: 'x2', total: null, parts: {}, known: { total: false, database: false } },
    { hour: 'x3', total: 300, parts: { database: 300 }, known: { total: true, database: true } }
  ];
  const r = B.hourlyRates(buckets);
  assert.strictEqual(r.total, 200, '(100+300)/2 여야 한다 — 3으로 나눴다');
  assert.strictEqual(r.parts.database, 200);
});

test('아는 칸이 없으면 시간당은 «모른다»', () => {
  const r = B.hourlyRates([{ hour: 'x', total: null, parts: {}, known: { total: false } }]);
  assert.strictEqual(r.total, null, '0 을 돌려줬다 — 없는 것과 0 은 다르다');
});

test('빈 값에도 안 터진다 (시간당)', () => {
  assert.strictEqual(B.hourlyRates(null).total, null);
  assert.strictEqual(B.hourlyRates([]).total, null);
});

/* ── 화면 ── */
const PORTAL = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const P = bare(PORTAL);

test('칸이 둘이다 (지금 · 기록)', () => {
  assert.strictEqual(/id="billTabNow"/.test(P), true);
  assert.strictEqual(/id="billTabHist"/.test(P), true);
});

test('항목 넷이 모두 열로 있다', () => {
  const th = P.slice(P.indexOf('billHistHead'), P.indexOf('billHistHead') + 600);
  ['창고', 'DB', '서버', '그 밖'].forEach(function (w) {
    assert.strictEqual(th.indexOf(w) >= 0, true, w + ' 열이 없다');
  });
});

test('0 과 「—」 뜻풀이가 표에 붙어 있다', () => {
  /* 안 적으면 「0」과 「모른다」를 같은 것으로 읽는다 */
  assert.strictEqual(/소식이 없어/.test(P), true);
});

test('기록이 켜는 날부터 쌓인다고 «두 곳에서» 말한다', () => {
  /* 빈 표를 「고장났나」로 읽으면 안 된다.
     ①늘 보이는 아래 안내 ②기록이 하나도 없을 때의 표 안 문구 — 둘 다 있어야 한다.
     ※ 한 번만 세면 한쪽을 지워도 안 잡힌다. */
  assert.strictEqual((P.match(/켜는 날부터/g) || []).length >= 2, true,
    '「켜는 날부터」가 한 곳뿐이다 (지금 ' + (P.match(/켜는 날부터/g) || []).length + ')');
});

test('기록은 «한 번만» 읽는다 — 구독하지 않는다', () => {
  /* ★ 사용액 보려다 사용액이 늘면 웃긴다.
     once() 뒤 같은 자리 on() 은 두 번 받는다는 것도 이 저장소에서 겪었다. */
  const fn = P.slice(P.indexOf('function billHistLoad'), P.indexOf('function billHistLoad') + 900);
  assert.strictEqual(/\.once\(/.test(fn), true, 'once() 로 안 읽는다');
  assert.strictEqual(/\.on\(/.test(fn), false, '구독하고 있다');
});
