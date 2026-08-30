'use strict';
/* 폰 화면은 «한 번에 하나»만 보여 준다 — 대표 2026-08-30
     「폰에서 팝업과 다운 번호 입력등을 아주 쉽고 연결되기 쉽게 해라
       그리고 불필요한 설명 모두 없애라」

   고치기 전에는 한 화면에 단추 넷·안내글 넉 덩이가 늘 함께 떠 있었다.
   연결도 안 된 사람에게 「지난 문자 가져오기」와 「연결정보 지우기」가 같이 보였고,
   보안 안내 여덟 줄이 화면 절반을 먹었다. 무엇부터 눌러야 할지 알 수 없다.

   ★ 이 검사가 지키는 것
     ① 세 자리 중 «하나»만 켜진다 (연결 전 / 권한 없음 / 다 됨)
     ② 없앤 것을 «지우지는» 않았다 — 더보기 뒤에 있다(보안 안내는 사실이라 어디엔가 있어야 한다)
     ③ 화면이 거짓말하지 않는다 (훑기는 권한이 있어야 돈다는 조건을 뺀 채 적지 않는다)

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge', 'MainActivity.java'), 'utf8').split('\r\n').join('\n');
/* ⚠ 주석을 걷고 본다 — 안 걷으면 설명글을 코드로 착각해 헛통과한다 */
const M = RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

function body(sig) {
  const at = M.indexOf(sig);
  assert.ok(at > 0, sig + ' 를 못 찾았습니다');
  let d = 0, j = M.indexOf('{', at);
  for (;; j++) { if (M[j] === '{') d++; else if (M[j] === '}') { d--; if (!d) { j++; break; } } }
  return M.slice(at, j);
}

/* ══════ ① 한 번에 하나 ══════ */

test('★★ 연결 전에는 «번호칸 하나»만 — 다른 단추는 안 보인다', () => {
  const b = body('private void refresh()');
  const at = b.indexOf('if (!linked)');
  assert.ok(at > 0, '★ 연결 안 된 갈래가 없습니다');
  const br = b.slice(at, b.indexOf('return;', at));
  assert.match(br, /show\(stepPair,\s*true\)/, '★ 번호칸을 안 보여 줍니다');
  ['sweepWarn', 'grantSms', 'history'].forEach((k) => {
    assert.match(br, new RegExp('show\\(' + k + ',\\s*false\\)'),
      '★ 연결도 안 됐는데 ' + k + ' 가 보입니다');
  });
});

test('★★ 다 됐을 때는 번호칸이 사라진다 — 이미 연결됐는데 또 넣으라고 하지 않는다', () => {
  const b = body('private void refresh()');
  const after = b.slice(b.indexOf('show(stepPair, false)'));
  assert.ok(after.length > 0, '★ 연결 뒤 번호칸을 감추지 않습니다');
  assert.ok(!/show\(stepPair,\s*true\)/.test(after), '★ 연결 뒤에도 번호칸이 다시 뜹니다');
});

test('★ 세 자리가 모두 있다 — 갈래가 빠지면 아무것도 안 보이는 화면이 생긴다', () => {
  const b = body('private void refresh()');
  assert.match(b, /if \(!linked\)/, '연결 전 갈래가 없습니다');
  assert.match(b, /if \(!canRead\)/, '권한 없음 갈래가 없습니다');
  assert.match(b, /다 됐습니다/, '다 된 갈래가 없습니다');
});

/* ══════ ② 없애되 지우지는 않았다 ══════ */

test('★★ 「더보기」 뒤에 넣었을 뿐 지우지 않았다 — 보안 안내는 사실이라 어디엔가 있어야 한다', () => {
  assert.match(M, /moreBox/, '★ 더보기 자리가 없습니다');
  const at = M.indexOf('moreBox = new LinearLayout');
  const rest = M.slice(at);
  ['알림 접근 허용', '연결 지우기', '인증번호'].forEach((k) => {
    assert.ok(rest.indexOf(k) >= 0, '★ 「' + k + '」 가 통째로 사라졌습니다');
  });
});

test('★ 더보기는 «접힌 채»로 시작한다 — 펼쳐 있으면 줄인 뜻이 없다', () => {
  assert.match(M, /moreBox\.setVisibility\(android\.view\.View\.GONE\)/,
    '★ 더보기가 처음부터 펼쳐져 있습니다');
  assert.match(M, /private boolean moreOpen = false/, '★ 처음부터 열려 있습니다');
});

test('★ 대표가 펼쳐 둔 더보기를 화면 새로 그릴 때 도로 접지 않는다', () => {
  /* 접으면 「분명히 눌렀는데 사라졌다」가 된다 */
  const b = body('private void refresh()');
  assert.ok(!/moreBox/.test(b), '★ refresh 가 더보기를 건드립니다');
});

/* ══════ ③ 설명은 줄이되 거짓이 되지 않게 ══════ */

test('★★ 「무조건 훑는다」로 적지 않는다 — 훑기는 권한이 있어야 돈다', () => {
  assert.match(M, /켜면[\s\S]{0,160}훑습니다[\s\S]{0,80}안 훑습니다/,
    '★ 「켜야 훑는다」는 조건이 빠졌습니다 — 화면이 거짓말을 합니다');
});

test('★ 판 번호가 화면에 남아 있다 — 새로 깐 것이 맞는지 폰에서 가려야 한다', () => {
  assert.match(M, /BuildConfig\.VERSION_NAME/, '★ 판 번호가 화면에서 사라졌습니다');
});

test('★ 번호를 어디서 받는지 «연결 화면에» 적혀 있다', () => {
  /* 대표가 「어디에 있나」를 물은 자리다 — 폰 앱이 스스로 답해야 한다 */
  assert.match(M, /재무관리[\s\S]{0,40}거래내역/,
    '★ 연결번호를 어디서 받는지 폰 화면이 안 알려 줍니다');
});

/* ══════ ④ 줄어들었는가 ══════ */

test('★ 늘 보이는 단추가 줄었다 — 예전에는 넷이 함께 떠 있었다', () => {
  /* 지킬 것은 «몇 개인가»가 아니라 「갈래마다 하나만 켜진다」인데(위에서 봤다),
     그래도 「더보기 밖」에 단추가 우르르 돌아오면 뜻이 무너진다. 뿌리에 붙는 것만 센다. */
  const b = body('private ScrollView buildView()');
  const rootAdds = (b.match(/root\.addView\(/g) || []).length;
  assert.ok(rootAdds <= 9, '★ 첫 화면에 붙는 것이 ' + rootAdds + '개입니다 — 더보기 뒤로 옮기세요');
});
