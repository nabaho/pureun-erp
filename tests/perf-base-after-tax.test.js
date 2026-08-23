/* 성과급은 «세금 뗀 뒤 남은 금액» 으로 나눈다 (2026-08-11 대표 지시)
     "기타소득이나 사업소득의 경우 성과급 반영 시 세금을 공제하고
      남은 금액에 성과급을 반영해야 한다."

   ★ 앞선 8.8% 고침으로 세율은 맞았는데, «무엇에 곱하느냐» 가 화면마다 달랐다.
     900,000원 · 기타소득 8.8% · 부담당 100% 분할 · 직책요율 15% 일 때
       화면(입금확정 미리보기)  900,000 × 15%  = 135,000원   ← 세전
       저장(calcPerfShares)     820,800 × 15%  = 123,120원   ← 세후
     화면과 저장이 12,000원 가까이 달랐다. 화면이 거짓말을 한 것이다.

   이 검사는 ① 셈이 세후인지 실제로 돌려보고 ② 화면·저장 세 자리가
   모두 같은 기준을 쓰는지 코드에서 확인한다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

/* ── 실제 함수를 그대로 들여와 돌린다 (베낀 셈으로는 회귀를 못 잡는다) ── */
const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
// 원단위 절사(10원 아래 버림)는 roundKRW 가 맡는다 — 흉내내지 말고 «진짜» 를 들여온다
vm.runInContext(grab('function roundKRW(amount, mode){', '\nfunction fmtAmt('), ctx);
vm.runInContext(grab('function erpWithholdTax(amount, kind, rate){', '\nfunction calcPerfShares('), ctx);
// calcPerfShares 가 기대는 바깥 함수들 — 요율 15%, 사람 한 명으로 고정해 셈만 본다
vm.runInContext([
  'function getMgrRates(){ return {}; }',
  'function dbGet(k, d){ return k === "user_accounts" ? [{sid:"P005",name:"김혜민"},{sid:"A001",name:"권형하"}] : d; }',
  'function resolveBaseRate(sid){ return sid === "A001" ? 0 : 15; }',
  'function getRateAt(sid, d){ return resolveBaseRate(sid); }'
].join('\n'), ctx);
vm.runInContext(grab('function calcPerfShares(amount, mainSid, subSids, sourceKind, splitMainPct, opts){', 'function genCaseNo('), ctx);

console.log('\n[① 세금 뗀 뒤 남은 금액이 성과 기준이다]');
const d = ctx.calcDeductions(900000, { etcIncomeTax:true });
t('900,000원 · 기타소득 8.8% → 차감', d.totalDeducted, 79200);
t('★ 성과 기준 = 남은 금액(세후)', d.perfBaseAmount, 820800);
t('성과 기준이 입금액보다 크지 않다 (세전으로 되짚으면 986,842원이 됐다)',
  d.perfBaseAmount <= 900000, true);
const db = ctx.calcDeductions(900000, { bizIncomeTax:true });
t('사업소득 3.3% 도 같은 규칙', db.perfBaseAmount, 870300);

console.log('\n[② 화면 그림(대표 캡처)과 같은 조건으로 실제 분배를 돌려본다]');
/* 주담당 권형하 0% 분할, 부담당 김혜민 100% 분할, 직책요율 15% */
const shares = ctx.calcPerfShares(900000, 'A001', ['P005'], 'consulting', 0,
  { deductions:{ etcIncomeTax:true }, subPctMap:{ P005:100 } });
const sub = shares.find(s => s.sid === 'P005');
t('부담당 몫의 기준액 = 세후 전액', sub.baseAmount, 820800);
t('★ 부담당 실지급 = 820,800 × 15% (전에 화면은 135,000원이라 했다)', sub.amount, 123120);
t('세전으로 나눈 값이 아니다', sub.amount === 135000, false);

console.log('\n[③ 세금이 없으면 예전과 똑같아야 한다 — 애먼 건을 깎으면 안 된다]');
const plain = ctx.calcPerfShares(900000, 'A001', ['P005'], 'consulting', 0, { subPctMap:{ P005:100 } });
t('차감 없는 건은 입금액 전액이 기준', plain.find(s => s.sid === 'P005').baseAmount, 900000);
t('실지급도 그대로', plain.find(s => s.sid === 'P005').amount, 135000);

console.log('\n[④ 입금확정 미리보기 — 화면이 저장될 값과 같은 기준을 쓴다]');
/* 입금확정 모달만 잘라 본다 — 「분배 합계」까지가 미리보기 구역이다.
   ※ 창 크기를 글자수로 못 박으면 코드가 조금만 길어져도 엉뚱한 데를 본다. 앞뒤를 이름으로 잡는다. */
const _mStart = src.indexOf('var hasAnyOverride = (mainRateOverride != null)');
// 끝은 창의 «바닥 단추줄» 로 잡는다 — 안쪽 문구를 표시로 삼으면 그 문구를 고칠 때 깨진다
const _mEnd = src.indexOf("h('div', { className:'modal-f' }", _mStart);
const MODAL = src.slice(_mStart, _mEnd);
t('미리보기 구역을 잘라냈다', _mStart > 0 && _mEnd > _mStart, true);
t('★ 세후 기준을 미리 구해 둔다', /var _perfBase = calcDeductions\(_cmPay, _cmDed\)\.perfBaseAmount;/.test(MODAL), true);
/* 체크한 차감 설정을 실제로 읽어야 한다 — 빈 값을 넘기면 계산식은 그대로인데
   기타소득 체크가 미리보기에 안 먹어 다시 세전 금액이 뜬다(변이 p4). */
