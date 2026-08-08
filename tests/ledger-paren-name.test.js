// 괄호 안 업체명 대조가 실제로 동작하는지 — 함수를 떼어내 돌려본다
const fs = require('fs');
/* ⚠ 2026-08-08 고침 — 여기에 `C:/Users/.../pu-erp.html` 이라는 **그 PC의 절대 경로**가
   박혀 있었다. 대표님 컴퓨터에서는 늘 통과했지만 **배포 서버(리눅스)에서는 늘 실패**해
   모든 PR 이 막혔다. 게다가 그 경로는 PR 의 내용이 아니라 **그때 그 PC 에 있던 파일**을
   읽으므로, 통과해도 무엇을 검사한 것인지 알 수 없었다.
   검사 파일 자리를 기준으로 찾는다 — 다른 검사들이 모두 쓰는 방식이다. */
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

// 필요한 함수들만 뽑아낸다
function grab(name, kind){
  const re = new RegExp('\\nfunction ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = src.match(re);
  if(!m) throw new Error('못 찾음: ' + name);
  let i = m.index + m[0].length - 1;   // '{' 위치
  let depth = 0, start = m.index + 1;
  for(let j = i; j < src.length; j++){
    if(src[j] === '{') depth++;
    else if(src[j] === '}'){ depth--; if(depth === 0) return src.slice(start, j+1); }
  }
  throw new Error('닫는 괄호 못 찾음: ' + name);
}

const names = ['erpNormName','erpLcsLen','_erpNameCmp','erpCleanMemo','_erpStripNoiseWord'];
let code = '';
names.forEach(n => { code += grab(n) + '\n'; });

// erpCleanMemo 가 쓰는 전역들
code = `
var ERP_MEMO_NOISE = ['자동이체','펌뱅킹','인터넷','모바일','펌뱅','정기','cms','이체','입금','출금','송금','대체','타행','앱'];
var ERP_BANK_WORDS = ['새마을금고','저축은행','우체국','은행','신협','농협','축협','수협','금고'];
var _erpCleanCache = {};
` + code;

const sandbox = {};
new Function('exports', code + '\nObject.assign(exports,{erpNormName,erpCleanMemo,_erpNameCmp});')(sandbox);
const { erpNormName, erpCleanMemo, _erpNameCmp } = sandbox;

// pu-erp.html 에 넣은 괄호 추출 로직과 똑같이
const BANKW = ['새마을금고','저축은행','우체국','은행','신협','농협','축협','수협','금고'];
function parenNames(memo){
  const out = [];
  (String(memo == null ? '' : memo).match(/\(([^)]{2,})\)/g) || []).forEach(g => {
    const raw = erpNormName(g.slice(1, -1));
    if(!raw) return;
    if(BANKW.some(b => raw.slice(-b.length) === b)) return;   // 거래은행이지 업체가 아니다
    const inner = erpNormName(erpCleanMemo(g.slice(1, -1)));
    if(inner && inner.length >= 2 && out.indexOf(inner) < 0) out.push(inner);
  });
  return out;
}

// 고친 뒤의 이름 점수 (pu-erp.html 의 계산 순서 그대로)
function nameScore(memo, company){
  const tn = erpNormName(memo);
  const tnc = erpNormName(erpCleanMemo(memo));
  const cn = erpNormName(company);
  if(!cn) return 0;
  let s = Math.max(_erpNameCmp(tn, cn).score, (tnc && tnc !== tn) ? _erpNameCmp(tnc, cn).score : 0);
  parenNames(memo).forEach(p => { const r = _erpNameCmp(p, cn).score; if(r > s) s = r; });
  return s;
}
// 고치기 전 (괄호 안을 안 봄)
function nameScoreOld(memo, company){
  const tn = erpNormName(memo);
  const tnc = erpNormName(erpCleanMemo(memo));
  const cn = erpNormName(company);
  if(!cn) return 0;
  return Math.max(_erpNameCmp(tn, cn).score, (tnc && tnc !== tn) ? _erpNameCmp(tnc, cn).score : 0);
}

let pass = 0, fail = 0;
function eq(name, got, want){
  if(got === want){ pass++; console.log('  PASS ' + name + '  (' + got + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + got + ' · 기대 ' + want); }
}
function gt(name, got, than){
  if(got > than){ pass++; console.log('  PASS ' + name + '  (' + got + ' > ' + than + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + got + ' · ' + than + ' 보다 커야 함'); }
}

console.log('\n[괄호 안 업체명을 뽑아낸다]');
eq('최지영(롯데리아) → 롯데리아', parenNames('최지영(롯데리아)').join(','), '롯데리아');
eq('괄호 없으면 빈 목록', parenNames('노동권익과').length, 0);
eq('두 글자 미만은 안 뽑는다', parenNames('홍길동(A)').length, 0);

console.log('\n[실제로 있었던 오매칭 — 최지영(롯데리아)]');
const before = nameScoreOld('최지영(롯데리아)', '롯데리아 아산남성점');
const after  = nameScore('최지영(롯데리아)', '롯데리아 아산남성점');
console.log('       고치기 전 ' + before + '점 → 고친 뒤 ' + after + '점');
gt('롯데리아 점수가 올라간다', after, before);
eq('「이름 포함」 수준(85)까지 올라간다', after, 85);

console.log('\n[엉뚱한 업체는 그대로 0점이어야 한다]');
eq('최지영(롯데리아) vs 충남사회서비스원', nameScore('최지영(롯데리아)', '충남사회서비스원'), 0);
eq('최지영(롯데리아) vs 한국생산성본부', nameScore('최지영(롯데리아)', '한국생산성본부'), 0);

console.log('\n[은행명 괄호는 업체로 오인하지 않는다]');
eq('김철수(우리은행) vs 우리산업 — 은행 꼬리가 잘려도 오르지 않는다',
   nameScore('김철수(우리은행)', '우리산업') <= nameScoreOld('김철수(우리은행)', '우리산업'), true);

console.log('\n[기존 동작은 그대로]');
eq('괄호 없는 정확 일치', nameScore('한국생산성본부', '한국생산성본부'), 100);
eq('㈜ 표기 무시', nameScore('㈜이피아', '이피아'), 100);
eq('괄호가 오히려 방해하지 않는다 (이피아(주)) ', nameScore('이피아(주)', '이피아'), 100);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
