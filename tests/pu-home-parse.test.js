'use strict';
/* 홈페이지 화면 읽어내기.
   표본은 2026-08-16 에 받아둔 백업이다 — 고정된 파일이라 개수를 단정해도 된다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const BK = path.join(R, 'docs', 'homepage-backup', '2026-08-16');

function load() {
  const ctx = { window: undefined, globalThis: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-parse.js'), 'utf8'), ctx);
  return ctx.globalThis.PuHomeParse;
}
const P = load();
const people = fs.readFileSync(path.join(BK, 'people.html'), 'utf8');

test('구성원을 모두 읽어낸다', () => {
  const list = P.parseMembers(people);
  assert.equal(list.length, 9);
  // list 는 vm 컨텍스트(다른 realm)에서 만들어진 배열이라 그대로 deepEqual 하면
  // (assert/strict 에서는 deepEqual === deepStrictEqual) 값이 같아도 realm 이 달라
  // 실패한다. 전개(spread)로 이 realm 의 배열로 옮겨 비교한다 — 값·순서·엄격함은 그대로다.
  assert.deepEqual([...list.map(m => m.srl)],
    ['190', '193', '195', '197', '203', '281', '304', '320', '322']);
});

test('이름과 직책을 나눠 읽는다', () => {
  const m = P.parseMembers(people).find(x => x.srl === '190');
  assert.equal(m.name, '권형하');
  assert.equal(m.position1, '대표');
  assert.equal(m.position2, '공인노무사');
});

test('직책이 하나뿐인 사람도 읽는다', () => {
  const m = P.parseMembers(people).find(x => x.srl === '193');
  assert.equal(m.name, '박성수');
  assert.equal(m.position1, '');
  assert.equal(m.position2, '공인노무사');
});

test('경력사항을 줄 목록으로 읽고 겹공백을 정리한다', () => {
  const m = P.parseMembers(people).find(x => x.srl === '190');
  assert.equal(m.careers[0], '現 푸른노무법인대표');
  assert.ok(m.careers.length > 10);
  assert.ok(m.careers.every(line => !/<|>/.test(line)), '태그가 남아 있으면 안 된다');
  assert.ok(m.careers.every(line => line === line.trim() && !/\s{2}/.test(line)));
});

test('쪽 본문을 글자로 읽어낸다', () => {
  const work1 = fs.readFileSync(path.join(BK, 'work1.html'), 'utf8');
  const text = P.parsePageText(work1);
  assert.match(text, /법률자문/);
  assert.ok(!/<div/.test(text), '태그가 남아 있으면 안 된다');
  assert.ok(!/메뉴 건너뛰기/.test(text), '머리말·메뉴는 빠져야 한다');
});

test('tidy() 는 주석 안에 태그가 들어 있어도 통째로 걷어낸다', () => {
  const s = '앞글 <!-- <a href="https://푸른노무법인.kr/partner_board/185" data-srl="185"></a> --> 뒷글';
  const out = P.tidy(s);
  assert.equal(out, '앞글 뒷글');
  assert.ok(!/-->/.test(out), '주석 닫는 표시가 남으면 안 된다');
  assert.ok(!/<!--/.test(out), '주석 여는 표시가 남으면 안 된다');
});

test('partner.html 을 읽어도 주석 찌꺼기가 남지 않는다', () => {
  const partner = fs.readFileSync(path.join(BK, 'partner.html'), 'utf8');
  const text = P.parsePageText(partner);
  assert.ok(!/-->/.test(text), '주석 닫는 표시가 남으면 안 된다');
  assert.ok(!/<!--/.test(text), '주석 여는 표시가 남으면 안 된다');
});

/* --- parsePageLines: 쪽 글을 홈페이지와 같은 줄 모양으로 --- */

