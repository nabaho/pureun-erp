/* 사진첩 계약서 → 이알피 계약추가 가져오기 */
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

/* ═══ 1. PuPhotoStore 로드 + 초기화 ═══ */
{
  t('★ pu-photo-store.js 를 로드한다', /<script src="js\/pu-photo-store\.js\?v=\d+"><\/script>/.test(src), true);
  t('★ 인증 완료 시 PuPhotoStore.init 을 부른다', /PuPhotoStore\.init\(\s*\{\s*db:\s*fbDb,\s*uid:\s*user\.uid\s*\}\s*\)/.test(src), true);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
