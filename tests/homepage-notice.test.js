'use strict';
/* 공지사항 자동 브리핑 — 매일 아침 저절로 올라간다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 「노동뉴스 + 법령 완전자동」.

   ★ 자동이라 «사람이 못 막는다». 그래서 여기서 못 박는 것이 특히 중요하다:
     ① 기사 «본문»은 안 옮긴다 — 제목과 링크까지다(저작권).
     ② 노동과 무관한 기사는 거른다(RSS 에 다른 매체 글이 섞여 온다 — 실제로 봤다).
     ③ 실을 것이 없으면 «아무것도 만들지 않는다» — 빈 브리핑을 올리면 그날 공지가 빈 껍데기다.
     ④ 있던 글은 «건드리지 않는다» — 조회수 같은 우리가 모르는 것이 지워지면 안 된다.
     ⑤ 새 글의 조회수는 0 에서 시작한다.
   실행: node --test tests/homepage-notice.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const B = require(path.join(R, 'functions', 'news-brief.js'));
/* 공지 그리기는 «서버에서만» 쓴다 — 완전 자동이라 화면에서 그릴 일이 없고,
   함수는 배포할 때 functions/ 안만 싣는다(js/ 에 두면 서버가 못 읽는다). */
const N = require(path.join(R, 'functions', 'notice-lib.js'));

const 목록쪽 = fs.readFileSync(path.join(R, 'site', 'notice', 'index.html'), 'utf8');
const 글쪽 = fs.readFileSync(path.join(R, 'site', 'notice', '139', 'index.html'), 'utf8');

function 뭉치기(s) {
  return String(s).replace(/>\s+/g, '>').replace(/\s+</g, '<').replace(/\s+/g, ' ');
}

/* ══════ 샘 읽기 ══════ */

test('★ 노동과 «무관한» 기사는 거른다 — 자동이라 사람이 못 막는다', () => {
  const xml = ['<rss><channel>',
    '<item><title>최저임금 인상 논의</title><link>https://a.kr/1</link><pubDate>2026-08-31</pubDate></item>',
    '<item><title>연예인 결혼 소식</title><link>https://a.kr/2</link><pubDate>2026-08-31</pubDate></item>',
    '<item><title>산업재해 예방 대책</title><link>https://a.kr/3</link><pubDate>2026-08-31</pubDate></item>',
    '</channel></rss>'].join('');
  const 글 = B.뉴스읽기(xml, '아무신문');
  assert.equal(글.length, 2, '★ 노동과 무관한 기사가 섞였다: ' + 글.map(x => x.제목).join(' / '));
  assert.ok(글.every(x => x.제목.indexOf('연예인') < 0), '★ 엉뚱한 기사가 남았다');
  assert.equal(글[0].언론사, '아무신문', '어디 기사인지 안 담았다');
});

test('★ 주소가 «진짜 링크»가 아닌 것은 버린다', () => {
  const xml = '<rss><item><title>노동 소식</title><link>javascript:alert(1)</link></item>'
    + '<item><title>근로 소식</title><link></link></item></rss>';
  assert.equal(B.뉴스읽기(xml, '').length, 0, '★ 엉뚱한 주소를 링크로 실었다');
});

