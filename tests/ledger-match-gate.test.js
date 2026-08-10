/* 이름 근거 게이트 — 금액만 비슷한 후보를 목록에서 뺀다.
   ★ 자문료 22만원짜리 업체가 열둘이면 열둘이 다 44%로 떠서 사람이 고를 수 없었다.
     잘못 고르면 남의 돈이 되므로, «이 업체» 라는 근거가 있어야 후보로 올린다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
// 줄바꿈은 LF 로 통일해 읽는다 (윈도우 CRLF / CI LF 양쪽에서 같은 표식이 찾히도록)
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

/* ══════ 1. erpNameEvidence — 이름 근거 게이트 ══════ */
const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function erpNameEvidence(', '\n// 한 건의 거래내역에 대한 상위 후보 목록'), ctx);

t('적요 이름이 맞으면 통과', ctx.erpNameEvidence({nameScore:75, fpScore:0, invScore:0}).ok, true);
t('금액만 비슷하면 막힌다', ctx.erpNameEvidence({nameScore:20, fpScore:0, invScore:0}).ok, false);
t('세금계산서가 맞으면 통과', ctx.erpNameEvidence({nameScore:0, fpScore:0, invScore:100}).ok, true);
/* ★ (2026-08-10 대표 제보) 금액지문(입금이력)은 «업체를 좁히는» 근거가 못 된다.
   「이 회사는 매달 165,000원을 낸다」는 뜻일 뿐이라, 자문료 165,000원 업체가 열둘이면
   열둘이 다 90점을 받아 열둘이 다 후보로 떴다. 정작 적요의 이름은 그 안에 없는데도
   화면은 「업체가 여럿 — 골라야 합니다」라고 말해, 고르라고 부추기는 꼴이었다. */
t('★ 금액지문만으로는 못 통과한다', ctx.erpNameEvidence({nameScore:0, fpScore:95, invScore:0}).ok, false);
t('금액지문이라고 «따로» 알린다 — 몇 곳을 뺐는지 화면이 말할 수 있어야 한다',
  ctx.erpNameEvidence({nameScore:0, fpScore:95, invScore:0}).fp, true);
t('금액지문만인 이유를 알기 쉽게 적는다',
  ctx.erpNameEvidence({nameScore:0, fpScore:95, invScore:0}).why.indexOf('금액만 같습니다') === 0, true);
t('약한 지문은 지문이라고 하지도 않는다',
  !!ctx.erpNameEvidence({nameScore:0, fpScore:70, invScore:0}).fp, false);
t('이름이 맞으면 금액지문이 있든 없든 통과',
  ctx.erpNameEvidence({nameScore:75, fpScore:95, invScore:0}).why, '이름');
t('세금계산서가 맞으면 금액지문보다 앞선다',
  ctx.erpNameEvidence({nameScore:0, fpScore:95, invScore:100}).why, '세금계산서');
t('근거가 무엇인지 말해 준다', ctx.erpNameEvidence({nameScore:75, fpScore:0, invScore:0}).why, '이름');
t('막힌 이유도 비어 있지 않다', ctx.erpNameEvidence({nameScore:0, fpScore:0, invScore:0}).why.length > 0, true);
t('빈 값이 들어와도 안 터진다', ctx.erpNameEvidence(null).ok, false);

/* ══════ 2. 후보 목록 배선 ══════ */
const wire = slice('function erpMatchTxnToPending(', '\n// ── 자동 정리(1클릭 승인) 3중 관문 ──');
t('후보 목록이 게이트를 쓴다', /erpNameEvidence\(r\)/.test(wire), true);
t('직접 찾기용 우회 인자가 있다', /includeWeak/.test(wire), true);
t('막힌 후보에 표시가 남는다', /weak:\s*!ev\.ok/.test(wire), true);

/* 게이트가 실제로 후보를 걸러내는지 — erpMatchTxnToPending 을 통째로 돌려 본다.
   erpMatchScore 는 무겁게 얽혀 있으므로 가짜로 갈아 끼우고 «거르는 동작» 만 본다. */
const wctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
wctx.erpMatchScore = function(txn, cand){
  // 이름이 통째로 같을 때만 이름점수를 준다 (금액은 모두 비슷하다고 본다)
  const same = String(txn.memo || '') === String(cand.companyName || '');
  return { score:90, reasons:[], level:'high', amountScore:100,
           nameScore:(same ? 90 : 10), fpScore:0, invScore:0 };
};
vm.createContext(wctx);
vm.runInContext(slice('function erpNameEvidence(', '\n// ── 자동 정리(1클릭 승인) 3중 관문 ──'), wctx);

const POOL = [{id:'a', companyName:'노리시스템', amount:220000},
              {id:'b', companyName:'크레오에스지', amount:220000},
              {id:'c', companyName:'신흥기업', amount:220000}];
const got1 = wctx.erpMatchTxnToPending({memo:'노리시스템', amount:220000}, POOL, 12);
t('이름 맞는 것만 남는다', got1.map(x => x.cand.id), ['a']);
const got2 = wctx.erpMatchTxnToPending({memo:'비즈사업비2건', amount:220000}, POOL, 12);
t('이름 근거가 없으면 아무것도 안 나온다', got2.length, 0);
const got3 = wctx.erpMatchTxnToPending({memo:'비즈사업비2건', amount:220000}, POOL, 12, true);
t('직접 찾기는 약한 후보도 본다', got3.length, 3);
t('약한 후보에 표시가 붙는다', got3[0].weak, true);
t('통과한 후보는 표시가 없다', got1[0].weak, false);
t('근거 이름이 함께 실린다', got1[0].evidence, '이름');

/* ══════ 3. 세금계산서 대조 창 (60일 → 180일) ══════ */
const invSrc = slice('var INV_MATCH_DAYS', '\n// txn={date,amount}');
t('대조 창이 상수로 뽑혀 있다', /INV_MATCH_DAYS\s*=\s*180/.test(invSrc), true);
t('창 판정이 상수를 쓴다', /gap > INV_MATCH_DAYS/.test(invSrc), true);
t('60일 하드코딩이 남아 있지 않다', /gap > 60/.test(invSrc), false);
t('보관 개월 안에 들어온다', 180 <= parseInt(/var INV_ARCH_MONTHS = (\d+)/.exec(src)[1], 10) * 30, true);

/* ══════ 4. erpFeeMatch — 카드·CMS 수수료 감안 ══════ */
const fctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(fctx);
vm.runInContext(slice('var ERP_FEE_MAX_RATE', '\n// sug = erpMatchTxnToPending'), fctx);

t('카드 2.2% 수수료를 인정한다', fctx.erpFeeMatch(990000, 1012000, 'card').ok, true);
t('빠진 수수료 금액을 알려준다', fctx.erpFeeMatch(990000, 1012000, 'card').fee, 22000);
t('요율도 알려준다', fctx.erpFeeMatch(990000, 1012000, 'card').rate, 0.0217);
t('통장은 수수료를 안 본다', fctx.erpFeeMatch(990000, 1012000, 'bank').ok, false);
t('3.5%를 넘으면 아니다', fctx.erpFeeMatch(900000, 1012000, 'card').ok, false);
t('더 들어온 것은 수수료가 아니다', fctx.erpFeeMatch(1100000, 1012000, 'card').ok, false);
t('같은 금액도 수수료가 아니다', fctx.erpFeeMatch(1012000, 1012000, 'card').ok, false);
t('CMS 도 인정한다', fctx.erpFeeMatch(990000, 1012000, 'nicebill').ok, true);
t('0원은 안 터진다', fctx.erpFeeMatch(0, 0, 'card').ok, false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
