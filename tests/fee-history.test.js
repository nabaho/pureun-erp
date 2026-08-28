/* 자문료 이력 — 「그 달」 자문료로 셈한다 (김보람 과장 건의 2026-08-28, 다안)

   ★ 왜
     자동이체를 익월·익익월 말일로 걸어 둔 곳은, 늦게 들어온 돈이 «옛 금액» 이다.
     칸토덴카화인프로덕츠: 2025-12 까지 275,000 → 2026-01 부터 440,000 인데
     2026-02-03 에 들어온 돈은 12월분 275,000 이었다.

   ★ 지키려는 것
     ① 그 달에 약속된 금액을 돌려준다 (경계 달 포함)
     ② 이력이 없으면 예전과 똑같다 — 안 적어 둔 업체가 안 깨진다
     ③ 아직 시작 안 한 요율을 미리 쓰지 않는다
     ④ 적어 둔 것보다 옛날 달은 «가장 오래된 요율» (지금 요율보다 사실에 가깝다)
     ⑤ 적는 차례가 뒤죽박죽이어도 맞는다
     ⑥ 이상한 값이 들어와도 안 죽는다 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').split('\r\n').join('\n');

const box = { console, Math, String, Number, Object, parseInt, Array };
box.window = box;
vm.createContext(box);
vm.runInContext(cutFn(src, 'function erpFeeForMonth') + '\n' +
                cutFn(src, 'function erpFeeHistorySort') + '\n' +
                ';this.feeFor = erpFeeForMonth; this.sortH = erpFeeHistorySort;', box);
const feeFor = box.feeFor, sortH = box.sortH;

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

/* 칸토덴카 — 실제 사례 */
const KANTO = {
  name: '칸토덴카화인프로덕츠',
  monthlyAdvisoryFee: 440000,
  feeHistory: [{ from: '2024-03', fee: 275000 }, { from: '2026-01', fee: 440000 }]
};

console.log('[① 그 달에 약속된 금액]');
ok('2025-12 → 275,000 (인상 전)', feeFor(KANTO, '2025-12') === 275000, '나온 값: ' + feeFor(KANTO, '2025-12'));
ok('2026-01 → 440,000 (바뀌는 그 달부터 새 금액)', feeFor(KANTO, '2026-01') === 440000, '나온 값: ' + feeFor(KANTO, '2026-01'));
ok('2026-08 → 440,000 (그 뒤로 계속)', feeFor(KANTO, '2026-08') === 440000);
ok('2024-03 → 275,000 (첫 요율 그 달부터)', feeFor(KANTO, '2024-03') === 275000);
ok('날짜를 통째로 줘도 달만 본다', feeFor(KANTO, '2025-12-31') === 275000, '나온 값: ' + feeFor(KANTO, '2025-12-31'));

console.log('\n[② 이력이 없으면 예전과 똑같다]');
const PLAIN = { name: '알산정밀', monthlyAdvisoryFee: 330000 };
ok('이력 없음 → 지금 자문료', feeFor(PLAIN, '2025-12') === 330000);
ok('빈 이력 → 지금 자문료', feeFor({ monthlyAdvisoryFee: 330000, feeHistory: [] }, '2025-12') === 330000);
ok('달을 안 주면 지금 자문료', feeFor(KANTO, '') === 440000);
ok('fee 라는 이름으로 들고 있어도 읽는다', feeFor({ fee: 220000 }, '2025-12') === 220000,
   '매칭 창 쪽 업체는 fee 로 들고 있다');

console.log('\n[③ 아직 시작 안 한 요율은 안 쓴다]');
ok('2025-11 에 2026-01 요율을 미리 쓰지 않는다', feeFor(KANTO, '2025-11') === 275000);

console.log('\n[④ 적어 둔 것보다 옛날 달]');
ok('2023-01 → 가장 오래된 275,000 (지금 요율 440,000 이 아니라)',
   feeFor(KANTO, '2023-01') === 275000, '나온 값: ' + feeFor(KANTO, '2023-01'));

