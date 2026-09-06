'use strict';
/* 기업마당(중기부) 지원사업 공고 — 정부사업신청 앱의 순수 모듈
   대표 승인 2026-09-05 「순서로」: 개별 기관 크롤링 전에 이미 열려 있는 API 부터. */
const test = require('node:test');
const assert = require('node:assert/strict');

const B = require('../js/gov-bizinfo.js');

/* ───────── 주소 ───────── */

test('★★ 인증키 파라미터는 crtfcKey 다 — serviceKey 가 아니다', () => {
  // 나라장터(공공데이터포털)는 serviceKey, 기업마당은 자체 발급 crtfcKey 다.
  // 헷갈리면 「존재하지 않는 인증키」만 계속 온다(실측 2026-09-05).
  const u = B.buildUrl({ key: 'ABC' });
  assert.match(u, /crtfcKey=ABC/);
  assert.ok(u.indexOf('serviceKey') < 0, 'serviceKey 를 쓰면 안 됩니다');
});

test('★ https 로 붙고 주소가 기업마당이다', () => {
  assert.match(B.BASE, /^https:\/\/www\.bizinfo\.go\.kr\/uss\/rss\/bizinfoApi\.do$/);
});

test('json 으로 받는다', () => {
  assert.match(B.buildUrl({ key: 'k' }), /dataType=json/);
});

test('분야를 하나씩 지정한다', () => {
  // ⚠ searchLclasId 는 단수다 — 부르는 쪽이 03·07 을 돌려 가며 부른다
  assert.match(B.buildUrl({ key: 'k', field: '03' }), /searchLclasId=03/);
  assert.ok(B.buildUrl({ key: 'k' }).indexOf('searchLclasId') < 0, '안 주면 안 붙는다');
});

test('지역 해시태그를 붙인다', () => {
  const u = B.buildUrl({ key: 'k', regions: ['충남', '세종'] });
  assert.match(u, /hashtags=/);
  assert.match(decodeURIComponent(u), /hashtags=충남,세종/);
});

test('지역을 안 주면 전국이 온다 — 해시태그를 안 붙인다', () => {
  assert.ok(B.buildUrl({ key: 'k' }).indexOf('hashtags') < 0);
});

test('대표 기본값은 인력·경영, 충남·세종·대전·충북이다', () => {
  assert.deepEqual(B.FIELDS_DEFAULT, ['03', '07']);
  assert.equal(B.FIELDS['03'], '인력');
  assert.equal(B.FIELDS['07'], '경영');
  assert.deepEqual(B.REGIONS_DEFAULT, ['충남', '세종', '대전', '충북']);
});

/* ───────── 신청기간 ───────── */

test('신청기간 「20220727 ~ 20220930」을 푼다', () => {
  assert.deepEqual(B.period('20220727 ~ 20220930'),
    { start: '2022-07-27', end: '2022-09-30' });
});

test('한쪽만 있으면 시작만 담고 마감은 비운다', () => {
  assert.deepEqual(B.period('20220727'), { start: '2022-07-27', end: '' });
});

test('★ 상시 접수처럼 날짜가 없으면 «모른다»로 둔다', () => {
  // 0 이나 오늘 날짜로 채우면 「마감 지남」으로 잘못 보인다
  assert.deepEqual(B.period(''), { start: '', end: '' });
  assert.deepEqual(B.period('상시'), { start: '', end: '' });
});

/* ───────── 응답 풀기 ───────── */

const ITEM = {
  seq: 'PBLN_000000000080236',
  title: '2026년 일터혁신 상생컨설팅 지원사업 수행기관 모집',
  link: 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=PBLN_000000000080236',
  author: '중소벤처기업부',
  excInsttNm: '소상공인시장진흥공단',
  description: '노무관리 개선 컨설팅을 지원합니다.',
  lcategory: '인력',
  pubDate: '2026-09-02 15:38:29',
  reqstDt: '20260902 ~ 20260930',
  trgetNm: '중소기업'
};

test('정상 응답을 푼다', () => {
  const r = B.parse({ jsonArray: [ITEM] });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  const x = r.rows[0];
  assert.equal(x.no, 'PBLN_000000000080236');
  assert.equal(x.nm, '2026년 일터혁신 상생컨설팅 지원사업 수행기관 모집');
  assert.equal(x.closeDt, '2026-09-30');
  assert.equal(x.openDt, '2026-09-02');
  assert.equal(x.src, '기업마당', '어디서 왔는지 표에 밝힌다');
});

test('★ 수행기관을 먼저 보여 준다 — 서류를 실제로 받는 곳이다', () => {
  const x = B.parse({ jsonArray: [ITEM] }).rows[0];
  assert.equal(x.inst, '소상공인시장진흥공단');
  assert.equal(x.ntce, '중소벤처기업부', '소관기관은 따로 남긴다');
});

test('RSS 를 옮긴 모양으로 와도 받는다', () => {
  assert.equal(B.parse({ rss: { channel: { item: [ITEM] } } }).rows.length, 1);
  assert.equal(B.parse({ channel: { item: ITEM } }).rows.length, 1);
});

test('★ 인증키가 틀리면 까닭을 그대로 알려 준다', () => {
  // 실측 응답: {"reqErr":"존재하지 않는 인증키 입니다."}
  const r = B.parse({ reqErr: '존재하지 않는 인증키 입니다.' });
  assert.equal(r.ok, false);
  assert.match(r.err, /인증키/, '「실패」로만 알리면 무엇을 고칠지 모른다');
});

test('★ 목록을 못 찾으면 지어내지 않고 실패로 돌린다', () => {
  const r = B.parse({ something: 'else' });
  assert.equal(r.ok, false);
  assert.equal(r.rows.length, 0);
});

test('공고ID 가 없는 줄은 버린다', () => {
  const r = B.parse({ jsonArray: [ITEM, { title: '번호 없는 것' }] });
  assert.equal(r.rows.length, 1);
});

test('★ 지원사업에는 추정가격이 없다 — 0 으로 두고 지어내지 않는다', () => {
  assert.equal(B.parse({ jsonArray: [ITEM] }).rows[0].prc, 0);
});