test('★ 법령을 읽고, 겹치면 하나로 모아 «공포일이 가까운 것»부터 놓는다', () => {
  const xml = ['<LawSearch>',
    '<law id="1"><법령명한글><![CDATA[근로기준법]]></법령명한글><법령구분명>법률</법령구분명>',
    '<제개정구분명>일부개정</제개정구분명><공포일자>20260101</공포일자><시행일자>20260701</시행일자>',
    '<소관부처명>고용노동부</소관부처명><법령상세링크>/DRF/a</법령상세링크></law>',
    '<law id="2"><법령명한글><![CDATA[산업안전보건법]]></법령명한글><법령구분명>법률</법령구분명>',
    '<제개정구분명>타법개정</제개정구분명><공포일자>20260825</공포일자><시행일자>20260901</시행일자>',
    '<소관부처명>고용노동부</소관부처명><법령상세링크>/DRF/b</법령상세링크></law>',
    '<law id="3"><법령명한글><![CDATA[근로기준법]]></법령명한글><공포일자>20260101</공포일자></law>',
    '</LawSearch>'].join('');
  const 법 = B.법령읽기(xml);
  assert.equal(법.length, 3, '읽은 법령 수가 다르다');
  const 추린것 = B.법령추리기(법, 5);
  assert.equal(추린것.length, 2, '★ 같은 법령이 두 번 실렸다');
  assert.equal(추린것[0].이름, '산업안전보건법', '★ 공포일이 가까운 것이 앞에 안 왔다');
  assert.equal(B.날짜꼴('20260825'), '2026-08-25');
});

/* ══════ 브리핑 만들기 ══════ */

const 뉴스보기 = [{ 제목: '최저임금 논의', 링크: 'https://a.kr/1', 언론사: '아무신문' }];
const 법령보기 = [{ 이름: '근로기준법', 구분: '법률', 고친결: '일부개정',
                   공포일: '20260825', 시행일: '20260901', 부처: '고용노동부', 링크: '/DRF/a' }];

test('★ 기사 «본문»은 싣지 않는다 — 제목과 링크까지다 (저작권)', () => {
  const 기사 = { 제목: '최저임금 논의', 링크: 'https://a.kr/1', 언론사: '아무신문',
                 요약: '이것은 신문사가 쓴 기사 본문 요약입니다. 옮기면 안 된다.' };
  const b = B.브리핑([기사], [], '2026-08-31');
  assert.ok(b.본문.indexOf('최저임금 논의') > 0, '제목은 실어야 한다');
  assert.ok(b.본문.indexOf('https://a.kr/1') > 0, '원문으로 가는 길이 있어야 한다');
  assert.ok(b.본문.indexOf('신문사가 쓴 기사 본문') < 0,
    '★ 기사 본문을 옮겼다 — 저작권 침해다');
  assert.match(b.본문, /본문은 각 언론사/, '어디서 읽는지 안 알린다');
});

test('★ 실을 것이 «하나도 없으면» 아무것도 만들지 않는다 — 빈 껍데기를 올리지 않게', () => {
  assert.equal(B.브리핑([], [], '2026-08-31'), null, '★ 빈 브리핑을 만들었다');
  assert.equal(B.브리핑(null, null, '2026-08-31'), null);
  assert.ok(B.브리핑(뉴스보기, [], '2026-08-31'), '뉴스만 있어도 만들어야 한다');
  assert.ok(B.브리핑([], 법령보기, '2026-08-31'), '법령만 있어도 만들어야 한다');
});

test('★ 꺾쇠가 든 제목을 넣어도 태그가 되지 않는다', () => {
  const b = B.브리핑([{ 제목: '<script>나쁜것</script>', 링크: 'https://a.kr/1', 언론사: '' }],
    [], '2026-08-31');
  assert.ok(b.본문.indexOf('<script>나쁜것') < 0, '★ 넣은 글자가 스크립트가 됐다');
  assert.match(b.본문, /&lt;script&gt;/, '꺾쇠를 안 감쌌다');
});

test('★ 브리핑에 «날짜»가 있고, 법령은 공포일·시행일을 함께 적는다', () => {
  const b = B.브리핑(뉴스보기, 법령보기, '2026-08-31');
  assert.match(b.제목, /2026-08-31/, '제목에 날짜가 없다 — 어느 날 것인지 모른다');
  assert.match(b.본문, /공포 2026-08-25/, '공포일이 없다');
  assert.match(b.본문, /시행 2026-09-01/, '★ 시행일이 없다 — 언제부터인지가 가장 중요하다');
  assert.match(b.본문, /law\.go\.kr/, '법제처로 가는 길이 없다');
});

