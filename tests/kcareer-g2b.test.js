'use strict';
/* 나라장터 용역 공고 받아오기 — 대표 지시 2026-09-05, 낱말 8개로 시작 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const G = require('../js/kcareer-g2b.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

/* ───────── 주소 ───────── */

test('★★ 주소에 /ad/ 가 들어간다', () => {
  // 실측 2026-09-05: /ad/ 가 없으면 「해당 오픈API 서비스가 없거나 폐기됨」이 온다.
  // 인터넷에 도는 예제 대부분이 옛 주소라 이 검사를 지우면 다시 그리로 돌아간다.
  assert.match(G.BASE, /\/1230000\/ad\/BidPublicInfoService\//);
});

test('★ https 로 붙는다', () => {
  // github.io 는 https 라 http 로 부르면 혼합콘텐츠로 막힌다
  assert.match(G.BASE, /^https:\/\//);
});

test('조회 구간을 열두 자리로 만든다', () => {
  const u = G.buildUrl({ key: 'abc', from: '2026-09-01', to: '2026-09-05' });
  assert.match(u, /inqryBgnDt=202609010000/);
  assert.match(u, /inqryEndDt=202609052359/, '끝날은 그날 23:59까지 봐야 그날 것이 다 들어온다');
  assert.match(u, /type=json/);
  assert.match(u, /inqryDiv=1/);
});

test('쪽·건수 기본값이 있다', () => {
  const u = G.buildUrl({ key: 'abc', from: '2026-09-01', to: '2026-09-01' });
  assert.match(u, /pageNo=1/);
  assert.match(u, /numOfRows=999/);
});

/* ───────── ★ 인증키 함정 ───────── */

test('★★ 이미 인코딩된 열쇠를 다시 인코딩하지 않는다', () => {
  // 공공데이터포털은 열쇠를 Encoding·Decoding 두 벌로 준다.
  // 인코딩된 것을 또 인코딩하면 %2B → %252B 가 되어 영영 안 붙는다.
  assert.equal(G.encKey('AAA%2BBBB%3D%3D'), 'AAA%2BBBB%3D%3D');
  assert.ok(G.encKey('AAA%2BBBB%3D%3D').indexOf('%25') < 0, '두 번 인코딩되면 안 됩니다');
});

test('날것 열쇠는 인코딩해 준다', () => {
  assert.equal(G.encKey('AAA+BBB=='), 'AAA%2BBBB%3D%3D');
});

test('열쇠가 없으면 빈 글자', () => {
  assert.equal(G.encKey(''), '');
  assert.equal(G.encKey(null), '');
});

/* ───────── 응답 풀기 ───────── */

const ITEM = {
  bidNtceNo: '20260903102', bidNtceOrd: '00',
  bidNtceNm: '노사관계 안정화 지원 노무자문 용역',
  ntceInsttNm: '충청남도', dminsttNm: '충청남도경제진흥원',
  bidNtceDt: '2026-09-03 10:00:00', bidClseDt: '2026-09-11 14:00:00',
  presmptPrce: '36000000', cntrctCnclsMthdNm: '제한경쟁',
  bidNtceDtlUrl: 'https://www.g2b.go.kr/x'
};

test('정상 응답을 푼다', () => {
  const r = G.parse({ response: { header: { resultCode: '00' },
    body: { totalCount: 1, items: [ITEM] } } });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].no, '20260903102-00');
  assert.equal(r.rows[0].org, undefined, 'parse 단계에서는 inst 로 담는다');
  assert.equal(r.rows[0].inst, '충청남도경제진흥원', '수요기관을 먼저 본다');
  assert.equal(r.rows[0].prc, 36000000);
});

test('items 가 배열이 아니라 하나여도 받는다', () => {
  const r = G.parse({ response: { header: { resultCode: '00' }, body: { items: ITEM } } });
  assert.equal(r.rows.length, 1);
});

test('items 가 {item:[...]} 로 감싸여 와도 받는다', () => {
  const r = G.parse({ response: { header: { resultCode: '00' }, body: { items: { item: [ITEM] } } } });
  assert.equal(r.rows.length, 1);
});

test('공고가 없으면 빈 목록', () => {
  const r = G.parse({ response: { header: { resultCode: '00' }, body: { totalCount: 0 } } });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 0);
});

test('★ 열쇠가 틀리면 까닭을 그대로 알려 준다', () => {
  const r = G.parse({ OpenAPI_ServiceResponse: { cmmMsgHeader: {
    errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnAuthMsg: '등록되지 않은 서비스키' } } });
  assert.equal(r.ok, false);
  assert.match(r.err, /등록되지 않은 서비스키/, '「실패」로만 알리면 무엇을 고칠지 모른다');
});

