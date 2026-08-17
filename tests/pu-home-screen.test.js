'use strict';
/* 홈페이지 관리 화면이 지켜야 할 것.
   모양이나 개수를 못 박지 않는다 — 검사 하나가 모든 앱 배포를 막은 적이 있다.
   지키는 것은 「관리자만」「자동 전송 없음」처럼 어겨서는 안 되는 약속뿐이다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

test('네 모듈을 모두 부른다', () => {
  ['pu-home-parse', 'pu-home-career', 'pu-home-export', 'pu-home-diff']
    .forEach(n => assert.match(html, new RegExp('<script src="js/' + n + '\\.js\\?v=\\d+">')));
});

test('관리자만 쓸 수 있게 막아둔다', () => {
  assert.match(html, /isAdmin/);
});

test('홈페이지에 글을 쓰는 경로가 없다', () => {
  assert.ok(!/dispBoardWrite[^"']*method|procBoard|act=proc/.test(html),
    '홈페이지에 저장을 보내는 코드가 있으면 안 된다');
  assert.ok(!/document\.forms\[[^\]]*\]\.submit\(\)/.test(html));
});

test('저장할 때 이전 내용을 남긴다', () => {
  assert.match(html, /homepage\/history/);
});

test('줄 모양은 바꿀 수 있게 되어 있다', () => {
  assert.match(html, /lineFormat/);
});

test('대조를 반영하기 전에 믿을 만한지 먼저 묻는다', () => {
  assert.match(html, /PuHomeDiff\.isTrustworthy/,
    '읽어낸 결과를 그대로 반영하면 구조가 바뀐 날 전부 「안 올라감」이 된다');
});

/* ── 위 여섯은 계획서에 적힌 것. 아래는 이 저장소가 이미 데인 자리를 지킨다. ── */

test('앱 스크립트가 문법에 맞는다', () => {
  /* node --check 는 HTML 에 못 쓴다. 대신 <script> 안쪽만 뽑아 파싱해 본다.
     오탈자 하나로 화면 전체가 안 뜨는 것을 배포 전에 잡는다. */
  const blocks = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).filter(s => s.trim());
  assert.ok(blocks.length > 0, '앱 스크립트를 찾지 못했습니다');
  blocks.forEach((code, i) => {
    // eslint-disable-next-line no-new-func
    assert.doesNotThrow(() => new Function(code), '스크립트 ' + (i + 1) + '번째 덩어리가 파싱되지 않습니다');
  });
});

test('앱바를 불러온다 — 오갈 수 없는 섬이 되지 않는다', () => {
  assert.match(html, /js\/pu-appbar\.js/);
});

test('로그인은 포털 한 곳에서 한다', () => {
  assert.match(html, /enter\.html/);
});

test('같은 파이어베이스 프로젝트를 본다', () => {
  assert.match(html, /projectId:\s*'pureun-erp'/);
  assert.match(html, /pureun-erp-default-rtdb\.asia-southeast1/);
});

test('바깥에서 온 글자를 화면에 넣기 전에 이스케이프한다', () => {
  assert.match(html, /function esc\s*\(/);
});

test('★ 못 읽은 것과 「내용이 없는 것」을 가른다', () => {
  /* 읽기 실패를 「안 올라감」으로 몰면 사장님이 멀쩡한 쪽을 다시 붙여넣는다.
     실패한 쪽은 지난 결과를 그대로 두어야 한다. */
  assert.match(html, /res\.ok/, '응답이 성공인지 보지 않고 본문을 읽으면 실패를 빈 값으로 착각한다');
  assert.match(html, /=== null|!== null/, '못 읽음(null)과 빈 값을 가르는 자리가 없습니다');
});

test('★ 겹친 글 번호를 사람에게 알린다', () => {
  assert.match(html, /PuHomeDiff\.duplicateLiveKeys/,
    '홈페이지에 같은 글 번호가 두 번 있으면 사람이 홈페이지를 손봐야 한다');
});

test('★ 딱지의 사유를 감추지 않는다', () => {
  // 동명이인 보류 사유가 reason 에 담겨 온다. 딱지만 보이면 왜 그런지 알 수 없다.
  assert.match(html, /\breason\b/);
});

test('★ 퇴사자 이름이 다른 쪽에 남았는지 훑는다', () => {
  assert.match(html, /PuHomeDiff\.nameLeftovers/);
});

test('★ 감싸기로 내보낼 때 줄에 이미 든 <div> 를 더 세게 경고한다', () => {
  /* 꺾쇠가 든 줄은 안 보일 수 있는 정도지만, 「감싸기」에 <div> 가 겹치면
     짝이 안 맞는 HTML 이 되어 그 뒤 화면 구조가 통째로 깨진다. */
  assert.match(html, /PuHomeExport\.riskyLines/);
  assert.match(html, /function divInLine\s*\(/,
    '「감싸기」와 겹치는 <div> 를 따로 가려내는 자리가 없습니다');
  assert.match(html, /'div'/, '줄 모양이 감싸기인지 보는 자리가 없습니다');
});

test('포털 타일과 즐겨찾기 목록에 등록돼 있다', () => {
  const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
  const appbar = fs.readFileSync(path.join(R, 'js', 'pu-appbar.js'), 'utf8');
  assert.match(enter, /pu-home\.html/);
  assert.match(appbar, /pu-home\.html/);
});
