/* CMS 일괄이체 매칭 — 보여준 금액이 «그대로» 저장되는가 (김보람 과장 건의 2026-08-28)

   ★ 무슨 일이 있었나
     칸토덴카화인프로덕츠한국(주)는 자문료가 275,000 → 440,000 으로 올랐는데,
     자동이체가 «익월 말일»이라 2월에 들어온 돈은 12월분(275,000)이었다.
     매칭 창은 나이스빌 실데이터를 읽어 275,000 이라 «보여주고» 확인창에도 그렇게 적었다.
     그런데 저장하는 함수에 금액을 안 넘겨, 함수가 업체관리의 «지금 자문료»(440,000)를
     제 맘대로 꺼내 적었다. **보여준 것과 저장한 것이 달랐다.**
     칸토덴카만이 아니다 — 자문료가 바뀐 곳·일부만 들어온 곳이 모두 조용히 틀리게 적혔다.

   ★ 지키려는 것
     ① 금액을 주면 «그 금액»이 적힌다 (돈 문제라 규칙이 아니라 실제로 돌려서 본다)
     ② 금액을 안 주면 예전처럼 업체관리 자문료 — 다른 부르는 곳이 안 깨진다
     ③ 창이 화면·확인창·저장에 «같은 값»(effAmt)을 쓴다
     ④ 손으로 고친 값이 실데이터·자문료를 이긴다
     ⑤ 손으로 고쳤으면 적요에 자취가 남는다 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').split('\r\n').join('\n');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

/* ── 저장 함수를 실제로 돌려 본다 ───────────────────────────────── */
function runSave(amountArg) {
  const saved = [];
  const box = {
    console,
    Date, Math, String, Number, Object, parseInt, JSON,
    isIncomeLocked: function () { return false; },
    dbGet: function () { return []; },                 // 같은 업체+월 기록 없음
    dbUpsert: function (key, rec) { saved.push({ key: key, rec: rec }); return true; },
    showToast: function () {},
    window: {}
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(cutFn(src, 'function erpAddCompanyIncome') +
    '\n;this.__out = erpAddCompanyIncome(CO, 12, 2025, "2026-02-03", "메모", "자문료", AMT);', box);
  return { saved: saved, box: box };
}

const CO = { name: '칸토덴카화인프로덕츠한국(주)', fee: 440000, payDay: '말일', mainSid: 's1', mainName: '박재원' };

function amountWhenGiven(amt) {
  const saved = [];
  const box = {
    console, Date, Math, String, Number, Object, parseInt,
    isIncomeLocked: function () { return false; },
    dbGet: function () { return []; },
    dbUpsert: function (key, rec) { saved.push(rec); return true; },
    showToast: function () {}, window: {},
    CO: CO, AMT: amt
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(cutFn(src, 'function erpAddCompanyIncome') +
    '\n;erpAddCompanyIncome(CO, 12, 2025, "2026-02-03", "메모", "자문료", AMT);', box);
  return saved.length ? saved[0].amount : null;
}

console.log('[① 준 금액이 그대로 적힌다]');
ok('275,000원을 주면 275,000원이 적힌다', amountWhenGiven(275000) === 275000,
   '적힌 값: ' + amountWhenGiven(275000) + ' (자문료 440,000 이 아니라)');
ok('0원도 0원으로 적힌다 (0 을 「안 줬다」로 읽지 않는다)', amountWhenGiven(0) === 0,
   '적힌 값: ' + amountWhenGiven(0));

console.log('\n[② 금액을 안 주면 예전대로]');
ok('안 주면 업체관리 자문료(440,000)', amountWhenGiven(undefined) === 440000,
   '적힌 값: ' + amountWhenGiven(undefined) + ' — 다른 부르는 곳이 깨지면 안 된다');
ok('null 을 줘도 예전대로', amountWhenGiven(null) === 440000, '적힌 값: ' + amountWhenGiven(null));

/* ── 창이 같은 값을 쓰는가 (여기는 글로 본다 — 부품 전체를 돌릴 수는 없다) ── */
const dlg = src.slice(src.indexOf('function erpAddCompanyIncome'), src.indexOf('function IncomeCompanyTab'));

console.log('\n[③ 화면·확인창·저장이 같은 값을 쓴다]');
ok('「적을 금액」 규칙(effAmt)이 있다', /function effAmt\(n\)\{/.test(dlg.replace(/\s+/g, ' ').replace(/ \{/g, '{')) || /function effAmt\(n\)\s*\{/.test(dlg),
   '손수정 > 실데이터 > 자문료 순서를 한 곳에서 정해야 셋이 안 갈린다');
ok('합계가 effAmt 로 셈된다', /sel\.forEach\(function\(n\)\{ sum \+= effAmt\(n\); \}\);/.test(dlg),
   '합계만 옛 방식이면 차액이 또 어긋난다');
ok('확인창이 effAmt 를 보여준다', /var a = effAmt\(n\);/.test(dlg));
ok('저장에 effAmt 를 넘긴다', /var _amt = effAmt\(n\);/.test(dlg) &&
   /props\.addIncome\(co, month, d, _note, _k, _amt\)/.test(dlg) &&
   /erpAddCompanyIncome\(co, month, year, d, _note, _k, _amt\)/.test(dlg),
   '안 넘기면 저장 함수가 다시 「지금 자문료」를 꺼내 쓴다');
ok('옛 방식(nbAmtByCo || co.fee)이 남아 있지 않다',
   !/nbAmtByCo\[n\] \|\| \(\(c && c\.fee\) \|\| 0\)/.test(dlg) &&
   !/sum \+= nbAmtByCo\[n\] \|\|/.test(dlg),
   '한 곳이라도 남으면 그 자리만 다시 어긋난다');

console.log('\n[④ 손으로 고친 값이 이긴다]');
ok('손수정 칸이 있다', /var amtEdit\s*=/.test(dlg) && /setAmtEdit/.test(dlg));
ok('손수정이 실데이터보다 먼저다',
   dlg.indexOf('hasOwnProperty.call(amtEdit, n)) return parseInt(amtEdit[n],10)||0;') <
   dlg.indexOf('if(nbAmtByCo[n]) return nbAmtByCo[n];'),
   '순서가 뒤집히면 고쳐도 실데이터가 덮는다');
ok('고른 줄에서 금액을 고칠 수 있다', /inputMode:'numeric'/.test(dlg) && /setAmtEdit\(m\)/.test(dlg));
ok('숫자만 받는다', /replace\(\/\[\^0-9\]\/g,''\)/.test(dlg), '쉼표·글자가 들어가면 0원이 적힌다');

console.log('\n[⑤ 손으로 고쳤으면 자취가 남는다]');
ok('적요에 「금액 손수정」이 붙는다',
   /amtFrom\(n\)==='hand' \? ' · 금액 손수정' : ''/.test(dlg),
   '나중에 왜 이 금액인지 물을 때 답할 수 있어야 한다');
ok('어디서 온 값인지 줄에 보인다',
   /'실데이터'/.test(dlg) && /'고침'/.test(dlg) && /'자문료'/.test(dlg));
ok('업체관리 자문료와 다르면 그것도 함께 보여준다',
   /'자문료 '\+fee\.toLocaleString\(\)/.test(dlg),
   '왜 다른지 그 자리에서 알 수 있어야 한다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
