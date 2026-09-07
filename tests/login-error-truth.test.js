'use strict';
/* 로그인 실패 안내가 «거짓말을 하지 않는다» (대표 제보 2026-09-07 — 외부 컴퓨터)
 *
 * ★ 무슨 일이 있었나
 *   대표가 처음 쓰는 PC 에서 로그인하니 「아이디·비번이 일치하지 않는다」로 막혔다.
 *   화면은 그때 「비밀번호가 틀렸습니다」라고만 말하고 있었다.
 *
 * ★ 왜 그 말이 거짓인가
 *   파이어베이스는 「이 이메일이 있는지 없는지」를 밖으로 알리지 않는다(계정 캐내기 막기).
 *   그래서 SDK 10 은 «없는 계정»도 «틀린 비밀번호»도 auth/invalid-credential 하나로
 *   돌려준다 — auth/user-not-found 는 이제 오지 않는다.
 *   그 하나를 「비밀번호가 틀렸다」로 옮겨 적으면, 아이디가 잘못 들어간 사람은
 *   비밀번호만 몇 번이고 다시 친다. 늘 쓰던 PC 는 아이디가 저장돼 있어 안 겪고
 *   «처음 쓰는 PC»에서만 겪는다 — 그래서 오래 안 드러났다.
 *
 * ★ 무엇을 못 박나 — 글자가 아니라 규칙 셋
 *   ① 그 오류에서 «비밀번호만» 틀렸다고 단정하지 않는다
 *   ② «어느 계정으로 시도했는지»를 함께 보인다 (아이디 오타가 그 자리에서 드러난다)
 *   ③ 비밀번호 칸의 «안 보이는» 실수(한글 입력기·앞뒤 공백)를 알려 준다
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { stripComments } = require('./strip-comments');

const SRC = stripComments(fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8'));

/* 로그인 실패를 다루는 대목만 떼어 본다 — 비밀번호 «변경» 창에는 안 걸리게 */
const 실패대목 = (() => {
  const at = SRC.indexOf("auth/too-many-requests");
  const from = SRC.lastIndexOf("auth/invalid-credential", at);
  assert.ok(from > 0 && at > from, '로그인 실패를 다루는 대목을 못 찾았습니다');
  return SRC.slice(from - 400, at);
})();

test('★★ 「비밀번호가 틀렸다」고 단정하지 않는다 — 아이디가 틀렸을 수도 있다', () => {
  assert.ok(!/showErr\(\s*'비밀번호가 틀렸습니다/.test(실패대목),
    '없는 계정도 같은 오류로 옵니다 — 비밀번호만 지목하면 아이디 오타를 영영 못 찾습니다.');
  assert.ok(/아이디[^']*비밀번호|비밀번호[^']*아이디/.test(실패대목),
    '둘 중 무엇인지 모른다는 것을 말해야 합니다.');
});

test('★ 시도한 계정을 함께 보인다 — 아이디 오타가 그 자리에서 드러나야 한다', () => {
  assert.ok(/\+\s*email\s*\+/.test(실패대목) || /\$\{email\}/.test(실패대목),
    '무엇으로 시도했는지 안 보이면, 처음 쓰는 PC 에서 아이디 오타를 확인할 길이 없습니다.');
});

test('★ 이제 안 오는 오류에 «혼자만» 기대지 않는다 (auth/user-not-found)', () => {
  const 아이디만 = /auth\/user-not-found[\s\S]{0,120}?showErr\(\s*'계정을 찾을 수 없습니다/;
  assert.ok(!아이디만.test(SRC),
    'SDK 10 은 없는 계정도 invalid-credential 로 돌려줍니다 — 이 갈래는 안 옵니다.');
});

test('★ 비밀번호 칸의 «안 보이는» 실수를 알려 준다 — 한글 입력기와 앞뒤 공백', () => {
  assert.ok(/function pwHint/.test(SRC), '비밀번호 힌트 함수가 없습니다');
  assert.ok(/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(SRC.slice(SRC.indexOf('function pwHint'),
    SRC.indexOf('function pwHint') + 400)), '한글이 섞였는지 보는 자리가 없습니다');
  assert.ok(/trim\(\)/.test(SRC.slice(SRC.indexOf('function pwHint'),
    SRC.indexOf('function pwHint') + 400)), '앞뒤 공백을 보는 자리가 없습니다');
});

test('★ 공백을 «몰래 지우지 않는다» — 알려만 주고 고치는 것은 사람이 한다', () => {
  assert.ok(!/loginPw'\)\.value\s*\|\|\s*''\s*\)\.trim\(\)/.test(SRC),
    '진짜로 공백이 든 비밀번호를 조용히 바꾸면 왜 안 되는지 아무도 못 찾습니다.');
});

test('★ 대문자 잠금 알림과 «자리를 나눠 쓰지 않는다»', () => {
  assert.ok(/id="pwHintMsg"/.test(SRC), '힌트 자리가 따로 있어야 합니다');
  assert.ok(/id="capsWarn"/.test(SRC), '대문자 잠금 알림이 그대로 있어야 합니다');
  assert.notStrictEqual(SRC.indexOf('id="pwHintMsg"'), SRC.indexOf('id="capsWarn"'));
});
