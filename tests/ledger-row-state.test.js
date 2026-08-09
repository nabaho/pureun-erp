/* 후보 묶기·줄 상태 — 입금 한 줄이 무엇으로 보이는가.
   ★ 지금은 줄마다 안내상자·선택칸·추천목록·확인칸이 붙어 화면 반쪽을 먹고,
     같은 업체가 세 달 밀리면 세 줄로 흩어져 «한 가지 사실» 이 세 개로 보였다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ══════ erpGroupPendByCompany — 업체 한 줄로 묶기 ══════ */
const gctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(gctx);
vm.runInContext(slice('function erpNormName(', '\nfunction erpLcsLen('), gctx);
vm.runInContext(slice('function erpGroupPendByCompany(', '\nfunction FinanceLedger('), gctx);

const S = (co, ym, id, amt) => ({ cand:{ id:id, companyName:co, kind:'advisory', ym:ym,
                                         expect:amt, amount:amt, label:'자문료' }, score:95 });
const g1 = gctx.erpGroupPendByCompany([S('크레오', '2026-07', 'a', 220000),
                                       S('크레오', '2026-05', 'b', 220000),
                                       S('크레오', '2026-06', 'c', 220000),
                                       S('신흥',   '2026-06', 'd', 220000)]);
t('업체 수만큼 줄이 된다', g1.length, 2);
t('세 달이 한 줄로 묶인다', g1[0].n, 3);
t('오래된 달부터 채운다', g1[0].head.cand.id, 'b');
t('묶인 달이 오름차순이다', g1[0].months, ['2026-05', '2026-06', '2026-07']);
t('다른 업체는 안 섞인다', g1[1].company, '신흥');
t('종류를 모아 보여준다', g1[0].kinds, ['자문료']);

/* 이름 표기가 달라도(㈜·(주)·공백) 같은 업체면 한 줄 — erpNormName 을 열쇠로 쓴다 */
const g2 = gctx.erpGroupPendByCompany([S('㈜한엘', '2026-06', 'x', 330000),
                                       S('(주)한엘', '2026-07', 'y', 330000)]);
t('표기가 달라도 같은 업체로 묶는다', g2.length, 1);

/* 달이 없는 것(사건 착수금 등)은 점수 높은 쪽이 먼저 */
const g3 = gctx.erpGroupPendByCompany([
  { cand:{ id:'p', companyName:'대성', label:'사건(착수)' }, score:70 },
  { cand:{ id:'q', companyName:'대성', label:'사건(잔금)' }, score:92 }]);
t('달이 없으면 점수 높은 것이 먼저', g3[0].head.cand.id, 'q');
t('종류가 둘이면 둘 다 모인다', g3[0].kinds.length, 2);

t('빈 목록도 안 터진다', gctx.erpGroupPendByCompany(null).length, 0);
t('망가진 항목은 건너뛴다', gctx.erpGroupPendByCompany([null, {}, S('가', '2026-01', 'z', 1)]).length, 1);

/* ══════ erpRowState — 신호등 ══════ */
const rctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(rctx);
vm.runInContext(slice('var ERP_FEE_MAX_RATE', '\n// sug = erpMatchTxnToPending'), rctx);
vm.runInContext(slice('function erpRowState(', '\nfunction FinanceLedger('), rctx);

const grp = (amt, score) => [{ company:'가나', n:1, months:[], kinds:['자문료'],
                               head:{ cand:{ id:'x', companyName:'가나', expect:amt, amount:amt }, score:score } }];

