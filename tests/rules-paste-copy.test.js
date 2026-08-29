'use strict';
/* docs/rules-paste.json 은 콘솔에 붙여넣는 파일의 '짧은 이름 복사본'이다.
   원본 이름(firebase-rules-전체-적용본.json)은 한글과 괄호 때문에
   raw 주소가 길게 인코딩돼 복사하기 어렵다. 그래서 같은 내용을 짧은 이름으로도 둔다.
     https://raw.githubusercontent.com/nabaho/pureunall/main/docs/rules-paste.json

   ⚠ 둘이 어긋나면 어느 쪽을 붙여넣었는지 알 수 없어진다. 그래서 여기서 막는다.
      한쪽만 고치면 이 검사가 실패한다 — 고칠 때는 반드시 둘 다 같이 고친다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
/* 2026-08-29 — 옛 조각 파일을 없애고 «적용본» 하나로 모았다.
   짧은 이름 복사본은 그대로 둔다 — 바깥에서 raw 주소로 가져다 쓰기 때문이다. */
const SRC = path.join(root, 'docs', 'firebase-rules-전체-적용본.json');
const COPY = path.join(root, 'docs', 'rules-paste.json');

test('짧은 이름 복사본이 원본과 한 글자도 다르지 않다', () => {
  const a = fs.readFileSync(SRC, 'utf8');
  const b = fs.readFileSync(COPY, 'utf8');
  assert.equal(b, a, 'docs/rules-paste.json 과 원본이 다릅니다 — 한쪽만 고치면 안 됩니다.');
});

test('붙여넣기용 규칙에는 삭제 권한과 웹푸시 칸이 들어 있다', () => {
  const rules = JSON.parse(fs.readFileSync(COPY, 'utf8')).rules;
  assert.ok(rules.fcm_tokens, '웹푸시 기기 토큰(fcm_tokens) 칸이 있어야 합니다');
  const guarded = ['pucards', 'fund_erp', 'work_erp', 'companies', 'chwieop', 'payroll_os',
    'improve_requests', 'scal_staff', 'scal_types', 'scal_cos', 'scal_scheds', 'scal_env',
    'scal_fieldState', 'scal_conflictMatrix', 'scal_roundlog', 'scal_erpTypeMap'];
  for (const n of guarded) {
    assert.ok(rules[n] && rules[n].$k, n + ' 에 삭제 권한 구조($k)가 있어야 합니다');
    assert.match(rules[n]['.write'], /isAdmin'\)\.val\(\) == true/,
      n + ' 을 통째로 지우는 것은 관리자만 가능해야 합니다');
  }
});
