/* 보류함 저장 버그 + 확인 창 업체 목록 정렬
   ★ 「❌ 보류함 저장에 실패했습니다」 — dbUpsert 는 «id 가 있는 항목 하나» 를 넣는 함수인데
     목록 배열을 통째로 넘겨서 id 가 없다고 무조건 거부됐다(대표 화면 제보).
     보류함은 통장 행 열쇠로 관리하는 목록이라 dbSet 이 맞다.
   ★ 확인 창의 업체 목록이 같은 금액 열 곳이 아무 순서로 서서 눈으로 훑을 수 없었다. */
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

/* ══════ ① 보류함 저장 ══════ */
const HOLD = slice('function holdRow(row){', '\n  function unholdRow(k){');
const UNHOLD = slice('function unholdRow(k){', '\n  /* 직접 찾기');

t('★ 목록은 dbSet 으로 통째로 저장한다', /dbSet\('ledger_held', cur\)/.test(HOLD), true);
t('★ dbUpsert 를 쓰지 않는다 (id 없다고 거부한다)', /dbUpsert\('ledger_held'/.test(HOLD), false);
t('되돌릴 때도 dbSet', /dbSet\('ledger_held', cur\)/.test(UNHOLD), true);
t('되돌릴 때도 dbUpsert 를 안 쓴다', /dbUpsert\('ledger_held'/.test(UNHOLD), false);
// 데이터보호(중복 id 제거)와 나중에 dbUpsert 를 쓸 일에 대비해 id 도 함께 남긴다
t('줄마다 id 를 남긴다', /id:row\._k, k:row\._k,/.test(HOLD), true);
t('실패는 조용히 삼키지 않는다', /showToast\('❌ 보류함 저장에 실패했습니다'\)/.test(HOLD), true);
// 왜 dbSet 인지 코드에 적어 둔다 (다음 사람이 또 dbUpsert 로 바꾸지 않게)
t('까닭을 적어 두었다', /dbUpsert 는 «id 가 있는 항목 하나» 를 넣는 함수라/.test(HOLD), true);

/* 저장소 전체에서 ledger_held 에 dbUpsert 를 쓰는 곳이 없어야 한다 */
t('★ 어디에서도 dbUpsert 로 보류함을 저장하지 않는다',
  /dbUpsert\('ledger_held'/.test(src), false);

/* ══════ ② 확인 창 업체 목록 — 칸 맞춤과 순서 ══════ */
const PICK = slice('// ① 업체가 여럿 — 골라야 한다', '// ② 과입금');

t('머리줄이 있다', /'업체 · 항목'/.test(PICK) && /'담당'\)/.test(PICK) && /'예상 입금'\)/.test(PICK), true);
t('근거 칸에도 이름을 붙였다', /'근거'\)/.test(PICK), true);
// 머리줄과 몸줄의 칸 너비가 같아야 세로로 선다
['56px', '82px', '60px'].forEach(function(w){
  t('칸 너비 ' + w + ' 가 머리·몸 두 번 나온다',
    (PICK.match(new RegExp("width:'" + w + "'", 'g')) || []).length, 2);
});
t('칸이 밀리지 않게 못 박았다', (PICK.match(/flex:'none'/g) || []).length >= 6, true);
t('업체명이 길면 그 칸 안에서만 잘린다', /flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'/.test(PICK), true);
t('금액은 자릿수를 고정한다', /fontVariantNumeric:'tabular-nums'/.test(PICK), true);

t('★ 금액이 가까운 순으로 세운다', /var da = Math\.abs\(aa-amt\), db = Math\.abs\(bb-amt\);/.test(PICK), true);
t('★ 금액이 같으면 이름 가나다순', /localeCompare\(String\(b\.company\|\|''\), 'ko'\)/.test(PICK), true);
t('원본 목록을 건드리지 않고 정렬한다', /_grp\.slice\(\)\.sort/.test(PICK), true);
t('무슨 순서인지 화면에 적어 준다', /'금액이 가까운 순 · 같으면 이름순'/.test(PICK), true);
t('몇 곳인지 적어 준다', /'어느 업체인가요\? — '\+_grp\.length\+'곳'/.test(PICK), true);
t('고른 줄은 색으로도 구분된다', /background:_on\?'#eff6ff':'#fff'/.test(PICK), true);
t('마우스를 올리면 잘린 이름이 다 보인다', /title:g\.company\+' · '\+erpKindLabel\(g\)/.test(PICK), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