t('금액·이름 맞으면 초록', rctx.erpRowState({amount:330000, src:'bank'}, grp(330000, 95), {}).state, 'ready');
t('이체수수료 오차는 초록', rctx.erpRowState({amount:329500, src:'bank'}, grp(330000, 95), {}).state, 'ready');
t('더 들어오면 노랑', rctx.erpRowState({amount:400000, src:'bank'}, grp(330000, 95), {}).state, 'check');
t('넘친 금액을 알려준다', rctx.erpRowState({amount:400000, src:'bank'}, grp(330000, 95), {}).diff, 70000);
t('덜 들어오면 노랑', rctx.erpRowState({amount:200000, src:'bank'}, grp(330000, 95), {}).state, 'check');
t('모자란 금액은 음수', rctx.erpRowState({amount:200000, src:'bank'}, grp(330000, 95), {}).diff, -130000);
t('카드 수수료는 초록', rctx.erpRowState({amount:990000, src:'card'}, grp(1012000, 95), {}).state, 'ready');
t('수수료 금액을 싣는다', rctx.erpRowState({amount:990000, src:'card'}, grp(1012000, 95), {}).fee, 22000);
t('같은 금액이 통장이면 노랑', rctx.erpRowState({amount:990000, src:'bank'}, grp(1012000, 95), {}).state, 'check');
t('후보 없으면 빨강', rctx.erpRowState({amount:210000, src:'bank'}, [], {}).state, 'none');
t('이미 처리면 회색', rctx.erpRowState({amount:330000, src:'bank', _dup:true}, grp(330000, 95), {}).state, 'done');
t('보류함에 넣은 것도 회색', rctx.erpRowState({amount:1, src:'bank', _k:'k1'}, grp(1, 95), {held:{k1:1}}).state, 'done');
t('업체가 여럿이면 노랑', rctx.erpRowState({amount:330000, src:'bank'},
    grp(330000, 95).concat(grp(330000, 93)), {}).state, 'check');
t('빈 값이 와도 안 터진다', rctx.erpRowState(null, null, null).state, 'none');
t('상태마다 설명이 붙는다', rctx.erpRowState({amount:400000, src:'bank'}, grp(330000, 95), {}).label.length > 0, true);

/* ══════ erpOverpayPlan — 과입금 3갈래 ══════ */
const octx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, RegExp };
vm.createContext(octx);
vm.runInContext(slice('function erpOverpayPlan(', '\n/* ── 여러 입금을 한 항목에 묶기'), octx);

const R = { amount:400000, date:'2026-07-18' };
const C = { id:'c1', companyName:'한엘', expect:330000, kind:'advisory', ym:'2026-07' };

const p1 = octx.erpOverpayPlan(R, C, 'prepay');
t('미리 받으면 두 조각', p1.length, 2);
t('첫 조각은 이번 달 몫', p1[0].amount, 330000);
t('둘째 조각은 다음 달', p1[1].ym, '2026-08');
t('둘째 조각은 넘친 금액', p1[1].amount, 70000);
t('미리 받은 표시가 남는다', p1[1].prepay, true);
t('12월 다음은 이듬해 1월', octx._erpYmNext('2026-12'), '2027-01');
t('달이 없으면 빈 값', octx._erpYmNext(''), '');
t('그대로 기록은 한 조각', octx.erpOverpayPlan(R, C, 'asis').length, 1);
t('그대로 기록은 전액', octx.erpOverpayPlan(R, C, 'asis')[0].amount, 400000);
t('나누기는 이번 달만 잡는다', octx.erpOverpayPlan(R, C, 'split')[0].amount, 330000);
t('나누기는 남는 금액을 알린다', octx.erpOverpayPlan(R, C, 'split').rest, 70000);
t('안 넘쳤으면 한 조각', octx.erpOverpayPlan({amount:330000}, C, 'prepay').length, 1);
t('빈 값도 안 터진다', octx.erpOverpayPlan(null, null, 'prepay').length, 1);

/* ══════ erpBundlePlan — 나눠 들어온 입금 묶기 ══════ */
const bctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(bctx);
vm.runInContext(slice('function erpBundlePlan(', '\n/* ── 보류함'), bctx);

