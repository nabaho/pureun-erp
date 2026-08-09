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

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
