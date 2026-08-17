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

test('그 시각의 «누적액» 을 낸다 — 증가분과 다른 것이다', () => {
  /* 대표 지시: "몇 시에 체크 시 «얼마» 그리고 «얼마 상승»" — 둘 다 있어야 한다. */
  const b = B.hourBuckets({
    total: { [T(16, 10)]: 100, [T(17, 5)]: 150 }
  }, { tz: 0 });
  const h17 = b.filter((x) => /T17$/.test(x.hour))[0];
  assert.strictEqual(h17.cum, 150, '17시 누적액');
  assert.strictEqual(h17.total, 50, '17시 증가분');
  assert.notStrictEqual(h17.cum, h17.total, '누적액과 증가분이 같은 값이면 하나를 베낀 것이다');
});

test('첫 칸에도 누적액은 «있다» — 증가분만 모르는 것이다', () => {
  /* 쪽지 하나면 누적액은 알 수 있다. 앞 칸을 알아야 하는 것은 증가분뿐이다.
     여기를 함께 「모른다」로 묶으면 오늘 켠 날 표가 통째로 빈다. */
  const b = B.hourBuckets({ total: { [T(16, 0)]: 100 } }, { tz: 0 });
  assert.strictEqual(b[0].cumKnown, true, '첫 칸 누적액을 모른다고 한다');
  assert.strictEqual(b[0].cum, 100);
  assert.strictEqual(b[0].known.total, false, '첫 칸 증가분을 안다고 한다');
});