t('기타소득·사업소득 체크를 실제로 읽는다', /var _cmDed = confirmModal\.deductions \|\| \{\};/.test(MODAL), true);
/* 지킬 것은 「세후 기준(_perfBase)으로 나눈다」이지, 그 줄이 어떤 모양이냐가 아니다.
   2026-08-16 에 주담당·부담당 줄을 «한 함수» 로 합치면서 이 검사가 깨졌다 — 합친 것이 옳다. */
t('화면이 세후 기준으로 나눈다', /Math\.round\(_perfBase \* pct \/ 100\)/.test(MODAL), true);
/* 주담당만 따로 셈하는 길이 없어야 한다 — 두 벌이면 한쪽만 고쳐 조용히 어긋난다.
   (개인수익 배분은 이 창의 다른 구역에 제 셈이 따로 있다. 그건 별개다.) */
t('주담당 전용 셈이 따로 없다', /_perfBase \* mainPct \/ 100/.test(MODAL), false);
t('★ 약정액(세전)으로 나누던 옛 셈이 사라졌다',
  /Math\.round\(confirmModal\.p\.amount \* (mainPct|pct) \/ 100\)/.test(src), false);
t('분할입금이면 실제 들어온 돈까지만 센다', /confirmModal\.actualAmt != null \? confirmModal\.actualAmt : _cmRemain/.test(MODAL), true);
t('이미 받은 분은 뺀 잔액이 위쪽 한도', /var _cmRemain = confirmModal\.p\.amount - _cmPrev;/.test(MODAL), true);
t('카드결제는 잔액 전액 기준 (저장 로직과 같게)', /confirmModal\.cardMode \? _cmRemain/.test(MODAL), true);
t('무엇을 나누는지 금액으로 적어 준다', /'※ 성과 기준 ' \+ _perfBase\.toLocaleString\(\)/.test(MODAL), true);
t('세금을 뺀 건은 뺀 금액도 보여 준다', /' \(세금 ' \+ \(_cmPay - _perfBase\)\.toLocaleString\(\) \+ '원 뺀 뒤\)'/.test(MODAL), true);
t('세금이 없으면 그 문구를 안 띄운다', /_perfBase !== _cmPay && h\('span'/.test(MODAL), true);

console.log('\n[⑤ 개인수익 경로 — 저장되는 값 자체가 세전이었다]');
const PR = src.slice(src.indexOf('var isPersonalRev = !!deductions.personalRevenue;'),
                     src.indexOf('var isPersonalRev = !!deductions.personalRevenue;') + 2200);
t('주담당 몫이 세후 기준', /var _mainBase = Math\.round\(calc\.perfBaseAmount \* effMainPct \/ 100\);/.test(PR), true);
t('부담당 몫도 세후 기준', /var _base = Math\.round\(calc\.perfBaseAmount \* _subPct \/ 100\);/.test(PR), true);
t('★ 약정액으로 나누던 것이 사라졌다 (분할입금이면 안 들어온 돈까지 셌다)',
  /Math\.round\(p\.amount \* (effMainPct|_subPct) \/ 100\)/.test(PR), false);

console.log('\n[⑥ 성과 수정 팝업 — 세전으로 «되짚어» 입금액보다 큰 기준을 만들었다]');
const EDIT = src.slice(src.indexOf('// ── 4-3 비교 수정 팝업'),
                       src.indexOf('// ── 4-3 비교 수정 팝업') + 3000);
t('★ ÷0.912 로 부풀리던 것이 사라졌다', /baseAmt\/0\.912/.test(src), false);
t('★ ÷0.967 도 사라졌다', /baseAmt\/0\.967/.test(src), false);
t('확정할 때 저장해 둔 세후 기준을 그대로 쓴다', /var perfBase = fi\.perfBaseAmount \|\| 0;/.test(EDIT), true);
t('옛 자료(저장값 없음)만 되짚는다', /if\(!perfBase\)\{/.test(EDIT), true);
t('되짚을 때도 세금을 «뺀다» — 사업소득', /perfBase = erpWithholdTax\(baseAmt, 'biz'\)\.net;/.test(EDIT), true);
t('되짚을 때도 세금을 «뺀다» — 기타소득', /perfBase = erpWithholdTax\(baseAmt, 'misc', 8\.8\)\.net;/.test(EDIT), true);
t('부가세 셈은 건드리지 않았다 (이번 지시 범위 밖)', /Math\.round\(baseAmt\/1\.1\)/.test(EDIT), true);

console.log('\n[⑦ 되짚은 값도 입금액을 넘지 않는다]');
t('기타소득 8.8% 되짚기', ctx.erpWithholdTax(900000, 'misc', 8.8).net, 820800);
t('사업소득 3.3% 되짚기', ctx.erpWithholdTax(900000, 'biz').net, 870300);
t('둘 다 입금액 이하', ctx.erpWithholdTax(900000, 'misc', 8.8).net <= 900000, true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
