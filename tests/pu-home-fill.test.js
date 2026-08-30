'use strict';
/* 홈페이지 편집 화면 「채우기」 단추 (대표 결정 2026-08-30)

   서버가 대신 로그인해 쓰는 방식 대신 단추로 간다. 이유는 정찰에서 나왔다 —
   얼굴 사진이 «숨은 칸» 안에 있어서, 서버가 경력사항만 보내면 사진이 지워진 채
   저장되고 오류도 안 난다. 단추는 이미 열려 있는 화면을 쓰므로 그 길이 없다.

   ★ 이 검사가 지키는 것은 하나다: **엉뚱한 곳에 쓰지 않는다.**
     못 찾으면 다른 칸에 쓰지 말고 «아무것도 하지 않고» 멈춰야 한다.

   실행: node --test tests/*.test.js
   (이 환경의 node 는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob 으로.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

function load() {
  const win = {};
  const ctx = { window: win, document: undefined };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-fill.js'), 'utf8'), ctx);
  return win.PuHomeFill;
}
const F = load();

/* 아주 작은 가짜 화면 — 칸 하나와 querySelector 만 있으면 된다 */
function fakeDoc(fields) {
  const els = {};
  Object.keys(fields || {}).forEach((n) => {
    els['[name="' + n + '"]'] = {
      value: fields[n], focus() {}, scrollIntoView() {}, dispatchEvent() { return true; }
    };
  });
  return { querySelector: (sel) => els[sel] || null };
}

/* ── 어느 화면에서 눌러야 하나 ── */
test('구성원 편집 화면이면 받아들인다', () => {
  const r = F.pageCheck({ search: '?mid=people_board&act=dispBoardWrite&document_srl=193' });
  assert.equal(r.ok, true);
  assert.equal(r.srl, '193');
});

test('★ 다른 게시판에서는 아무것도 안 한다', () => {
  assert.equal(F.pageCheck({ search: '?mid=partner_board&act=dispBoardWrite&document_srl=185' }).ok, false);
  assert.equal(F.pageCheck({ search: '?mid=notice&act=dispBoardWrite&document_srl=1' }).ok, false);
});

test('★ 글을 «보는» 화면에서는 아무것도 안 한다 — 고치는 화면이라야 한다', () => {
  const r = F.pageCheck({ search: '?mid=people_board&document_srl=193' });
  assert.equal(r.ok, false);
  assert.match(r.why, /수정/);
});

/* ── 붙일 글자가 말이 되나 ── */
test('빈 클립보드면 멈추고 무엇을 하라고 말해 준다', () => {
  const r = F.textCheck('   ');
  assert.equal(r.ok, false);
  assert.match(r.why, /붙여넣을 내용 복사/);
});

test('★ 화면 조각이 섞인 것은 붙이지 않는다 — 엉뚱한 것을 복사했을 때', () => {
  ['<div>가</div>', '<table><tr><td>가', '<script>x</script>'].forEach((bad) =>
    assert.equal(F.textCheck(bad).ok, false, bad + ' 를 받아들였습니다'));
});

test('사람이 쓴 꺾쇠 표기는 그대로 받아들인다 — 지우지 않기로 한 것과 같은 결', () => {
  const r = F.textCheck('現 <PM> 직책 수행\n前 <S> 등급');
  assert.equal(r.ok, true);
  assert.equal(r.text, '現 <PM> 직책 수행\n前 <S> 등급');
});

test('너무 길면 멈춘다 — 경력사항이 아닐 것이다', () => {
  assert.equal(F.textCheck('가'.repeat(4001)).ok, false);
});

/* ── 실제로 채우기 ── */
test('경력사항 칸만 채운다', () => {
  const doc = fakeDoc({ extra_vars4: '옛 경력', extra_vars3: '메인 설명', title: '박성수' });
  const r = F.fill(doc, '現 새 경력');
  assert.equal(r.ok, true);
  assert.equal(r.before, '옛 경력');
  assert.equal(doc.querySelector('[name="extra_vars4"]').value, '現 새 경력');
  /* 다른 칸은 손대지 않았다 */
  assert.equal(doc.querySelector('[name="extra_vars3"]').value, '메인 설명');
  assert.equal(doc.querySelector('[name="title"]').value, '박성수');
});

test('★★ 칸을 못 찾으면 «아무것도 하지 않고» 멈춘다 — 다른 칸에 쓰지 않는다', () => {
  /* 홈페이지를 개편해 이름이 바뀐 상황. 경력이 「메인 설명」 자리에 들어가면 안 된다. */
  const doc = fakeDoc({ extra_vars3: '메인 설명', title: '박성수' });
  const r = F.fill(doc, '現 새 경력');
  assert.equal(r.ok, false);
  assert.match(r.why, /멈춥니다|찾지 못/);
  assert.equal(doc.querySelector('[name="extra_vars3"]').value, '메인 설명', '★ 다른 칸을 덮어썼습니다');
  assert.equal(doc.querySelector('[name="title"]').value, '박성수', '★ 다른 칸을 덮어썼습니다');
});

test('이미 같으면 같다고 알려 준다 — 괜히 등록을 누르지 않게', () => {
  const doc = fakeDoc({ extra_vars4: '現 가' });
  const r = F.fill(doc, '現 가');
  assert.equal(r.ok, true);
  assert.equal(r.changed, false);
});

/* ── 즐겨찾기 주소 ── */
test('즐겨찾기 주소가 한 줄이다 — 줄바꿈이 들어가면 잘린다', () => {
  const u = F.bookmarkletUrl();
  assert.match(u, /^javascript:/);
  assert.ok(u.indexOf('\n') === -1, '★ 줄바꿈이 들어 있습니다');
  assert.ok(u.indexOf('\r') === -1, '★ 줄바꿈이 들어 있습니다');
});

test('★ 즐겨찾기 단추가 «저장(등록)»을 누르지 않는다 — 사람이 눌러야 한다', () => {
  const u = decodeURIComponent(F.bookmarkletUrl());
  assert.ok(!/\.submit\s*\(/.test(u), '★ 스스로 저장합니다 — 잘못 채웠을 때 되돌릴 틈이 없습니다');
  assert.ok(!/procBoardInsertDocument/.test(u), '★ 저장을 직접 보냅니다');
});

test('★ 즐겨찾기 단추가 경력사항 말고 다른 칸을 건드리지 않는다', () => {
  const u = decodeURIComponent(F.bookmarkletUrl());
  ['extra_vars1', 'extra_vars2', 'extra_vars3', 'extra_vars5', 'content', '_rx_csrf_token']
    .forEach((n) => assert.ok(u.indexOf(n) === -1, '★ ' + n + ' 을 건드립니다'));
  assert.ok(u.indexOf('extra_vars4') > -1, '경력사항 칸을 안 채웁니다');
});

test('★ 즐겨찾기 단추도 «어느 화면인지» 먼저 본다', () => {
  const u = decodeURIComponent(F.bookmarkletUrl());
  assert.ok(u.indexOf('people_board') > -1, '★ 게시판을 안 가립니다');
  assert.ok(u.indexOf('dispBoardWrite') > -1, '★ 고치는 화면인지 안 가립니다');
});