console.log('\n[⑤ 차례가 뒤죽박죽이어도]');
const MIXED = { monthlyAdvisoryFee: 500000,
  feeHistory: [{ from: '2026-01', fee: 440000 }, { from: '2024-03', fee: 275000 }, { from: '2025-01', fee: 300000 }] };
ok('2024-06 → 275,000', feeFor(MIXED, '2024-06') === 275000, '나온 값: ' + feeFor(MIXED, '2024-06'));
ok('2025-06 → 300,000', feeFor(MIXED, '2025-06') === 300000, '나온 값: ' + feeFor(MIXED, '2025-06'));
ok('2026-06 → 440,000', feeFor(MIXED, '2026-06') === 440000, '나온 값: ' + feeFor(MIXED, '2026-06'));
ok('정렬은 시작월 오름차순', sortH(MIXED.feeHistory).map(function (x) { return x.from; }).join(',') === '2024-03,2025-01,2026-01');

console.log('\n[⑥ 이상한 값이 들어와도]');
ok('업체가 없으면 0', feeFor(null, '2025-12') === 0);
ok('빈 줄이 섞여도 안 죽는다',
   feeFor({ monthlyAdvisoryFee: 100000, feeHistory: [null, { from: '', fee: 5 }, { from: '2024-01', fee: 200000 }] }, '2025-01') === 200000);
ok('금액이 글자여도 숫자로 읽는다',
   feeFor({ monthlyAdvisoryFee: 0, feeHistory: [{ from: '2024-01', fee: '275000' }] }, '2025-01') === 275000);
ok('정렬에 빈 값을 줘도 안 죽는다', sortH(null).length === 0 && sortH([null]).length === 1);

console.log('\n[⑦ 화면에 붙어 있다]');
const SRC = src;
ok('매칭 창이 「그 달」 자문료를 쓴다', /erpFeeForMonth\(c, ym\)/.test(SRC),
   '안 쓰면 실데이터 없는 달에 지금 자문료가 다시 들어간다');
ok('업체관리에 이력 적는 칸이 있다', /자문료가 바뀐 이력/.test(SRC));
ok('저장 목록에 feeHistory 가 들어 있다', /'monthlyAdvisoryFee','feeHistory'/.test(SRC),
   '빠뜨리면 적어도 저장이 안 돼 「안 먹는」 것처럼 보인다');

console.log('\n[⑧ 자동 생성도 「그 달」 금액으로]');
/* 한 해치를 한꺼번에 만들 때가 가장 크게 어긋났다 — 지난 달까지 «지금» 자문료로 만들었다 */
ok('업체 목록에 이력이 실려 온다', /feeHistory:c\.feeHistory \|\| null/.test(SRC),
   '안 실으면 그 달 금액을 알 길이 없다');
/* 자문료 입금을 만드는 길이 다섯이다 — 이번 달·한 해치·한 달 전체·미납 여러 달·CMS 미납.
   ⚠ 이 검사가 실제로 «내가 두 곳만 고친 것»을 잡아냈다. 다섯을 함께 센다. */
const gen = (SRC.match(/amount:\(erpFeeForMonth\(co, ym\)/g) || []).length;
ok('자문료 입금을 만드는 다섯 길 모두 그 달 금액을 쓴다', gen === 5,
   '지금 ' + gen + '곳 — 하나라도 빠지면 그 길로 만든 것만 다시 어긋난다');
ok('옛 방식(amount:co.fee)으로 만드는 곳이 없다',
   !/calcDate\(ym, ?co\.payDay\), amount:co\.fee/.test(SRC),
   '한 곳이라도 남으면 그 길로 만든 것만 다시 어긋난다');
ok('미납 여러 달 확인창도 달별로 더한다',
   /unpaid\.reduce\(function\(t,m\)\{ return t \+ \(erpFeeForMonth\(co,/.test(SRC),
   '한 금액 × 개월수로 어림하면 확인창과 실제가 또 갈린다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
