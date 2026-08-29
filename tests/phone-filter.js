/* 폰 거르개(HanaMessageFilter.java)가 «이 문자를 서버로 보내는가» 를 대신 답해 준다.
 *
 * ★ 왜 이 파일이 있나
 *   폰에서 버리면 서버는 아무것도 못 듣는다 — lastSkip 조차 안 남는다.
 *   그래서 「문자가 안 온다」 와 「와서 버렸다」 를 화면이 가를 수 없다.
 *   검사가 그 자리를 대신 지켜야 한다.
 *
 *   ⚠ 자바 «원본을 읽어» 판단한다. 규칙을 여기 옮겨 적으면, 자바를 고쳤을 때
 *     검사는 옛 규칙을 보게 되어 아무것도 못 지킨다.
 *   ⚠ 검사 세 곳(hana-card-link · hana-sms-why-missing · hana-phone-filter)이
 *     이 하나를 같이 쓴다. 저마다 옮겨 적으면 셋이 서로 갈라진다.
 *
 * 2026-08-29 에 이것이 필요했던 일:
 *   카드 문자는 「하나9950 승인 …」 처럼 하나+숫자로 오는데 폰 거르개는
 *   「하나카드」 같은 낱말 넷만 봤다. 검사들은 «낱말이 소스에 있는지»만 봐서
 *   버그가 있는 채로 통과했다 — 실제 문자로 시험하지 않았기 때문이다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const JAVA = path.join(__dirname, '..', 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge', 'HanaMessageFilter.java');

function source() {
  return fs.readFileSync(JAVA, 'utf8').split('\r\n').join('\n');
}

/* 자바의 Pattern.compile("…" + "…") 을 자바스크립트 정규식으로 */
function pattern(src, name) {
  const re = new RegExp('Pattern\\s+' + name + '\\s*=\\s*Pattern\\.compile\\(([\\s\\S]*?)\\);');
  const m = src.match(re);
  if (!m) throw new Error('HanaMessageFilter.java 에서 ' + name + ' 을 못 찾았습니다 — 이름이 바뀌었나요?');
  const body = m[1].split('+').map(s => s.trim().replace(/^"|"$/g, '')).join('');
  return new RegExp(body.split('\\\\').join('\\'), 'i');
}

function stringList(src, name) {
  const re = new RegExp('String\\[\\]\\s+' + name + '\\s*=\\s*\\{([\\s\\S]*?)\\};');
  const m = src.match(re);
  if (!m) throw new Error('HanaMessageFilter.java 에서 ' + name + ' 을 못 찾았습니다');
  return m[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

const MOVE = ['승인', '취소', '입금', '출금', '이체'];

/* 이 문자가 폰을 통과해 서버로 가는가 */
function phoneAccepts(message, title) {
  const src = source();
  const v = ((title || '') + '\n' + (message || '')).toLowerCase();
  for (const b of stringList(src, 'SECURITY')) if (v.indexOf(b) >= 0) return false;
  if (!pattern(src, 'HANA').test(v)) return false;
  if (!MOVE.some(m => v.indexOf(m) >= 0)) return false;
  return pattern(src, 'MONEY').test(v) && pattern(src, 'DATE').test(v);
}

/* 실제로 오는 문자들 — 검사 여러 곳이 같은 표본을 쓴다 */
const REAL = {
  카드승인: '[Web발신] 하나9950 승인 푸른노무법 26,000원 일시불 08/18 12:59 스시리두정 가용액3,432,999원',
  카드취소: '하나9950 승인취소 26,000원 08/23 09:02 스시리',
  은행입금: '[Web발신] 하나은행 입금 1,250,000원 08/22 15:31 주식회사 예시 잔액 2,000,000원',
  인증번호: '하나은행 인증번호 123456 입금 10,000원 08/22 15:31',
  남의은행: '국민카드 승인 08/25 12:00 10,000원 어디가게',
};

module.exports = { phoneAccepts, REAL, source, pattern, stringList, MOVE, JAVA };
