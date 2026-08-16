/* 입금확정 — 분할 %는 「남는 쪽이 저절로」 채워진다 (2026-08-16 대표 지시)
   대표 지시: "부담당 또는 주담당의 %를 바꿀경우 100%에서 나머지 금액은
   자동으로 다른사람에게 배분되는 구조로 만들어 달라."

   ★ 이 검사가 지키는 것은 «합계는 언제나 100» 이라는 규칙이다.
     어느 칸을 고쳐도 사람이 나머지를 손으로 맞출 일이 없어야 한다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 셈하는 부분만 잘라 내어 «실제로 굴려» 본다 — 글자만 보면 셈이 틀려도 통과한다 */
const _s = SRC.indexOf('function _pctRound(');
const _e = SRC.indexOf('// ★ 요율 override 헬퍼', _s);
assert.ok(_s > 0 && _e > _s, '분할 % 자동 배분 코드를 찾지 못했다');
const CODE = SRC.slice(_s, _e);

// subSids / subPctMap / setM 을 갈아 끼워 결과만 받아 본다
function run(subSids, subPctMap, act) {
  const box = { patch: null };
  const ctx = {
    subSids: subSids,
    subPctMap: subPctMap,
    Object: Object,
    Math: Math,
    parseFloat: parseFloat,
    isNaN: isNaN,
    setM: function (o) { box.patch = Object.assign({}, box.patch || {}, o); }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE + '\n;__act(setMainPct, setSubPct);', Object.assign(ctx, {
    __act: function (setMainPct, setSubPct) { act(setMainPct, setSubPct); }
  }));
  const p = box.patch || {};
  const main = p.mainPct != null ? p.mainPct : null;
  const subs = p.subPctMap != null ? p.subPctMap : subPctMap;
  let total = main || 0;
  subSids.forEach(function (s) { total += parseFloat(subs[s]) || 0; });
  return { main: main, subs: subs, total: Math.round(total * 10) / 10 };
}

test('주담당을 고치면 나머지가 부담당에게 간다', () => {
  const r = run(['B'], { B: 0 }, (setMain) => setMain(70));
  assert.strictEqual(r.main, 70);
  assert.strictEqual(r.subs.B, 30);
  assert.strictEqual(r.total, 100);
});

test('부담당을 고치면 나머지가 주담당에게 간다', () => {
  const r = run(['B'], { B: 0 }, (_m, setSub) => setSub('B', 15));
  assert.strictEqual(r.subs.B, 15);
  assert.strictEqual(r.main, 85);
  assert.strictEqual(r.total, 100);
});

test('부담당이 여럿이면 주담당의 나머지를 똑같이 나눈다', () => {
  const r = run(['B', 'C'], { B: 0, C: 0 }, (setMain) => setMain(60));
  assert.strictEqual(r.subs.B, 20);
  assert.strictEqual(r.subs.C, 20);
  assert.strictEqual(r.total, 100);
});

test('나누어떨어지지 않아도 합계는 정확히 100 이다', () => {
  /* 50 을 셋이 나누면 16.666… 이다. 반올림만 하면 합계가 100 에서 어긋나
     「100%가 되어야 함」 이 뜬 채로 확정이 막힌다 — 자동인데 막히면 더 나쁘다. */
  const r = run(['B', 'C', 'D'], { B: 0, C: 0, D: 0 }, (setMain) => setMain(50));
  assert.strictEqual(r.total, 100);
});

test('한 부담당을 고쳐도 다른 부담당 몫은 그대로다', () => {
  /* 방금 손대지 않은 사람의 몫이 저 혼자 움직이면 사람이 화면을 믿지 못한다 */
  const r = run(['B', 'C'], { B: 20, C: 30 }, (_m, setSub) => setSub('B', 40));
  assert.strictEqual(r.subs.B, 40);
  assert.strictEqual(r.subs.C, 30);
  assert.strictEqual(r.main, 30);
  assert.strictEqual(r.total, 100);
});

test('100 을 넘겨 적으면 100 까지만 받는다', () => {
  const r = run(['B'], { B: 0 }, (setMain) => setMain(180));
  assert.strictEqual(r.main, 100);
  assert.strictEqual(r.subs.B, 0);
  assert.strictEqual(r.total, 100);
});

test('빼기 값을 적으면 0 으로 본다', () => {
  const r = run(['B'], { B: 0 }, (_m, setSub) => setSub('B', -30));
  assert.strictEqual(r.subs.B, 0);
  assert.strictEqual(r.main, 100);
  assert.strictEqual(r.total, 100);
});

test('칸을 비우면 0 으로 본다 (합계는 그래도 100)', () => {
  const r = run(['B'], { B: 40 }, (_m, setSub) => setSub('B', ''));
  assert.strictEqual(r.subs.B, 0);
  assert.strictEqual(r.main, 100);
  assert.strictEqual(r.total, 100);
});

test('다른 부담당이 이미 다 가져갔으면 남은 만큼만 준다', () => {
  /* 넘치게 적어도 주담당이 «마이너스» 가 되면 안 된다 */
  const r = run(['B', 'C'], { B: 0, C: 70 }, (_m, setSub) => setSub('B', 90));
  assert.strictEqual(r.subs.B, 30);
  assert.strictEqual(r.subs.C, 70);
  assert.strictEqual(r.main, 0);
  assert.strictEqual(r.total, 100);
});

test('부담당이 없으면 주담당이 100 을 지킨다', () => {
  const r = run([], {}, (setMain) => setMain(40));
  assert.strictEqual(r.main, 100);
  assert.strictEqual(r.total, 100);
});

/* ── 화면과 실제로 이어져 있는지 ── */
const _ms = SRC.indexOf("'⭐ 성과급 — 확정하면 이렇게 나뉩니다'");
const _me = SRC.indexOf("'분배 합계'", _ms);
const MODAL = SRC.slice(_ms, _me);

test('분할 % 칸 두 곳이 자동 배분을 거쳐 간다', () => {
  /* 셈만 옳고 칸이 옛 길로 이어져 있으면 화면에서는 아무 일도 안 일어난다 */
  const hits = MODAL.match(/onChange:function\(e\)\{set(Main|Sub)Pct\(/g) || [];
  assert.strictEqual(hits.length, 2, '주담당·부담당 분할 % 칸이 모두 이어져야 한다');
});

test('분할 % 를 자동 배분을 건너뛰고 바로 넣는 길은 없다', () => {
  assert.strictEqual(/setM\(\{\s*mainPct\s*:\s*parseFloat/.test(MODAL), false);
});

test('저절로 채워진다는 것을 화면이 미리 말해 준다', () => {
  /* 알려 주지 않으면 사람이 나머지 칸을 손으로 맞추려다 서로 밀어낸다 */
  assert.strictEqual(/자동으로 채워집니다/.test(MODAL), true);
});