test('쪽지 없는 칸의 누적액은 앞 값을 끌어다 쓰지 않는다', () => {
  /* 「그 시각에 그랬다」가 아니라 「그 뒤로 소식이 없다」일 뿐이다.
     끌어다 쓰면 «실제로는 더 썼는데» 안 늘어난 것처럼 보인다. */
  const b = B.hourBuckets({
    total: { [T(16, 0)]: 100, [T(18, 0)]: 300 }
  }, { tz: 0 });
  const h17 = b.filter((x) => /T17$/.test(x.hour))[0];
  assert.strictEqual(h17.cumKnown, false, '17시에 소식이 없었는데 안다고 한다');
  assert.strictEqual(h17.cum, null);
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

test('한 화면에 다 보인다 — 오갈 칸이 없다', () => {
  /* 대표 지시(2026-08-17): "계속 클릭해서 보는게 불편하다.
     한번 클릭으로 실시간 변화 등을 한번에 보고 싶다."
     ★ 「지금」과 「기록」을 나누던 칸 단추가 «없어야» 한다. */
  assert.strictEqual(/billTabNow|billTabHist/.test(P), false, '아직 칸 단추가 남아 있다');
  assert.strictEqual(/id="billPaneNow"/.test(P), true);
  assert.strictEqual(/id="billPaneHist"/.test(P), true);
  // 둘 중 하나를 숨겨 두면 「한 화면」이 아니다
  const now = P.slice(P.indexOf('id="billPaneNow"') - 40, P.indexOf('id="billPaneNow"') + 40);
  const hist = P.slice(P.indexOf('id="billPaneHist"') - 40, P.indexOf('id="billPaneHist"') + 40);
  assert.strictEqual(/display:\s*none/.test(now), false, '「지금」이 숨겨져 있다');
  assert.strictEqual(/display:\s*none/.test(hist), false, '「기록」이 숨겨져 있다');
});

test('열면 시간별까지 «함께» 읽는다 — 한 번 클릭이다', () => {
  /* 여는 함수가 기록을 안 부르면, 칸만 없앤 채 오른쪽이 영영 빈다. */
  const fn = P.slice(P.indexOf('function billOpen'), P.indexOf('function billOpen') + 500);
  assert.strictEqual(/billHistLoad\(\)/.test(fn), true, '열 때 기록을 안 읽는다');
});

test('항목 넷을 «한 표에» 늘어놓는다 — 두 번 그리지 않는다', () => {
  /* 전에는 「지금」과 「시간당」이 각각 항목 넷을 늘어놓아 눈이 두 번 움직였다. */
  assert.strictEqual(/id="billRate"/.test(P), false, '옛 시간당 표가 남아 있다');
  assert.strictEqual(/id="billItems"/.test(P), true);
  const fn = P.slice(P.indexOf('function billPaintItems'), P.indexOf('function billPaintItems') + 1800);
  assert.strictEqual(/'지금까지'|>지금까지</.test(fn), true, '「지금까지」 열이 없다');
  assert.strictEqual(/'시간당'|>시간당</.test(fn), true, '「시간당」 열이 없다');
});

/* 함수 «몸통만» 떼어낸다 — 창을 글자수로 잡으면 다음 함수까지 넘어가고,
   그러면 「함수 정의」를 「호출」로 착각한다(2026-08-17 실제로 당했다). */
function body(name) {
  const a = P.indexOf('function ' + name);
  if (a < 0) return '';
  const b = P.indexOf('\n  function ', a + 5);
  return P.slice(a, b < 0 ? P.length : b);
}

test('한쪽 값이 늦게 와도 다른 쪽을 지우지 않는다', () => {
  /* 「지금까지」는 구독으로, 「시간당」은 기록에서 온다 — «도착 때가 다르다».
     둘 다 같은 함수가 그려야 나중에 온 쪽이 먼저 온 쪽을 지우지 않는다.
     ※ 「billPaintItems()」만 찾으면 함수 «정의» 가 걸린다 — 세미콜론까지 본다. */
  assert.strictEqual(/billPaintItems\(\);/.test(body('billPaintModal')), true,
    '구독 쪽이 항목 표를 안 그린다');
  const hist = body('billPaintHist');
  const after = hist.slice(hist.indexOf('hourlyRates(rows)'));
  assert.strictEqual(/billPaintItems\(\);/.test(after), true,
    '시간당을 낸 뒤 항목 표를 안 그린다');
});

test('「모르는 시간을 셈에서 뺐다」를 시간당 옆에 적는다', () => {
  /* 이 말이 없으면 낮게 나온 숫자를 그대로 믿고 안심한다.
     ※ 「칸 읽는 법」의 「소식이 없어」와 «다른» 문구다 — 하나로 갈음할 수 없다. */
  const it = body('billPaintItems');
  assert.strictEqual(/셈에서 뺐습니다/.test(it), true, '시간당 옆 안내가 없다');
  assert.strictEqual(/«낮게»|낮게/.test(it), true, '「낮게 나온다」는 말이 없다');
});

test('기록이 비면 시간당도 함께 지운다', () => {
  /* 기간을 「어제」로 바꿨는데 어제 기록이 없으면, 오늘 것으로 낸 시간당이
     그대로 남아 «어제 값인 척» 한다. */
  const fn = P.slice(P.indexOf('function billPaintHist'), P.indexOf('function billPaintHist') + 2600);
  const empty = fn.slice(fn.indexOf('아직 쌓인 기록이 없습니다'), fn.indexOf('아직 쌓인 기록이 없습니다') + 300);
  assert.strictEqual(/_billRates\s*=\s*null/.test(empty), true, '옛 시간당이 남는다');
});

test('좁은 화면에서는 위아래로 접힌다', () => {
  /* 780px 를 그대로 밀어붙이면 노트북·휴대폰에서 표가 짜부라진다. */
  const css = P.slice(P.indexOf('#billModal .bcols'), P.indexOf('#billModal .bwhen'));
  assert.strictEqual(/@media/.test(css), true, '좁은 화면 대비가 없다');
  assert.strictEqual(/flex-direction:\s*column/.test(css), true, '접히지 않는다');
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

test('「전체」 열에 실제 값이 들어간다', () => {
  /* ★ 열 이름만 있고 값은 «늘 비어» 있던 자리다(2026-08-17 발견).
     대표 지시의 「몇 시에 «얼마»」가 바로 이 열이다 — 비어 있으면 지시의 절반이 없는 것이다. */
  const fn = P.slice(P.indexOf('function billPaintHist'), P.indexOf('function billPaintHist') + 2600);
  const row = fn.slice(fn.indexOf("':00</td>'"), fn.indexOf("':00</td>'") + 500);
  assert.strictEqual(/cumKnown/.test(row), true, '누적값을 안 쓴다');
  assert.strictEqual(/fmtWon\(\s*b\.cum\s*\)/.test(row), true, '누적값을 그리지 않는다');
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