test('오류 코드가 오면 실패로 본다', () => {
  const r = G.parse({ response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' } } });
  assert.equal(r.ok, false);
});

/* ───────── 낱말 걸러내기 ───────── */

test('대표가 고른 낱말은 여덟 개다', () => {
  assert.deepEqual(G.KEYWORDS_DEFAULT,
    ['노무', '인사', '고용', '임금', '컨설팅', '일터혁신', '노사', '교육']);
});

test('공고명에서 낱말을 찾는다', () => {
  assert.deepEqual(G.matched({ nm: '노사관계 안정화 지원 노무자문 용역' }), ['노무', '노사']);
});

test('띄어쓰기가 있어도 걸린다', () => {
  assert.deepEqual(G.matched({ nm: '2026년 일터 혁신 상생컨설팅 위탁운영' }), ['컨설팅', '일터혁신']);
});

test('★ 상관없는 공고는 걸리지 않는다', () => {
  // 나라장터 용역은 하루 수백 건이다. 안 걸러내면 쓸 수 없는 화면이 된다.
  assert.deepEqual(G.matched({ nm: '교통약자 이동지원차량 운영 용역' }), []);
});

/* ───────── 마감까지 ───────── */

test('마감까지 며칠인지 센다', () => {
  assert.equal(G.dday('2026-09-11 14:00:00', '2026-09-03 10:00:00'), 9);
});

test('지난 공고는 음수로 나온다', () => {
  assert.ok(G.dday('2026-09-01 18:00:00', '2026-09-05 10:00:00') < 0);
});

test('마감일을 모르면 null — 0으로 속이지 않는다', () => {
  assert.equal(G.dday('', '2026-09-05'), null);
});

/* ───────── 합치기 ───────── */

test('낱말에 걸린 것만 새로 담는다', () => {
  const rows = G.parse({ response: { header: { resultCode: '00' }, body: { items: [
    ITEM, Object.assign({}, ITEM, { bidNtceNo: '9999', bidNtceNm: '교통약자 이동지원차량 운영 용역' })
  ] } } }).rows;
  const m = G.merge([], rows, null, '2026-09-03');
  assert.equal(m.adds.length, 1);
  assert.equal(m.unmatched, 1);
  assert.equal(m.adds[0].kw, '노무,노사');
  assert.equal(m.adds[0].type, '새 공고');
  assert.equal(m.adds[0].org, '충청남도경제진흥원');
  assert.equal(m.adds[0].dday, 9);
});

test('★ 이미 받은 공고는 다시 만들지 않는다', () => {
  const rows = G.parse({ response: { header: { resultCode: '00' }, body: { items: [ITEM] } } }).rows;
  const m = G.merge([{ no: '20260903102-00', type: '관심' }], rows, null, '2026-09-03');
  assert.equal(m.adds.length, 0, '⭐관심·메모를 적어 둔 줄을 덮으면 안 됩니다');
  assert.equal(m.skipped, 1);
});

test('한 번에 받은 것 안에서도 겹치면 하나만 담는다', () => {
  const rows = G.parse({ response: { header: { resultCode: '00' }, body: { items: [ITEM, ITEM] } } }).rows;
  assert.equal(G.merge([], rows, null, '2026-09-03').adds.length, 1);
});

/* ───────── kcareer.html 배선 ───────── */

test('나라장터 모듈을 외부 파일로 로드한다', () => {
  assert.match(source, /<script src="js\/kcareer-g2b\.js(\?v=\d+)?"><\/script>/);
});

test('나라장터 화면과 메뉴가 있다', () => {
  assert.match(source, /<section class="page-view" id="page-g2b"/);
  assert.match(source, /\['page-g2b','나라장터 공고'\]/);
  assert.match(source, /g2b:\{store:'g2b'/);
});

test('★ 유실 감지가 나라장터 공고를 센다', () => {
  const m = source.match(/var FB_COUNT_KEYS=\[[^\]]*\]/);
  assert.ok(m);
  assert.match(m[0], /'g2b'/);
});

test('★ 하루 1,000회 제한을 지킨다 — 화면 열 때마다 부르지 않는다', () => {
  const m = source.match(/function g2bAuto\([\s\S]*?\n\}/);
  assert.ok(m, 'g2bAuto 가 있어야 합니다');
  assert.match(m[0], /g2b_last/, '마지막으로 받은 날을 기억해야 합니다');
});

test('인증키 넣는 칸이 있다', () => {
  assert.match(source, /id="apiG2B"/);
  assert.match(source, /g2b_key/);
});