const B = bctx.erpBundlePlan([{_k:'a', amount:330000}, {_k:'b', amount:330000}], {expect:660000});
t('합계를 낸다', B.total, 660000);
t('차액 0이면 완납', B.full, true);
t('조각이 줄 수만큼', B.parts.length, 2);
t('조각에 줄 열쇠가 남는다', B.parts[0].rowKey, 'a');
t('모자라면 완납 아님', bctx.erpBundlePlan([{_k:'a', amount:330000}], {expect:660000}).full, false);
t('모자란 금액을 알려준다', bctx.erpBundlePlan([{_k:'a', amount:330000}], {expect:660000}).diff, -330000);
t('빈 값도 안 터진다', bctx.erpBundlePlan(null, null).total, 0);

/* ══════ erpHeldSummary — 보류함(가수금) ══════ */
const hctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(hctx);
vm.runInContext(slice('function erpHeldSummary(', '\n/* ── 상담료 후보'), hctx);

const H = hctx.erpHeldSummary([{k:'a', amount:110000, date:'2026-07-13'},
                               {k:'b', amount:50000,  date:'2026-06-02'}]);
t('건수를 센다', H.n, 2);
t('합계를 낸다', H.sum, 160000);
t('가장 오래된 날을 알려준다', H.oldest, '2026-06-02');
t('비면 0건', hctx.erpHeldSummary([]).n, 0);
t('빈 값도 안 터진다', hctx.erpHeldSummary(null).sum, 0);

/* ══════ erpConsultMatch — 상담접수와 이름 대조 ══════ */
const cctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, Date, RegExp };
vm.createContext(cctx);
vm.runInContext(slice('function erpNormName(', '\nfunction erpLcsLen('), cctx);
vm.runInContext(slice('var ERP_CONSULT_DAYS', '\n/* ── 업로드 결과 요약'), cctx);

const IN = [{ id:'c1', status:'consult', clientName:'김민수', contractDate:'2026-07-12' },
            { id:'c2', status:'consult', clientName:'박영희', contractDate:'2026-05-01' },
            { id:'c3', status:'signed',  clientName:'이철수', contractDate:'2026-07-10' }];

t('이름이 맞으면 찾는다', cctx.erpConsultMatch({memo:'김민수', date:'2026-07-13'}, IN).id, 'c1');
t('접수 날짜를 함께 준다', cctx.erpConsultMatch({memo:'김민수', date:'2026-07-13'}, IN).date, '2026-07-12');
t('접수일이 입금보다 나중이면 아니다', cctx.erpConsultMatch({memo:'김민수', date:'2026-07-01'}, IN), null);
t('너무 오래된 접수는 아니다', cctx.erpConsultMatch({memo:'박영희', date:'2026-07-13'}, IN), null);
t('상담접수 단계가 아니면 아니다', cctx.erpConsultMatch({memo:'이철수', date:'2026-07-13'}, IN), null);
t('이름이 없으면 아니다', cctx.erpConsultMatch({memo:'비즈사업비2건', date:'2026-07-13'}, IN), null);
t('빈 값도 안 터진다', cctx.erpConsultMatch(null, null), null);

/* ══════ erpUploadSummary — 같은 엑셀 다시 올렸을 때 ══════ */
const uctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(uctx);
vm.runInContext(slice('function erpUploadSummary(', '\nif(typeof window !== \'undefined\'){\n  window.erpOverpayPlan'), uctx);

const A = uctx.erpUploadSummary({dup:383, cut:0, skip:0}, 122, 0);
t('새 줄 수를 싣는다', A.added, 122);
t('건너뛴 줄 수를 싣는다', A.skipped, 383);
t('일부만 겹치면 같은 파일 아님', A.same, false);

const D = uctx.erpUploadSummary({dup:505, cut:0, skip:0}, 0, 0);
t('새 줄이 0이면 같은 파일', D.same, true);
t('같은 파일이라고 말해 준다', /전에 올린/.test(D.lines.join(' ')), true);

