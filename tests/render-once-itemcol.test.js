/* 렌더 한 번에 같은 계산 한 번 + 확인 창 항목 열 분리
   ★ 「화면 멈춤 263ms」(대표 콘솔 제보) — 추천 계산은 이미 시간 예산으로 쪼개져 있는데,
     계산이 끝난 뒤의 리렌더가 305행 × 2회(요약칩용 + 행 렌더용) 같은 계산을 해서 길었다.
   ★ 확인 창 목록이 「업체 · 항목」 을 한 칸에 붙여 써서 항목이 세로로 안 섰다. */
const fs = require('fs');
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

const FL = slice('function FinanceLedger(', '\nfunction FinanceIncome');

/* ══════ ① 같은 계산을 두 번 하지 않는다 ══════ */
t('요약 패스가 결과를 map 에 담는다', /rowInfo\[row\._k\] = \{ grp:grp, st:st \};/.test(FL), true);
t('행 렌더가 그 map 을 쓴다', /var _ri2=rowInfo\[row\._k\]\|\|\{\};/.test(FL), true);
t('map 에 있으면 다시 계산하지 않는다', /var _grp=_ri2\.grp\|\|rowGroups\(row\);/.test(FL), true);
t('상태도 마찬가지', /var _st=_ri2\.st\|\|erpRowState\(row,_grp,\{held:held\}\);/.test(FL), true);
// 행 렌더 구역 안에 무조건적인 rowGroups 호출이 없어야 한다
const TBODY = FL.slice(FL.indexOf("h('tbody',null,incList.slice(0,ldShow)"), FL.indexOf('// 합계 행'));
t('행 렌더에 무조건 재계산이 없다', /var _grp=rowGroups\(row\);/.test(TBODY), false);

/* 추천 계산은 시간 예산(한 행마다 시계)으로 쪼개져 있어야 한다 — 이건 이미 있던 것을 지킨다 */
t('계산은 한 행마다 시계를 본다', /\} while\(i < rowsArr\.length && tb && \(performance\.now\(\) - tb\) < 16\);/.test(FL), true);
t('낡은 재료는 조용히 그만둔다', /if\(job\.cancel\) return;/.test(FL), true);

/* ══════ ② 확인 창 — 항목 열 분리 ══════ */
const PICK = slice('// ① 업체가 여럿 — 골라야 한다', '// ② 과입금');
t('머리에 「업체」와 「항목」이 따로 있다',
  /h\('span',\{style:\{flex:1,minWidth:0\}\},'업체'\)/.test(PICK)
  && /h\('span',\{style:\{width:'104px',flex:'none'\}\},'항목'\)/.test(PICK), true);
t('업체 칸에는 업체만', /title:g\.company\},g\.company\),/.test(PICK), true);
t('항목 칸이 너비를 못 박았다', (PICK.match(/width:'104px'/g) || []).length, 2);
t('항목에 밀린 달 수가 붙는다', /erpKindLabel\(g\)\+\(g\.n>1\?\(' \('\+\(g\.months\.length\|\|g\.n\)\+'달\)'\):''\)/.test(PICK), true);
t('마우스를 올리면 밀린 달 목록', /' — 밀린 달: '\+g\.months\.join\(', '\)/.test(PICK), true);
t('옛 붙여쓰기가 없다', /g\.company\+' · '\+erpKindLabel\(g\)\+\(g\.n>1/.test(PICK), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
