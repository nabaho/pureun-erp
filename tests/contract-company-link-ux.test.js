'use strict';
/* 계약 입력의 「업체 연결 · 온톨로지 검증」이 «혼내지 않는다» (대표 제보 2026-09-07)
 *
 * ★ 대표 말씀: 「온톨로지 검증 계약관리에서 나오고 계속해서 검증하라고 나온다.
 *   불필요하다. 온톨로지 이해는 되는데 굳이 필요한건가」
 *
 * ★ 실제로 겪으신 것 — 검색 칸에 업체명을 넣으셨는데 옆 고르개는 「업체 선택」 그대로였다.
 *   두 걸음인데 화면이 그 말을 안 했다. 그래서 «다 했는데 계속 혼난다»로 느껴졌다.
 *
 * ★★ 그래도 «저절로 채우지는 않는다»
 *   온톨로지 규칙이 「이름 일치만으로 companyId 를 채우지 않는다」이다.
 *   이름으로 채우면 「한빛산업」과 「(주)한빛산업」이 뒤섞이고, 그러면 그 회사의
 *   계약·사건·기금이 갈라져 「이 회사에 우리가 뭘 했더라」가 안 나온다.
 *   그래서 확정은 사람이 하되, 두 번 헤매지 않게 «누르면 끝나는 단추»를 둔다.
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const 대목 = SRC.slice(SRC.indexOf("'업체 연결 · 온톨로지 검증'") - 600,
                      SRC.indexOf("'업체 연결 · 온톨로지 검증'") + 2600);

test('★★ 아직 아무것도 «안 한» 때는 경고색으로 혼내지 않는다', () => {
  assert.ok(/companyLinkTouched/.test(SRC),
    '★ 손을 댔는지 안 댔는지를 가리지 않으면, 창을 열자마자 경고가 떠 있습니다 —\n'
    + '  그것이 「계속 검증하라고 한다」로 읽힙니다(대표 말씀).');
  assert.ok(/!companyLinkTouched\s*\?\s*'#64748b'|color:!companyLinkTouched\?'#64748b'/.test(대목.replace(/\s+/g, '')) ||
            /!companyLinkTouched[\s\S]{0,40}#64748b/.test(대목),
    '손 안 댄 때는 회색 안내라야 합니다');
});

test('★ 후보가 «하나뿐»이면 누르면 끝나는 단추를 준다 — 고르개를 뒤질 까닭이 없다', () => {
  assert.ok(/companyLinkOnly/.test(SRC), '후보 하나를 가려내는 자리가 없습니다');
  assert.ok(/companyLinkChoices\.length\s*===\s*1/.test(SRC),
    '후보가 «정확히 하나»일 때만이라야 합니다 — 둘이면 사람이 골라야 합니다');
  assert.ok(/companyLinkOnly\s*&&\s*h\('button'/.test(SRC),
    '단추가 있어야 합니다');
});

test('★★ 그래도 «저절로» 채우지 않는다 — 온톨로지 규칙이다', () => {
  /* 단추는 onClick 으로만 chooseCompanyLink 를 부른다.
     useEffect 같은 곳에서 저절로 부르면 「이름으로 ID 를 채우는」 것이 된다. */
  const 자동 = /useEffect\([^)]*\)\s*\{[\s\S]{0,400}?chooseCompanyLink\(/.test(SRC);
  assert.ok(!자동,
    '★ 화면이 스스로 chooseCompanyLink 를 부르면 「이름 일치만으로 ID 를 채우지 않는다」를 어깁니다');
});

test('★ 검색만 하고 «안 고른» 상태를 짚어 준다', () => {
  assert.ok(/위 고르개에서 골라 주세요/.test(SRC),
    '★ 두 걸음이라는 것을 말해야 합니다 — 검색 칸에 넣으면 고른 줄 아는 것이 자연스럽습니다');
});

test('⚠ 검증 자체는 그대로다 — 없애는 것이 아니라 «거슬리지 않게» 한 것이다', () => {
  assert.ok(/validateCompanyLink/.test(SRC), '검증을 빼면 안 됩니다');
  assert.ok(/companyLinkStatus==='pending'/.test(SRC), '연결 보류 길이 남아 있어야 합니다');
});