const E = uctx.erpUploadSummary({dup:0, cut:0, skip:3}, 100, 0);
t('날짜 못 읽은 줄도 알린다', /날짜/.test(E.lines.join(' ')), true);
t('처음 올리면 겹침 문구가 없다', /건너뜀/.test(E.lines.join(' ')), false);
t('빈 값도 안 터진다', uctx.erpUploadSummary(null, 0, 0).added, 0);

/* ══════ 화면 배선 — 새 함수를 쓰고 옛 화면은 사라졌는가 ══════ */
const ui = slice('function FinanceLedger(', '\nfunction FinanceIncome(');

t('줄 상태를 화면이 쓴다', /erpRowState\(/.test(ui), true);
t('업체 묶기를 화면이 쓴다', /erpGroupPendByCompany\(/.test(ui), true);
t('상담접수 대조를 화면이 쓴다', /erpConsultMatch\(row,\s*_intakes\)/.test(ui), true);
t('과입금 갈래를 화면이 쓴다', /erpOverpayPlan\(/.test(ui), true);
t('보류함 요약을 화면이 쓴다', /erpHeldSummary\(/.test(ui), true);
t('업로드 요약을 화면이 쓴다', /erpUploadSummary\(_mg, _added, dupN\)/.test(ui), true);
t('펼침은 한 줄만', /var openRow=openRowS\[0\]/.test(ui), true);

t('옛 초록 안내상자가 없다', /이미 확정된 건일 수 있습니다/.test(ui), false);
t('옛 업체·항목 셀렉트가 없다', /-- 업체\/항목 선택 --/.test(ui), false);
t('옛 자동 정리 상자가 없다', /자동 정리 가능/.test(ui), false);
/* 단추가 사라졌는지는 «코드 이름» 으로 본다 — 없앤 까닭을 적은 주석에도 같은 낱말이
   들어 있어서, 글자로 찾으면 주석을 지워야 통과하는 엉뚱한 검사가 된다. */
t('옛 자동확정 갈래가 없다', /chkAuto/.test(ui), false);
t('옛 확인 후 확정 갈래가 없다', /chkNeed|sendToConfirm\(/.test(ui), false);
t('옛 고신뢰 갈래가 없다', /highReadyKeys/.test(ui), false);
t('옛 자문료 일괄확인 창이 없다', /setAdvBatchOpen/.test(ui), false);
t('옛 자동정리 갈래가 없다', /autoTidyPick|autoTidySet/.test(ui), false);
t('확정 단추는 하나다', (ui.match(/모두 확정/g) || []).length, 1);

/* 요약칩·단추·탭이 같은 셈을 쓰는가 — 따로 세면 「41건」이라 써 놓고 39건만 확정된다 */
t('확정 대상을 한 번만 센다', (ui.match(/readyRows\.push/g) || []).length, 1);
t('단추가 그 목록을 그대로 쓴다', /readyRows\.forEach/.test(ui), true);
t('요약칩도 같은 셈을 쓴다', /stCnt\.ready/.test(ui), true);
t('탭 남은 건수도 같은 셈', /\(stCnt\.check\|\|0\)\+\(stCnt\.none\|\|0\)/.test(ui), true);

/* 확정 한 번에 연쇄되는가 */
const conf = slice('function confirmRow(', '\n  /* 과입금');
t('확정이 성과급까지 나눈다', /withPerf:true/.test(conf), true);
t('카드 수수료는 카드수수료 계정으로', /exp-cardfee/.test(conf), true);
t('적요를 학습한다', /erpLearnPayerAlias/.test(conf), true);
t('처리 지문을 남긴다', /erpMarkBankRowProcessed/.test(conf), true);
t('실패를 조용히 삼키지 않는다', /확정 실패/.test(conf), true);

/* 죽은 계산이 렌더마다 돌지 않는가 (없앤 갈래 판정) */
t('옛 갈래 판정을 안 돈다', /var gateOf = \{\}/.test(ui), false);
t('옛 자동정리 계산을 안 돈다', /autoTidyKeys\.push/.test(ui), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
