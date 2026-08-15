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

// 최상위 function 선언 하나를 통째로 꺼낸다 — 중괄호를 세어 끝을 찾는다.
// ('\n}\n' 같은 표식은 닫는 중괄호를 빠뜨려 SyntaxError 가 난다)
function fn(name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('함수 못찾음: ' + name);
  let depth = 0;
  for(let i = src.indexOf('{', start); i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('함수 끝을 못찾음: ' + name);
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

/* ═══ 2. erpVatTextToFlag — 부가세 문구 판정 ═══ */
{
  const c = vm.createContext({});
  vm.runInContext(fn('erpVatTextToFlag'), c);
  t('"포함" 이 들어있으면 체크', c.erpVatTextToFlag('부가세 포함'), true);
  t('"별도" 이 들어있으면 해제', c.erpVatTextToFlag('부가세 별도'), false);
  t('빈 문자열은 건드리지 않음(null)', c.erpVatTextToFlag(''), null);
  t('애매한 문구도 건드리지 않음(null)', c.erpVatTextToFlag('추후 협의'), null);
  t('undefined 도 null', c.erpVatTextToFlag(undefined), null);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
