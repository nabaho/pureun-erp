'use strict';
/* 담당자 곁칸이 «화면에 붙어 있는가» + 기업정보함과 오가는가   2026-09-08

   규칙 자체는 tests/contact-multi-value.test.js 가 본다.
   여기서는 «붙지 않은 부품은 아무도 못 쓴다»를 본다 —
   함수만 있고 화면에 안 걸리면 대표 화면에는 아무 일도 안 일어난다
   (2026-09-07 「복귀」 단추가 바로 그렇게 안 보였다). */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { test } = require('node:test');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const erpBare = stripComments(erp);
const cardsBare = stripComments(cards);

test('① 두 화면이 «같은 규칙 파일»을 싣는다 — 따로 셈하면 메인이 서로 달라진다', function () {
  [['pu-erp.html', erpBare], ['pu-cards.html', cardsBare]].forEach(function (p) {
    assert.match(p[1], /<script src="js\/pu-contact\.js\?v=\d+"><\/script>/,
      '★ ' + p[0] + ' 이 js/pu-contact.js 를 안 싣습니다');
  });
  assert.ok(fs.existsSync(path.join(R, 'js', 'pu-contact.js')), '★ 규칙 파일이 없습니다');
});

test('② 캐시 번호가 붙어 있다 — 안 붙이면 고쳐도 옛 파일이 내려간다', function () {
  [erpBare, cardsBare].forEach(function (s) {
    assert.match(s, /js\/pu-contact\.js\?v=\d+/, '★ ?v= 가 없습니다');
  });
});

test('③ 담당자 편집기 «두 곳 모두»에 붙어 있다 (계약 창 · 업체 창)', function () {
  const uses = (erpBare.match(/h\(ContactMulti,/g) || []).length;
  assert.ok(uses >= 2, '★ 담당자 편집기는 둘입니다 (계약·업체) — ' + uses + '군데만 붙었습니다');
  /* 각 화면에 통째 갈아끼우는 손이 있어야 ★ 맞바꿈이 저장된다 */
  const setters = (erpBare.match(/function setContactRec\(/g) || []).length;
  assert.ok(setters >= 2, '★ setContactRec 이 ' + setters + '곳뿐입니다 — 한쪽에서 ★ 가 안 먹습니다');
});

test('④ ★ 는 규칙 파일의 promote 를 쓴다 — 화면이 자리를 스스로 바꾸지 않는다', function () {
  const c = stripComments('<script>' + cutFn(erp, 'function ContactMulti(') + '</script>');
  assert.match(c, /P\.promote\(rec, kind, at\)/, '★ 맞바꿈을 화면이 따로 셈하고 있습니다');
  assert.match(c, /P\.remove\(rec, kind, at\)/);
  assert.match(c, /P\.apply\(rec, kind, next\)/);
  assert.ok(!/isPrimary|primary\s*:/.test(c), '★ 메인을 플래그로 다루고 있습니다 — 자리로 해야 합니다');
});

test('⑤ ★ 값이 하나뿐인 사람에게는 아무것도 안 나온다', function () {
  const c = stripComments('<script>' + cutFn(erp, 'function ContactMulti(') + '</script>');
  assert.match(c, /if\(!extra\.length\) return;/, '★ 하나뿐인데 빈 줄을 그리고 있습니다');
  assert.match(c, /if\(!rows\.length && !adders\.length\) return null;/,
    '★ 그릴 것이 없을 때 빈 상자가 남습니다');
});

test('⑥ 규칙 파일이 없어도 화면이 안 죽는다 — 옛 캐시로 열릴 수 있다', function () {
  const c = stripComments('<script>' + cutFn(erp, 'function ContactMulti(') + '</script>');
  assert.match(c, /if\(!P\) return null;/, '★ PuContact 가 없으면 화면이 터집니다');
  const tip = stripComments('<script>' + cutFn(erp, 'function ctMultiTip(') + '</script>');
  assert.match(tip, /if\(!P\) return '';/);
});

test('⑦ ★★ 기업정보함 → 푸른이알피 — 곁칸이 딸려 온다', function () {
  const f = stripComments('<script>' + cutFn(erp, 'function pcToContact(') + '</script>');
  assert.match(f, /PuContact\.cardToMore\(x, 'phone'\)/, '★ 명함의 둘째 번호를 안 가져옵니다');
  assert.match(f, /PuContact\.cardToMore\(x, 'email'\)/, '★ 명함의 둘째 이메일을 안 가져옵니다');
  /* 메인은 색인의 m·e 그대로 — 기업정보함에서 고른 것이 여기서도 메인이어야 한다 */
  assert.match(f, /phone:x\.m\|\|''/);
  assert.match(f, /email:x\.e\|\|''/);
});

test('⑧ ★★ 푸른이알피 → 기업정보함 — 색인이 곁칸을 담는다 (mm · em)', function () {
  const f = stripComments('<script>' + cutFn(cards, 'function idxRecord(') + '</script>');
  assert.match(f, /PuContact\.moreToCard\(/, '★ 색인이 곁칸을 안 담습니다');
  assert.match(f, /r\.mm = _mm/, '★ 휴대폰 곁칸 열쇠(mm)가 없습니다');
  assert.match(f, /r\.em = _em/, '★ 이메일 곁칸 열쇠(em)가 없습니다');
  /* 값이 없으면 열쇠도 안 만든다 — 색인은 수천 줄이라 빈 칸을 담으면 안 된다 */
  assert.match(f, /if\(_mm\.length\)/);
  assert.match(f, /if\(_em\.length\)/);
  assert.match(f, /if\(window\.PuContact\)/, '★ 규칙 파일이 없을 때 색인 만들기가 통째로 죽습니다');
});

test('⑨ 옛 열쇠(m·e)는 그대로다 — 이 열쇠를 모르는 화면이 안 깨진다', function () {
  const f = stripComments('<script>' + cutFn(cards, 'function idxRecord(') + '</script>');
  assert.match(f, /put\('m', it\.mobile\)/, '★ 메인 휴대폰 열쇠가 바뀌었습니다');
  assert.match(f, /put\('e', it\.email\)/, '★ 메인 이메일 열쇠가 바뀌었습니다');
});