test('parsePageLines — work1.html 을 홈페이지와 같은 순서·같은 줄로 읽는다 (19줄)', () => {
  /* 설계 문서(2026-08-17)는 이 표본으로 20줄을 「확인된 결과」로 적어 두었다.
     실제로 짚어보면 19줄이다 — 설계 문서가 가리키는 알고리즘은 «bh_page_widget_inner»
     표시를 찾은 자리에서 바로 자르며, 그러면 첫 줄에 'bh_page_widget_inner">' 라는
     찌꺼기가 하나 더 끼어 20줄이 된다. 설계 문서 자신이 바로 그 찌꺼기를
     "반드시 걸러내십시오" 라고 지시하고 있으므로(§1), 찌꺼기를 걷어낸 뒤의 진짜 줄 수인
     19를 여기 못 박는다 — 20은 그 버그가 섞인 채로 잰 숫자로 보인다.
     내용 순서(자문서비스 / 01 / 법률자문)는 설계 문서와 정확히 같다. */
  const work1 = fs.readFileSync(path.join(BK, 'work1.html'), 'utf8');
  const lines = P.parsePageLines(work1);
  assert.equal(lines.length, 19);
  assert.equal(lines[0], '자문서비스');
  assert.equal(lines[1], '01');
  assert.equal(lines[2], '법률자문');
});

test('parsePageLines — 어느 줄에도 태그·주석 찌꺼기·CSS 조각·메뉴 글자가 없다', () => {
  const work1 = fs.readFileSync(path.join(BK, 'work1.html'), 'utf8');
  const lines = P.parsePageLines(work1);
  lines.forEach((line) => {
    assert.ok(!/[<>]/.test(line), '태그 조각: ' + line);
    assert.ok(!/-->/.test(line), '주석 닫는 표시: ' + line);
    assert.ok(!/position:/.test(line), 'CSS 조각: ' + line);
    assert.ok(!/메뉴 건너뛰기/.test(line), '머리말·메뉴 글자: ' + line);
  });
});

test('parsePageLines — 첫 줄에 bh_page_widget_inner 표시 조각이 섞이지 않는다', () => {
  const work1 = fs.readFileSync(path.join(BK, 'work1.html'), 'utf8');
  const lines = P.parsePageLines(work1);
  assert.ok(!/bh_page_widget_inner/.test(lines[0] || ''));
});

test('parsePageLines — inquiry.html 은 지사마다 줄이 나뉜다 (20줄)', () => {
  /* work1.html 검사와 같은 이유로 20줄을 못 박는다(설계 문서의 21은 찌꺼기 한 줄이
     섞인 숫자로 보인다). 지사별 주소·전화가 각각 다른 줄인 것은 설계 문서 그대로다. */
  const inquiry = fs.readFileSync(path.join(BK, 'inquiry.html'), 'utf8');
  const lines = P.parsePageLines(inquiry);
  assert.equal(lines.length, 20);

  const iName = lines.indexOf('천안본사');
  const iAddr = lines.indexOf('충남 천안시 서북구 원두정8길 6, 301호(두정빌딩)');
  const iTel = lines.indexOf('T. 041-556-0035');
  assert.ok(iName !== -1 && iAddr !== -1 && iTel !== -1, '세 줄을 모두 찾아야 한다');
  assert.ok(iName < iAddr && iAddr < iTel, '천안본사 / 주소 / 전화 순서로 각각 다른 줄이어야 한다');
});

test('parsePageLines — bh_page_widget_inner 가 없는 쪽(예: 게시판형)은 빈 줄을 돌려준다', () => {
  /* 머리말·메뉴만 남는 페이지를 «틀린 줄»로 조용히 내주는 대신, 못 읽었다는 뜻으로
     빈 배열을 돌려준다. notice.html(공지사항 게시판)이 실제로 이 모양이다. */
  const notice = fs.readFileSync(path.join(BK, 'notice.html'), 'utf8');
  // vm 컨텍스트(다른 realm)에서 만든 빈 배열은 전개(spread)로 이 realm 으로 옮겨 비교한다.
  assert.deepEqual([...P.parsePageLines(notice)], []);
});
