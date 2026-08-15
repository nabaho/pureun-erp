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
//
// 주의 두 가지:
// 1) 매개변수 목록에 기본값/구조분해로 중괄호가 들어있으면
//    (예: function bar(opts = {a:1}){...}) 본문이 아니라 매개변수 목록의
//    '{' 부터 세기 시작하면 조기 종료해버린다. 그래서 매개변수 목록을
//    괄호 깊이로 먼저 끝까지 건너뛴 다음에야 본문의 '{' 부터 센다.
// 2) 본문 안 문자열 리터럴에 짝 안 맞는 중괄호가 있으면 그래도 잘못 잘릴 수
//    있다. 이건 토크나이저 없이는 완전히 못 막으므로, 대신 꺼낸 텍스트가
//    실제로 파싱되는지 검증해서 실패하면 "이 함수, 잘렸을 수 있음" 이라고
//    이름을 콕 집어 알려준다 (원래 harness 코드 위치를 가리키는 뜬금없는
//    SyntaxError 대신).
function fn(name){
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if(start < 0) throw new Error('함수 못찾음: ' + name);

  // 매개변수 목록을 괄호 깊이로 건너뛴다 — 그 안의 '{'/'}' (기본값 객체 등)는
  // 본문 중괄호 세기에 끼어들면 안 된다.
  let pdepth = 0, parenEnd = -1;
  for(let i = start + marker.length - 1; i < src.length; i++){
    if(src[i] === '(') pdepth++;
    else if(src[i] === ')'){ pdepth--; if(pdepth === 0){ parenEnd = i; break; } }
  }
  if(parenEnd < 0) throw new Error('매개변수 목록 끝을 못찾음: ' + name);

  const bodyStart = src.indexOf('{', parenEnd + 1);
  if(bodyStart < 0) throw new Error('함수 본문 시작을 못찾음: ' + name);

  let depth = 0;
  for(let i = bodyStart; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0){
        const extracted = src.slice(start, i + 1);
        try{
          new vm.Script(extracted); // 꺼낸 텍스트가 실제로 파싱되는지 확인
        } catch(e){
          throw new Error('함수 추출이 잘렸을 가능성 있음: ' + name + ' (' + e.message + ')');
        }
        return extracted;
      }
    }
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
  t('"포함"과 "별도"가 둘 다 있으면 건드리지 않음(null)', c.erpVatTextToFlag('부가세 별도(포함 여부 추후 확정)'), null);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
