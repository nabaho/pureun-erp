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

/* 대표 지시 2026-08-17: "이거 한화면에 모두볼수있게 고쳐줘"
   폰 412×760 에서 실제로 그려 재 보니 —
     · 「시간별 기록」 제목이 y=558 : 표를 보려면 **먼저 스크롤**해야 했다
     · 표가 433px 인데 들어갈 칸은 342px : 오른쪽 칸들이 **잘려 나갔다**
   고친 뒤: 제목 y=383 · 표 384px = 칸 384px(안 잘림) · 창 안이 세로로 안 밀림.
   ⚠ PC(1280)는 그대로 두 칸이고 ⓘ 는 안 보인다 — 함께 확인했다. */
const enterHtml = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

/* ⚠ enter.html 에는 `@media(max-width:520px)` 가 여럿이다(아래 단추 자리에도 있다).
   그냥 첫 블록을 집으면 엉뚱한 것을 보게 된다 — 실제로 이 검사가 처음에 그렇게 틀렸다.
   그래서 사용액 창 블록의 «머리말»부터 잘라 본다. */
const BILL_PHONE_MARK = '/* ── 폰: 한 화면에 (대표 지시 2026-08-17';
function billPhoneCss() {
  const at = enterHtml.indexOf(BILL_PHONE_MARK);
  assert.ok(at > 0, '사용액 창의 폰용 블록을 찾지 못했습니다');
  const open = enterHtml.indexOf('@media(max-width:520px){', at);
  const end = enterHtml.indexOf('\n}', open);
  return enterHtml.slice(open, end + 2);
}