/* ══════ 공지 목록·글 쪽 ══════ */

test('★ 지금 목록을 그대로 다시 그리면 «똑같다»', () => {
  const 글 = N.글읽기(목록쪽);
  assert.ok(글.length >= 3, '읽은 글이 ' + 글.length + '개뿐이다');
  assert.equal(뭉치기(N.목록그리기(목록쪽, 글)), 뭉치기(목록쪽),
    '★ 다시 그린 목록이 지금과 다르다');
});

test('★ 새 글을 얹어도 «있던 글»은 그대로다 — 조회수까지', () => {
  const 글 = N.글읽기(목록쪽);
  const 옛조회 = [...목록쪽.matchAll(/readNum">\s*(\d+)/g)].map(m => m[1]);
  const 새목록 = N.목록그리기(목록쪽,
    [{ 번호: '900', 제목: '브리핑', 날짜: '2026-08-31 07:30:00' }].concat(글));
  const 새조회 = [...새목록.matchAll(/readNum">\s*(\d+)/g)].map(m => m[1]);

  assert.equal(N.글읽기(새목록).length, 글.length + 1, '★ 글이 안 늘었다');
  /* 있던 글의 조회수가 그대로 있어야 한다 */
  옛조회.forEach(n => assert.ok(새조회.indexOf(n) >= 0, '★ 있던 글의 조회수가 사라졌다: ' + n));
  /* ★ 새 글은 0 부터 — 본으로 쓴 줄의 숫자를 물려받으면 첫날부터 「31번 읽음」이 된다 */
  assert.equal(새조회[0], '0', '★ 새 글이 남의 조회수를 물려받았다: ' + 새조회[0]);
  assert.deepEqual(N.글읽기(새목록).map(g => g.차례), ['4', '3', '2', '1'],
    '★ 차례가 위에서부터 큰 수가 아니다');
});

test('★ 실을 글이 하나도 없으면 목록을 «건드리지 않는다»', () => {
  assert.throws(() => N.목록그리기(목록쪽, []), /하나도 없습니다/,
    '★ 빈 목록으로 그려 공지를 통째로 지웠다');
});

test('★ 글 쪽을 만들면 번호·제목·날짜·본문이 다 바뀌고, «틀»은 그대로다', () => {
  const 글 = { 번호: '900', 제목: '노동 뉴스·법령 브리핑 (2026-08-31)',
               날짜: '2026.08.31 07:30', 요약: '법령 1건, 뉴스 2건',
               본문: '<h3>법령 소식</h3><p>시험</p>' };
  const 쪽 = N.글쪽만들기(글쪽, 글);
  assert.ok(쪽.indexOf('BeforeDocument(900,') > 0, '★ 글 번호가 안 바뀌었다');
  assert.ok(쪽.indexOf('BeforeDocument(139,') < 0, '★ 옛 번호가 남았다');
  assert.match(쪽, /<title>푸른노무법인 - 노동 뉴스·법령 브리핑/, '★ 쪽 제목이 안 바뀌었다');
  assert.ok(쪽.indexOf('<h3>법령 소식</h3>') > 0, '★ 본문이 안 들어갔다');
  assert.ok(쪽.indexOf('내용이 들어갈 자리입니다') < 0, '★ 옛 본문이 남았다');
  /* 틀은 그대로 — 머리띠·발·목록으로 가는 길 */
  ['footer', '041-556-0035', '../../notice/'].forEach(표시 =>
    assert.ok(쪽.indexOf(표시) > 0, '★ 글 쪽의 틀(' + 표시 + ')이 사라졌다'));
});

test('★ 본으로 삼을 글 쪽이 아니면 «만들지 않는다»', () => {
  assert.throws(() => N.글쪽만들기('<html>아무 쪽</html>', { 번호: '900', 제목: '가' }),
    /본으로 삼을 글 쪽이 아닙니다/, '★ 엉뚱한 쪽으로 글을 만들었다');
});
