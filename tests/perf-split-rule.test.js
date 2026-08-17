/* 입금확정 분할 % 기본값 규칙 (2026-08-16 대표 지시)
   - 요율 0%인 사람은 분할에서 자동으로 빠진다
   - 둘 다 대상자면 기본 주 50 / 부 50 (환경설정에서 변경)
   ★ 글자만 보지 말고 «실제로 돌려» 본다 — 글자만 보면 셈이 틀려도 통과한다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

function cut(from, to) {
  const s = SRC.indexOf(from);
  assert.ok(s > 0, '코드를 찾지 못했다: ' + from);
  const e = SRC.indexOf(to, s);
  assert.ok(e > s, '끝을 찾지 못했다: ' + to);
  return SRC.slice(s, e);
}

const CODE = cut('function erpPerfMainPct(', '// 푸른노무법인 직인');

/* 요율을 흉내 낸 calcPerfShares 를 끼워 넣는다.
   여기서 보는 것은 「누가 대상인지 어떻게 알아내는가」가 아니라 「알아낸 뒤 어떻게 나누는가」다. */
function run(opts) {
  const rates = opts.rates;
  const policy = opts.policy || {};
  const ctx = {
    Object, Math, String, Array, isNaN, parseFloat,
    window: {},
    dbGet: function (k, d) { return k === 'policy_perf' ? policy : d; },
    calcPerfShares: function (amount, mainSid, subSids, kind, mainPct, o) {
      const out = [];
      const subs = (subSids || []).filter(Boolean);
      const each = subs.length ? (100 - mainPct) / subs.length : 0;
      out.push({ sid: mainSid, role: '주담당',
        amount: Math.round(amount * mainPct / 100 * (rates[mainSid] || 0) / 100) });
      subs.forEach(function (s) {
        out.push({ sid: s, role: '부담당',
          amount: Math.round(amount * each / 100 * (rates[s] || 0) / 100) });
      });
      return out;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE + '\n;__r = erpDefaultSplit(__main, __subs, "2026-05-27");',
    Object.assign(ctx, { __main: opts.main, __subs: opts.subs || [], __r: null }));
  const r = ctx.__r;
  let total = r.mainPct;
  (opts.subs || []).forEach(function (s) { total += r.subPctMap[s] || 0; });
  r.total = Math.round(total * 10) / 10;
  return r;
}

test('요율 0%인 주담당은 빠지고 부담당이 100%를 받는다', () => {
  const r = run({ main: 'A', subs: ['B'], rates: { A: 0, B: 15 } });
  assert.strictEqual(r.mainPct, 0);
  assert.strictEqual(r.subPctMap.B, 100);
  assert.strictEqual(r.total, 100);
  // vm 안에서 만든 배열이라 deepStrictEqual 은 realm 이 달라 걸린다 — 값으로 본다
  assert.strictEqual(Array.from(r.excluded).join(','), 'A');
});

test('둘 다 대상자면 설정값대로 나뉜다', () => {
  const r = run({ main: 'A', subs: ['B'], rates: { A: 15, B: 10 }, policy: { confirmMainPct: 50 } });
  assert.strictEqual(r.mainPct, 50);
  assert.strictEqual(r.subPctMap.B, 50);
  assert.strictEqual(r.total, 100);
});

test('설정값을 바꾸면 결과가 따라 바뀐다', () => {
  /* 50 이라는 숫자를 박지 않는다 — 지킬 것은 「설정을 따른다」는 규칙이다 */
  const r = run({ main: 'A', subs: ['B'], rates: { A: 15, B: 10 }, policy: { confirmMainPct: 70 } });
  assert.strictEqual(r.mainPct, 70);
  assert.strictEqual(r.subPctMap.B, 30);
  assert.strictEqual(r.total, 100);
});

test('부담당이 여럿이면 부담당 몫을 똑같이 나눈다', () => {
  const r = run({ main: 'A', subs: ['B', 'C'], rates: { A: 15, B: 10, C: 15 }, policy: { confirmMainPct: 50 } });
  assert.strictEqual(r.subPctMap.B, 25);
  assert.strictEqual(r.subPctMap.C, 25);
  assert.strictEqual(r.total, 100);
});

test('나누어떨어지지 않아도 합계는 정확히 100 이다', () => {
  /* 100 을 셋이 나누면 33.333… 이다. 어긋나면 「100%가 되어야 함」이 뜬 채 확정이 막힌다 */
  const r = run({ main: 'A', subs: ['B', 'C', 'D'], rates: { A: 0, B: 15, C: 15, D: 15 } });
  assert.strictEqual(r.total, 100);
});

test('대상자가 주담당 하나뿐이면 100%', () => {
  const r = run({ main: 'A', subs: ['B'], rates: { A: 15, B: 0 } });
  assert.strictEqual(r.mainPct, 100);
  assert.strictEqual(r.subPctMap.B, 0);
  assert.strictEqual(r.total, 100);
});

test('아무도 대상이 아니면 전부 0 (화면이 막는다)', () => {
  const r = run({ main: 'A', subs: ['B'], rates: { A: 0, B: 0 } });
  assert.strictEqual(r.mainPct, 0);
  assert.strictEqual(r.subPctMap.B, 0);
  assert.strictEqual(r.eligible, 0);
});

test('부담당이 아예 없으면 주담당 100%', () => {
  const r = run({ main: 'A', subs: [], rates: { A: 15 } });
  assert.strictEqual(r.mainPct, 100);
});

test('대상 여부를 스스로 판정하지 않고 calcPerfShares 에게 묻는다', () => {
  /* ★ 수습·퇴사·요율 판정을 베껴 오면 언젠가 조용히 어긋난다.
     실제로 어긋나 본 적이 있다 — 업무관리와 푸른이알피가 열쇠를 따로 만들어
     배지가 6건 중 5건을 「반영 대기」로 거짓말했다(2026-08-16). */
  const src = cut('function erpPerfEligibleSet(', 'function erpDefaultSplit(');
  assert.strictEqual(/calcPerfShares\s*\(/.test(src), true);
  assert.strictEqual(/isProbationary|retireDate|getRateAt/.test(src), false);
});

/* ── 창이 열릴 때 ── */
const PEND = cut('function IncomePendingTab(', 'function IncomeListTab(');

test('창을 여는 곳이 모두 같은 함수를 거친다', () => {
  /* ★ 한 곳이라도 빠뜨리면 그 길로 연 창만 옛 기본값(주담당 100%)으로 열린다 */
  const bare = PEND.match(/setConfirmModal\(\{/g) || [];
  const wrapped = PEND.match(/setConfirmModal\(erpConfirmInit\(/g) || [];
  assert.strictEqual(bare.length, 0, '감싸지 않은 setConfirmModal({ 이 남아 있다');
  assert.ok(wrapped.length >= 3, '창을 여는 곳 3군데가 모두 감싸져야 한다 (지금 ' + wrapped.length + ')');
});

test('나눌 사람이 둘 이상이면 나누기가 켜진 채로 열린다', () => {
  /* 꺼진 채 열리면 정한 기본 분할이 적용되지 않아 무의미해진다 */
  const at = PEND.indexOf('function erpConfirmInit(');
  assert.ok(at > 0, 'erpConfirmInit 을 찾지 못했다');
  const init = PEND.slice(at, at + 900);
  assert.strictEqual(/erpDefaultSplit\(/.test(init), true);
  assert.strictEqual(/eligible\s*>\s*1/.test(init), true);
});

test('자동확정도 같은 기본 분할을 쓴다', () => {
  /* ★ 여기가 빠지면 「통장에서 자동으로 확정된 건」만 옛 규칙으로 남는다 —
     같은 건인데 어느 길로 확정했느냐에 따라 성과급이 달라진다 */
  const auto = cut('if(opts.withPerf && !isAdv){', '// 개인수익·원천징수분은');
  assert.strictEqual(/erpDefaultSplit\(/.test(auto), true);
  assert.strictEqual(/calcPerfShares\([\s\S]*?undefined/.test(auto), false, '옛 기본값(undefined=주담당 100%)이 남아 있다');
});

/* ── 환경설정 ── */
const POLICY = cut('function PerformancePolicySection(', 'function VatPolicySection(');

test('입금확정 기본 분할 칸이 있다', () => {
  assert.strictEqual(/confirmMainPct/.test(POLICY), true);
  assert.strictEqual(/입금확정 기본 분할/.test(POLICY), true);
});

test('기본값이 새 설정에도 들어간다', () => {
  /* DEFAULT 에 없으면 처음 여는 사람에게만 칸이 비어 보인다 */
  const at = POLICY.indexOf('var DEFAULT');
  const def = POLICY.slice(at, POLICY.indexOf('\n', at));
  assert.strictEqual(/confirmMainPct/.test(def), true);
});

test('돌려도 아무 일이 안 일어나는 손잡이를 두지 않는다', () => {
  /* ★ 「부담당 성과 비율」(subRatio)은 법인 대시보드 카드 한 곳만 쓰던 어림값이었는데,
     그 카드가 실제 지급액(perfShares)을 읽게 되면서 쓰는 데가 없어졌다(2026-08-16).
     돌려 보고 안 바뀌면 사람은 화면 전체를 못 믿게 된다 — 그래서 칸을 없앴다.
     지킬 것은 「이 이름이 없다」가 아니라 «설정 칸에는 읽는 곳이 있다» 이다. */
  assert.strictEqual(/'부담당 성과 비율'/.test(POLICY), false, '읽는 곳이 없는 설정 칸이 남아 있다');
  /* ※ 주석은 걷어내고 «코드만» 센다 — 「왜 없앴는지」는 주석에 남아 있어야 하는데,
     글자만 찾으면 그 설명이 스스로를 걸고 넘어진다 (2026-08-16 에 실제로 그랬다). */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const readers = (code.match(/\.subRatio\b|\['subRatio'\]/g) || []);
  assert.strictEqual(readers.length, 0, 'subRatio 를 읽는 코드가 남아 있다: ' + readers.join(' / '));
});

test('남아 있는 설정 칸은 읽는 곳이 있다', () => {
  /* confirmMainPct 는 erpPerfMainPct() 가 읽는다 — 돌리면 실제로 결과가 바뀐다 */
  assert.strictEqual(/p\.confirmMainPct/.test(SRC), true);
});

test('설정값은 0~100 밖으로 나가지 않는다', () => {
  const hi = run({ main: 'A', subs: ['B'], rates: { A: 15, B: 10 }, policy: { confirmMainPct: 900 } });
  assert.strictEqual(hi.mainPct, 100);
  const lo = run({ main: 'A', subs: ['B'], rates: { A: 15, B: 10 }, policy: { confirmMainPct: -5 } });
  assert.strictEqual(lo.mainPct, 0);
});