test('폰에서 사용액 창이 한 화면에 들어간다', () => {
  const css = billPhoneCss();
  // 창을 화면에 꽉 — 좁은 폭 그대로 두면 표가 짜부라진다
  assert.match(css, /#billModal \.box\{width:100%;max-width:100%;max-height:96vh;\}/);
  /* 창 «전체»가 밀리면 표가 화면 밖으로 나간다 — 칸 안에서만 밀어야 한다 */
  assert.match(css, /#billModal \.bcols\{flex:1;min-height:0;overflow:hidden;\}/);
  // 표가 남은 높이를 전부 가져간다(300px 고정이면 아래가 남거나 모자란다)
  assert.match(css, /#billModal \.btwrap\{flex:1;min-height:0;max-height:none;\}/);
});

test('긴 설명은 ⓘ 로 접어 두되 지우지는 않는다', () => {
  /* 설명이 표보다 길어 화면을 밀어내고 있었다(대표 지시 2026-08-21
     「불필요한 한글 내용 모두 안 보이게 하고, 마우스 올렸을 때 팝업처럼」).
     ⚠ 지우면 안 된다 — 「0 과 —는 다르다」는 한 번은 읽어야 한다.
     ⚠ 이제 «폰에서만» 이 아니라 넓은 화면에서도 접는다. */
  assert.match(enterHtml, /#billModal \.bd>\.foot,\s*[\r\n]+#billModal \.blegend\{display:none;\}/,
    '★ 설명 둘은 폰 블록이 아니라 «기본 규칙»에서 접혀 있어야 한다');

  /* ★ 접었으면 «펼 길»이 반드시 있어야 한다 — 없으면 그냥 지운 것과 같다.
     PC 는 올려서(hover), 폰·키보드는 눌러서(bhelp-on) 편다. */
  assert.match(enterHtml, /#billModal \.bhelp:hover \+ \.btip/,
    '★ 마우스를 올려도 안 뜨면 접은 게 아니라 지운 것이다');
  assert.match(enterHtml, /#billModal \.box\.bhelp-on \.btip\{display:block;\}/,
    '★ 폰에는 마우스가 없다 — 눌러서도 펴져야 한다');
  assert.match(enterHtml, /\.bhelp:focus-visible \+ \.btip/, '키보드로도 닿아야 한다');

  /* ★ 글이 실제로 남아 있는가 — 「0 이 아니라 모른다」가 이 설명의 핵심이다 */
  const at = enterHtml.indexOf('id="billTip"');
  assert.ok(at > 0, '말풍선을 찾지 못했습니다');
  const tip = enterHtml.slice(at, at + 1200);
  assert.match(tip, /모른다/, '★ 「0 원이 아니라 모른다」는 지우면 안 된다');
  assert.match(tip, /금액이 움직일 때만/, '밤에 조용한 것이 정상이라는 안내도 남긴다');
  assert.match(enterHtml, /id="billHelpBtn"/);
  assert.match(enterHtml, /box\.classList\.toggle\('bhelp-on'\)/);

  /* ⚠ .memo 는 «조건부 경고»라 넓은 화면에서는 감추지 않는다 — 지금 숫자가 어긋나
     있다는 말이다. 다만 폰에서는 자리가 없어 ⓘ 로 접는다(!important 가 있어야 이긴다). */
  const css = billPhoneCss();
  assert.match(css, /#billModal \.memo\{display:none!important;\}/,
    '★ !important 가 없으면 칸에 직접 적힌 display:block 에 집니다');
  assert.match(css, /\.box\.bhelp-on \.memo\{display:block!important;\}/);
  // 금액과 「몇 분 전」은 한 줄에 — 두 줄 쓸 값이 아니다
  assert.match(css, /#billModal \.big\{display:inline;/);
  assert.match(css, /#billModal \.when\{display:inline;/);
});

test('ⓘ 는 이제 «어느 화면에서나» 보인다', () => {
  /* 전에는 폰에서만 보였다 — 넓은 화면은 설명이 늘 펼쳐져 있어 접을 것이 없었으니까.
     이제 넓은 화면에서도 접으므로 펼 단추가 늘 있어야 한다. 숨기면 닿을 길이 사라진다. */
  assert.doesNotMatch(enterHtml, /#billModal \.bhelp\{display:none;\}/,
    '★ ⓘ 를 숨기면 접어 둔 설명에 닿을 길이 없어진다');
  assert.match(enterHtml, /#billModal \.bhelp\{display:inline-flex;/);
});

/* ── 날짜를 눌러 그 날 시간별로 (대표 지시 2026-08-21) ──
   일별은 「어느 날 많이 썼나」까지만 말해 준다. 「그날 몇 시에 튀었나」는 파고들어야 보인다. */
test('★ 일별 줄을 누르면 그 날 시간별로 파고든다', () => {
  assert.match(enterHtml, /class="dayclick" data-day="' \+ r\.day \+ '"/,
    '★ 일별 줄에 날짜를 실어야 어느 날로 파고들지 알 수 있다');
  assert.match(enterHtml, /closest\('tr\.dayclick'\)/, '줄은 다시 그려지므로 위임으로 받는다');
  assert.match(enterHtml, /#billModal tr\.dayclick\{cursor:pointer;\}/, '누를 수 있다는 것이 보여야 한다');
  assert.match(enterHtml, /tr\.dayclick td:first-child::after\{content:' ›'/);
});

test('★ 파고든 뒤 돌아올 길이 있다', () => {
  assert.match(enterHtml, /id="billBackBtn"/);
  assert.match(enterHtml, /\$\('billBackBtn'\)\.addEventListener\('click', function\(\)\{ _billDay = ''; billPaintHist\(\); \}\)/,
    '★ 돌아가면 파고든 날을 비워야 일별 표가 다시 나온다');
  assert.match(enterHtml, /back\.style\.display = _billDay \? 'inline-block' : 'none'/,
    '파고들지 않았으면 「← 일별로」는 안 보인다');
});

test('★ 파고든 날은 시간별 거르기에도 걸린다 — 안 걸면 온 달이 다 나온다', () => {
  assert.match(enterHtml, /if\(_billDay\) return hour\.slice\(0,10\) === _billDay;/);
  /* 기간(오늘·어제·이번 달·일별)을 다시 고르면 파고든 날에서 나와야 한다 —
     안 나오면 「오늘」을 눌러도 지난 날이 그대로 보인다. */
  assert.match(enterHtml, /_billDay = '';\s*\/\/ 기간을 바꾸면/);
});

test('어느 날을 보고 있는지 제목과 합계에 적는다', () => {
  /* 안 적으면 「오늘」과 구별이 안 돼 엉뚱한 날을 보고 판단한다. */
  assert.match(enterHtml, /ttl\.textContent = '🕘 ' \+ _billDay\.slice\(5\)/);
  assert.match(enterHtml, /_billDay\.slice\(5\)\.replace\('-', '\/'\) \+ ' 합계'/);
});

test('키보드로도 파고들 수 있다', () => {
  assert.match(enterHtml, /tabindex="0" role="button"/);
  assert.match(enterHtml, /if\(e\.key !== 'Enter' && e\.key !== ' '\) return;/);
});

/* ── 일별 정산금액 (대표 지시 2026-08-20 「일별 정산금액도 표시해줘」) ──
   시간별은 「언제 튀었나」를 보는 눈, 일별은 「어느 날 많이 썼나」를 보는 눈이다. */
const KST = 540;
function ts(d, h) { return Date.UTC(2026, 7, d, h - 9); }   // 한국시각 → ms

test('★ 날 증가분의 합 = 누적액의 차 (소식 없는 시간이 사이에 껴도)', () => {
  /* 증가분은 «앞서 알던 값과의 차이» 라 이어 붙으면 telescoping 으로
     「마지막으로 아는 값 − 처음 아는 값」이 된다. 여기서 값이 새면
     하루치가 통째로 사라지거나 두 번 잡힌다. */
  const hist = { total: {}, database: {}, storage: {}, functions: {} };
  const put = (k, d, h, v) => { hist[k][ts(d, h)] = v; };
  put('total', 18, 0, 1000); put('database', 18, 0, 800);
  put('total', 18, 12, 1300); put('database', 18, 12, 1000);
  /* 18일 12시 ~ 19일 9시 = 소식 없음 */
  put('total', 19, 9, 2000); put('database', 19, 9, 1500);
  put('total', 20, 3, 2450); put('database', 20, 3, 1720);

  const days = B.dayBuckets(B.hourBuckets(hist, { tz: KST }));
  assert.strictEqual(days.length, 3);
  const sum = days.filter(d => d.known.total).reduce((s, d) => s + d.total, 0);
  assert.strictEqual(sum, 2450 - 1000, '날 증가분 합이 누적 차와 어긋납니다');
  /* 소식이 19일에 왔으면 그 늘어난 값은 19일 몫이다 — 18일로 흘리지 않는다 */
  assert.strictEqual(days[1].day.slice(5), '08-19');
  assert.strictEqual(days[1].total, 700);
});

test('★ 아는 칸이 없는 날은 0 이 아니라 「모른다」', () => {
  /* 0 은 「그 날 공짜였다」로 읽힌다. 첫날은 견줄 앞 값이 없어 늘 모른다. */
  const hist = { total: {}, database: {}, storage: {}, functions: {} };
  hist.total[ts(18, 5)] = 500;
  const days = B.dayBuckets(B.hourBuckets(hist, { tz: KST }));
  assert.strictEqual(days.length, 1);
  assert.strictEqual(days[0].known.total, false, '첫날 증가분을 안다고 하면 안 됩니다');
  /* 누적액은 쪽지 하나로 알 수 있다 — 증가분과 «다른 것» 이다 */
  assert.strictEqual(days[0].cumKnown, true);
  assert.strictEqual(days[0].cum, 500);
});

test('그 날 「전체」는 그 날 마지막으로 아는 누적액이다', () => {
  const hist = { total: {}, database: {}, storage: {}, functions: {} };
  hist.total[ts(18, 1)] = 100; hist.total[ts(18, 9)] = 300; hist.total[ts(18, 23)] = 700;
  const days = B.dayBuckets(B.hourBuckets(hist, { tz: KST }));
  assert.strictEqual(days[0].cum, 700);
});

test('항목별(창고·DB·서버·그 밖)도 날마다 따로 센다', () => {
  const hist = { total: {}, database: {}, storage: {}, functions: {} };
  const put = (k, d, h, v) => { hist[k][ts(d, h)] = v; };
  put('total', 18, 0, 100); put('storage', 18, 0, 10); put('database', 18, 0, 90);
  put('total', 18, 12, 160); put('storage', 18, 12, 30); put('database', 18, 12, 110);
  const d0 = B.dayBuckets(B.hourBuckets(hist, { tz: KST }))[0];
  assert.strictEqual(d0.parts.storage, 20);
  assert.strictEqual(d0.parts.database, 20);
  /* 그 밖 = 전체 − 쪼갠 것 합 = 60 − 40 */
  assert.strictEqual(d0.parts.etc, 20);
});

test('화면: 「일별」 칸이 있고, 기간 칩만 기간을 바꾼다', () => {
  const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
  assert.match(enter, /data-span="day"/, '일별 칩이 없습니다.');
  /* ★ ⓘ 도 .bchip 이라 예전에는 이 고리에 걸려, 누르면 기간이 undefined 가 되고
     className 을 통째로 갈아 끼우며 bhelp class 까지 지워졌다(2026-08-20 발견). */
  assert.match(enter, /querySelectorAll\('\.bchip\[data-span\]'\)/,
    '★ data-span 으로 좁히지 않으면 ⓘ 를 눌러도 기간이 바뀝니다.');
  assert.doesNotMatch(enter, /o\.className = 'bchip' \+ \(o === b \? ' on' : ''\)/,
    '★ className 을 통째로 갈아 끼우면 bhelp 같은 다른 class 를 잃습니다.');
  /* 날 칸이면 머리와 제목도 함께 바뀐다 — 「시각」이라 적힌 칸에 날짜가 있으면 안 된다 */
  assert.match(enter, /th1\.textContent = '날짜'/);
  assert.match(enter, /ttl\.textContent = '📅 일별 기록'/);
});

/* ══ 합계 줄 (대표 지시 2026-08-20 「일별 토탈금액 볼 수 있게 해달라 폰과 피시에서」) ══
   줄마다 얼마인지는 보였는데 «다 해서 얼마인지» 를 볼 데가 없었다 — 눈으로 더하고
   계셨다는 뜻이다. 여기서 지키는 것은 「합계가 줄들과 어긋나지 않는가」 하나다. */

test('★ 합계 = 줄들의 합이다 (하나라도 빠지면 눈으로 더한 값과 어긋난다)', () => {
  const hist = { total: {}, database: {}, storage: {}, functions: {} };
  const put = (k, d, h, v) => { hist[k][ts(d, h)] = v; };
  put('total', 18, 0, 1000); put('database', 18, 0, 800);
  put('total', 18, 12, 1300); put('database', 18, 12, 1000);
  put('total', 19, 9, 2000); put('database', 19, 9, 1500);
  put('total', 20, 3, 2450); put('database', 20, 3, 1720);
  const days = B.dayBuckets(B.hourBuckets(hist, { tz: KST }));
  const sum = B.sumBuckets(days);
  const byHand = days.reduce((a, d) => a + d.total, 0);
  assert.strictEqual(sum.total, byHand);
  assert.strictEqual(sum.parts.database, days.reduce((a, d) => a + d.parts.database, 0));
  /* 시간 칸을 그대로 넘겨도 같은 값이어야 한다 — 날로 묶고 안 묶고가 합계를 바꾸면 안 된다 */
  assert.strictEqual(B.sumBuckets(B.hourBuckets(hist, { tz: KST })).total, byHand);
});

test('★ 합계의 「전체」는 마지막으로 아는 누적액이다 — 누적을 더하지 않는다', () => {
  /* 누적끼리 더하면 아무 뜻도 없는 수가 나오는데, 그런 수일수록 그럴듯해 보인다. */
  const hist = { total: {}, database: {}, storage: {}, functions: {} };
  hist.total[ts(18, 0)] = 1000; hist.total[ts(19, 0)] = 1500; hist.total[ts(20, 0)] = 2450;
  const days = B.dayBuckets(B.hourBuckets(hist, { tz: KST }));
  assert.strictEqual(B.sumBuckets(days).cum, 2450);
  /* 최근 날이 위로 오게 뒤집어 그리므로, 줄 차례가 거꾸로여도 같아야 한다 */
  assert.strictEqual(B.sumBuckets(days.slice().reverse()).cum, 2450);
});

test('★ 모르는 칸은 0 으로 치지 않고, 섞였다는 사실을 남긴다', () => {
  /* 모르는 것을 0 으로 치면 「그때 안 썼다」는 거짓말이 되고, 합계에서는 눈에 띄지도 않는다. */
  const rows = [
    { hour: '2026-08-18T00', total: 100, cum: 100, cumKnown: true,
      parts: { storage: 10, database: 90, functions: 0, etc: 0 },
      known: { total: true, storage: true, database: true, functions: false, etc: false } },
    { hour: '2026-08-18T01', total: null, cum: null, cumKnown: false,
      parts: {}, known: { total: false } },
  ];
  const t = B.sumBuckets(rows);
  assert.strictEqual(t.total, 100);
  assert.ok(t.unknownRows >= 1, '모르는 줄이 섞였다는 사실을 남겨야 화면이 ≈ 를 붙일 수 있습니다');
  assert.strictEqual(t.known.functions, false, '한 줄도 모르는 항목은 «모른다» 로 남아야 합니다');
});

test('화면: 합계 줄이 두 표(시간별·일별) 모두에 붙고, 스크롤해도 보인다', () => {
  const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
  /* 줄이 서른 개면 합계는 늘 화면 밖이고, 화면 밖에 있는 숫자는 없는 숫자다.
     ⚠ 붙이기(sticky)를 tr 에 걸면 브라우저에 따라 먹지 않는다 — td 에 건다. */
  assert.match(enter, /tr\.sumrow td\{[^}]*position:sticky/,
    '★ 합계 줄을 td 에 붙여 두지 않으면 스크롤하는 순간 사라집니다.');
  assert.match(enter, /tr\.sumrow td\{[^}]*bottom:0/);
  /* 기간을 바꿨다고 합계가 사라지면 그게 더 이상하다 — 네 칩 모두 이름이 있어야 한다 */
  const fn = enter.slice(enter.indexOf('function billPaintHist()'),
                         enter.indexOf('function billOpen()'));
  assert.ok((fn.match(/billSumRow\(/g) || []).length >= 2,
    '★ 일별에만 붙이면 「이번 달」로 옮기는 순간 합계가 사라집니다.');
  assert.match(fn, /billSumRow\(days,/, '일별 표에 합계가 없습니다.');
});
