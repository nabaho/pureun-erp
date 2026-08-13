/* 더빌이체 줄 — 나이스빌 명세가 «한 업체 후보» 보다 앞선다
   ★ 더빌이체는 여러 곳 몫을 나이스빌이 모아 보낸 돈인데, 우연히 금액이 비슷한 업체 하나가
     후보로 잡히면 그 이름이 떠서 「이레메디컬의원 자문료 +667,000」 처럼 보였다.
     확인 창도 「넘친 667,000원을 어떻게 할까요?」 라고 물어 — 있지도 않은 과입금을 만들었다.
   ★ 나이스빌은 건당 수수료를 떼고 보낸다 — 통장 금액이 합계보다 적은 것이 정상이므로
     그만큼 넉넉히 봐 줘야 «합계 일치» 로 잡힌다. */
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

/* ══════ ① 금액 맞춤 — 수수료를 감안한다 ══════ */
const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function _nbAmtFits(sum, want, feeSum){', '\nfunction _nbShiftDay('), ctx);

t('똑같으면 맞다', ctx._nbAmtFits(755000, 755000), true);
t('원단위 오차는 맞다', ctx._nbAmtFits(755000, 754500), true);
t('★ 수수료만큼 적게 들어와도 맞다',
  ctx._nbAmtFits(758600, 755000, 3600), true);
t('수수료를 모르면 종전대로 빡빡하다',
  ctx._nbAmtFits(758600, 755000), false);
t('수수료보다 더 벌어지면 아니다',
  ctx._nbAmtFits(800000, 755000, 3600), false);
t('부가세 붙은 꼴도 본다', ctx._nbAmtFits(100000, 110000), true);
t('0원은 맞다고 하지 않는다', ctx._nbAmtFits(0, 755000), false);
t('빈 값도 안 터진다', ctx._nbAmtFits(null, null), false);

/* ══════ ② 묶음에 수수료 합계를 함께 담는다 ══════ */
const FIND = slice('function erpCmsLedgerForDeposit(date, amount){', '\nwindow.CMS_LEDGER_KEY');
t('건당 수수료를 더한다', /feeSum \+= parseInt\(r\.fee, 10\) \|\| 0;/.test(FIND), true);
t('묶음에 수수료를 담는다', /fee:feeSum, date:day,/.test(FIND), true);
t('맞춤 판정에 수수료를 넘긴다', /exact:_nbAmtFits\(total, want, feeSum\)/.test(FIND), true);

/* ══════ ③ 줄에서 명세가 앞선다 ══════ */
const FL = slice('function FinanceLedger(){', '\nfunction FinanceIncome');

t('명세를 찾았는지 한 번만 잰다', /var _cmsHit = !!\(isCms && _nbHit && _nbHit\.rows && _nbHit\.rows\.length\);/.test(FL), true);
// (2026-08-13) 효성CMS 도 받게 되어 회사 이름을 줄에서 골라 쓴다 (나이스빌 · 효성 · 섞이면 CMS)
t('업체 칸에 「회사 N곳」', /_cmsHit \? \('🏦 '\+erpCmsProviderName\(_nbHit\.rows\)\+' '\+_nbHit\.rows\.length\+'곳'\)/.test(FL), true);
t('업체 칸 도움말에 명세가 뜬다', /'나이스빌 명세 '\+_nbHit\.rows\.length\+'곳 · 합계 '/.test(FL), true);
t('현황 칸도 명세가 앞선다', /_cmsHit\s*\n?\s*\? h\('span',\{style:\{color:_nbHit\.exact\?'#166534':'#d97706'\}/.test(FL), true);
t('★ 한 업체와의 차액을 적지 않는다', /!_cmsHit && _st\.diff!==0 && h\('span'/.test(FL), true);
t('★ 수수료 배지도 적지 않는다', /!_cmsHit && _st\.fee>0 && h\('span'/.test(FL), true);
// 명세가 없을 때는 종전대로 안내
t('명세가 없으면 올리라고 말한다', /CMS 일괄이체 — 명세를 못 찾았습니다/.test(FL), true);

/* ══════ ④ 확인 창에서도 명세가 앞선다 ══════ */
const POP = slice('/* ── 확인 창 (노란 줄) ──', '/* ── 묶어 확정 권유');
t('창에서도 명세를 찾는다', /var _mCms = !!\(_mHit && _mHit\.rows && _mHit\.rows\.length\);/.test(POP), true);
t('머리글이 무슨 돈인지 말한다', /'🏦 '\+erpCmsProviderName\(_mHit\.rows\)\+'이 '\+_mHit\.rows\.length\+'곳 몫을 모아 보낸 돈입니다'/.test(POP), true);
t('명세를 줄줄이 보여준다', /erpNicebillMatchCo\(_idx, r\.name, r\.bizNo\)/.test(POP), true);
t('연결 안 된 회원은 빨갛게', /color:_co\?'#1e293b':'#dc2626'/.test(POP), true);
t('담당자도 함께 보여준다', /_sidName\(_co\.mainSid\)/.test(POP), true);
t('명세대로 처리하는 길', /close\(\); setCmsRow\(row\);/.test(POP), true);
t('나이스빌 화면으로 가는 길', /close\(\); setFileType\('nicebill'\);/.test(POP), true);

t('★ 과입금을 묻지 않는다', /!_mCms && _st\.diff>0 && pItem/.test(POP), true);
t('★ 부족도 묻지 않는다', /!_mCms && _st\.diff<0 && pItem/.test(POP), true);
t('★ 업체 고르라고 하지 않는다', /!_mCms && _grp\.length>1 && h\('div'/.test(POP), true);
t('★ 합계 후보도 묻지 않는다', /!_mCms && cb && h\('div'/.test(POP), true);
t('★ 밀린 달도 묻지 않는다', /!_mCms && _grp\.length===1 && _grp\[0\]\.n>1/.test(POP), true);
t('★ 한 업체로 확정하는 단추도 없다', /!_mCms && pItem && _st\.diff===0/.test(POP), true);
// 명세를 못 찾은 CMS 줄은 종전 갈래가 그대로 살아 있어야 한다 (조건이 _mCms 이지 isCms 가 아니다)
t('명세를 못 찾으면 종전 갈래가 산다', /!_mIsCms && /.test(POP), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
