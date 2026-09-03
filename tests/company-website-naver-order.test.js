/* 업체 홈페이지 찾기 서버 함수 — 네이버 두 갈래의 «차례»와 «조건» (2026-09-03)
 *
 * ■ 지키려는 규칙
 *   ① 지역(업체) 검색을 먼저 부른다 — 주소·홈페이지가 칸으로 와서 판정이 정확하다.
 *   ② 웹문서 검색은 ①이 못 찾았을 때만 부른다 — 무료 한도를 아낀다.
 *   ③ 열쇠는 비밀값(secrets)으로만 읽고, 없으면 «설정이 안 됐다»고 분명히 말한다.
 *   ④ 구글 Custom Search 로 되돌아가지 않는다 — 신규 고객에게 닫혀 있어 403 만 난다.
 *   ⑤ «옛 네이버 주소»(openapi.naver.com)로도 되돌아가지 않는다 (2026-08-31 추가)
 *
 * ⚠ 2026-08-31: 네이버가 검색 API 를 네이버 클라우드의 NAVER API HUB 로 옮겼다.
 *   developers.naver.com 은 2026-07-31 부로 신규 신청이 끝나, 옛 주소·옛 헤더로는
 *   «새로 열쇠를 받을 수조차» 없다. 대표가 개발자센터에서 등록하려다 「사용 API」
 *   목록에 검색이 아예 없어 막혔다. 그래서 주소와 헤더를 여기서 함께 못 박는다 —
 *   차례만 지키고 주소를 놓치면, 멀쩡해 보이는데 401 만 나는 코드가 된다.
 *
 * 값(어떤 URL·어떤 문구)이 아니라 «차례와 조건»을 본다 — 문구가 바뀌어도 안 깨진다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
/* runWith({…}) 의 중괄호가 먼저 나와서 함수 머리부터 자르면 거기서 끊긴다 —
   머리(runWith 까지)와 몸(onRequest 의 함수 본문)을 따로 잘라 이어 붙인다. */
const start = SRC.indexOf('exports.findCompanyWebsite');
assert.ok(start >= 0, 'findCompanyWebsite 가 없다');
const tail = SRC.slice(start);
const head = tail.slice(0, tail.indexOf('.https.onRequest'));
const body = cutFn(tail, '.https.onRequest(async (req, res) =>');
const fn = head + body;

test('★ 지역 검색을 먼저, 웹문서 검색은 그 뒤에 부른다', () => {
  const iLocal = fn.indexOf('naverSearch("local"');
  const iWeb = fn.indexOf('naverSearch("webkr"');
  assert.ok(iLocal >= 0, '지역 검색 호출이 없다');
  assert.ok(iWeb >= 0, '웹문서 검색 호출이 없다');
  assert.ok(iLocal < iWeb, '웹문서를 지역보다 먼저 부르면 정확한 쪽(주소 칸)을 버리고 덜 정확한 쪽으로 판정한다');
});

test('★★ 웹문서 검색은 지역 검색이 못 찾았을 때만 부른다 (무료 한도 아끼기)', () => {
  const iIf = fn.indexOf('if (!matched)');
  const iWeb = fn.indexOf('naverSearch("webkr"');
  assert.ok(iIf >= 0 && iIf < iWeb, '조건 없이 늘 두 번 부르면 한도를 두 배로 쓴다');
  const between = fn.slice(iIf, iWeb);
  assert.ok(!/naverSearch\("local"/.test(between), '조건 안에 지역 검색이 들어가 있으면 차례가 뒤집힌 것이다');
});

test('열쇠 둘은 비밀값으로 선언하고, 없으면 설정 안 됨을 말한다', () => {
  assert.match(fn, /secrets:\s*\[[^\]]*NAVER_SEARCH_CLIENT_ID[^\]]*NAVER_SEARCH_CLIENT_SECRET[^\]]*\]/);
  assert.match(fn, /설정되지 않았습니다/);
});

test('★ 구글 Custom Search 로 되돌아가지 않는다', () => {
  assert.ok(!/customsearch|GOOGLE_SEARCH/.test(fn), '구글 Custom Search JSON API 는 신규 고객에게 닫혀 있어 403 만 난다');
});

/* ══ 새 집으로 옮긴 것을 못 박는다 (2026-08-31) ══════════════════════════ */

/* ⚠ 주석을 먼저 걷는다. 이 저장소 규칙이기도 하지만, 여기서는 «반대 방향»으로
     물렸다 — 「옛 주소로 돌아가지 말라」고 적어 둔 설명글 안의 openapi.naver.com 을
     검사가 «진짜 코드»로 읽고 실패했다. 잘 쓴 주석이 검사를 깨뜨리면 다음 사람은
     주석을 지운다. 걷어 내고 본다. */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const SRC_CODE = bare(SRC);

test('★★ 옛 네이버 주소로 되돌아가지 않는다 — 열쇠를 새로 받을 수조차 없다', () => {
  const all = SRC_CODE;   /* 상수 선언은 함수 «밖»에 있으므로 파일 전체를 본다 */
  assert.ok(!/openapi\.naver\.com/.test(all),
    '★★ openapi.naver.com 은 2026-07-31 부로 신규 신청이 끝났습니다 — '
    + '되돌아가면 열쇠가 없어 401 만 납니다');
  assert.match(all, /naverapihub\.apigw\.ntruss\.com/,
    '★★ 새 주소(NAVER API HUB)가 없습니다');
});

test('★★ 새 인증 헤더를 쓴다 — 옛 헤더는 새 문에서 안 먹는다', () => {
  assert.match(fn, /"X-NCP-APIGW-API-KEY-ID"/, '★★ 새 열쇠 이름 헤더가 없습니다');
  assert.match(fn, /"X-NCP-APIGW-API-KEY"/, '★★ 새 열쇠 헤더가 없습니다');
  assert.ok(!/X-Naver-Client-(Id|Secret)/.test(fn),
    '★★ 옛 헤더가 남아 있습니다 — 새 문은 이 이름을 모릅니다(401)');
});

test('★ 새 경로 꼴이다 — /search/v1/<갈래> (옛 꼴은 /v1/search/<갈래>.json)', () => {
  assert.match(fn, /"\/search\/v1\/" \+ kind/,
    '★★ 경로가 옛 꼴이면 404 가 납니다 — 주소만 바꾸고 경로를 놓치기 쉽습니다');
  assert.ok(!/\.json\?/.test(fn), '★ 옛 꼴의 .json 꼬리가 남아 있습니다');
});

test('★ 주소를 «한 자리»에만 적는다 — 두 곳이면 한쪽만 고치는 날이 온다', () => {
  const n = (SRC_CODE.match(/naverapihub\.apigw\.ntruss\.com/g) || []).length;
  assert.strictEqual(n, 1, '★ 주소가 ' + n + '군데 있습니다 — 상수 하나로 모으십시오');
});

test('★ display 는 5 를 넘지 않는다 — 지역 검색의 최대값이다', () => {
  /* 웹문서는 100 까지 되지만 지역은 5 다. 넘겨 보내면 지역 쪽이 400 으로 떨어진다. */
  const m = fn.match(/display:\s*"(\d+)"/);
  assert.ok(m, 'display 를 안 넘기고 있습니다 (지역 기본값은 1 이라 한 건만 옵니다)');
  assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= 5,
    '★ display ' + m[1] + ' 은 지역 검색 최대값 5 를 넘습니다 — 400 이 납니다');
});
