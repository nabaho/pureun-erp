'use strict';
/* 알리오(공공기관) 채용·위촉 공고 — 정부사업신청 앱의 순수 모듈 */
const test = require('node:test');
const assert = require('node:assert/strict');

const A = require('../js/gov-alio.js');

/* ───────── 주소 ───────── */

test('★★ 주소는 /1051000/recruitment/list 다', () => {
  // 실측 2026-09-05: /recruit/list · /recruitment_v2/list 는
  // 「해당 오픈API 서비스가 없거나 폐기됨」이 온다. 이 검사를 지우면 다시 헤맨다.
  assert.equal(A.BASE, 'https://apis.data.go.kr/1051000/recruitment/list');
});

test('★ 열쇠는 공공데이터포털 것 — 나라장터와 같은 것을 쓴다', () => {
  assert.match(A.buildUrl({ key: 'ABC' }), /serviceKey=ABC/);
});

test('★★ 이미 인코딩된 열쇠를 다시 인코딩하지 않는다', () => {
  assert.equal(A.encKey('AAA%2BBBB%3D%3D'), 'AAA%2BBBB%3D%3D');
  assert.equal(A.encKey('AAA+BBB=='), 'AAA%2BBBB%3D%3D');
});

test('쪽·건수와 형식이 붙는다', () => {
  const u = A.buildUrl({ key: 'k' });
  assert.match(u, /resultType=json/);
  assert.match(u, /pageNo=1/);
  assert.match(u, /numOfRows=100/);
});

test('공고중만 보기는 끌 수 있다', () => {
  assert.match(A.buildUrl({ key: 'k', ongoingOnly: true }), /ongoingYn=Y/);
  assert.ok(A.buildUrl({ key: 'k' }).indexOf('ongoingYn') < 0, '안 주면 안 붙는다');
});

/* ───────── 날짜 ───────── */

test('YYYYMMDD 를 사람이 읽는 꼴로 바꾼다', () => {
  assert.equal(A.ymd('20260917'), '2026-09-17');
  assert.equal(A.ymd('2026-09-17'), '2026-09-17', '이미 하이픈이면 그대로');
  assert.equal(A.ymd(''), '', '없으면 지어내지 않는다');
});

/* ───────── 응답 풀기 ───────── */

const ITEM = {
  recrutPblntSn: '123456',
  recrutPbancTtl: '2026년 노무고문 위촉 공개모집',
  instNm: '코레일유통(주)',
  pbancBgngYmd: '20260903',
  pbancEndYmd: '20260917',
  recrutSeNm: '경력',
  workRgnNmLst: '서울',
  recrutNope: '2',
  srcUrl: 'https://job.alio.go.kr/recruitview.do?idx=123456'
};

test('정상 응답을 푼다', () => {
  const r = A.parse({ response: { body: { totalCount: 1, items: [ITEM] } } });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  const x = r.rows[0];
  assert.equal(x.no, '123456');
  assert.equal(x.nm, '2026년 노무고문 위촉 공개모집');
  assert.equal(x.inst, '코레일유통(주)');
  assert.equal(x.openDt, '2026-09-03');
  assert.equal(x.closeDt, '2026-09-17');
  assert.equal(x.src, '알리오', '어디서 왔는지 표에 밝힌다');
});

test('판이 달라도 받는다 — result·items·data 자리를 다 본다', () => {
  assert.equal(A.parse({ result: [ITEM] }).rows.length, 1);
  assert.equal(A.parse({ items: { item: ITEM } }).rows.length, 1);
  assert.equal(A.parse({ data: [ITEM] }).rows.length, 1);
});

test('★ 열쇠가 틀리면 까닭을 그대로 알려 준다', () => {
  const r = A.parse({ OpenAPI_ServiceResponse: { cmmMsgHeader: {
    errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnAuthMsg: '등록되지 않은 서비스키' } } });
  assert.equal(r.ok, false);
  assert.match(r.err, /등록되지 않은 서비스키/);
});

test('★ 목록을 못 찾으면 지어내지 않고 실패로 돌린다', () => {
  const r = A.parse({ something: 'else' });
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0);
});

test('★ 채용·위촉에는 추정가격이 없다 — 0 으로 두고 지어내지 않는다', () => {
  assert.equal(A.parse({ result: [ITEM] }).rows[0].prc, 0);
});

/* ───────── ★ 칸 이름 후보 ───────── */

test('★★ 칸 이름 후보를 하나로 줄이지 않는다', () => {
  // 알리오 응답 칸 이름은 공개 문서로 안 나온다(신청 페이지 안에 있다).
  // 후보를 하나로 줄였다가 틀리면 목록이 «통째로» 빈다.
  ['no', 'nm', 'inst', 'openDt', 'closeDt'].forEach((k) => {
    assert.ok(A.CAND[k].length >= 2, k + ' 후보가 둘 이상이어야 합니다');
  });
});

test('후보 중 뒤쪽 이름으로 와도 알아본다', () => {
  const r = A.parse({ result: [{ id: 'X1', title: '위원 공개모집', orgNm: '○○공단',
    startDate: '20260901', endDate: '20260930', link: 'https://x' }] });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].nm, '위원 공개모집');
  assert.equal(r.rows[0].closeDt, '2026-09-30');
});

test('★ 열쇠가 오면 무엇을 못 알아봤는지 알려 준다', () => {
  // 첫 실제 호출 때 이걸로 확인하고, 못 알아본 칸 이름을 CAND 에 «더한다».
  const p = A.probe(ITEM);
  assert.ok(p.miss.indexOf('nm') < 0, '아는 칸은 got 에 들어간다');
  const p2 = A.probe({ 전혀: '모르는', 이름: '들' });
  assert.ok(p2.miss.indexOf('nm') >= 0, '모르는 칸은 miss 로 알려 준다');
  assert.deepEqual(p2.keys, ['전혀', '이름'], '실제로 온 칸 이름을 그대로 보여 준다');
});
