'use strict';
/* 서고의 사업장 키가 보관함과 어긋나면 안 된다

   보관함 레코드의 id 는 doSaveArchive(rules.html:4575) 가
   "site_"+fbKey(LAST.bizno||site) 로 만든다. 서고가 이것과 다른 키를 쓰면
   같은 사업장이 두 키로 갈라져 「지난 개정 이력」이 영영 안 붙는다.

   ⚠ 이 형태에는 알려진 약점이 있다 — fbKey 는 하이픈을 지우지 않으므로
   "123-45-67890" 과 "1234567890" 이 다른 키가 된다. 대시보드용 dashKey
   (rules.html:4646)는 숫자만 남겨 다른 답을 낸다. 그래서 조회할 때는
   두 형태를 모두 시도한다(siteKeyCandidates). 여기서 그 차이를 못 박아 두어,
   나중에 누가 «통일»하려 할 때 무엇이 깨지는지 보이게 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const CB = require(path.join(root, 'js', 'pu-rules-casebook.js'));
const rules = fs.readFileSync(path.join(root, 'rules.html'), 'utf8');

test('★ fbKey 가 rules.html 의 것과 같은 글자를 지운다', () => {
  assert.equal(CB.fbKey('a.b#c$d[e]f/g h'), 'a_b_c_d_e_f_g_h');
  assert.equal(CB.fbKey(''), 'unknown');
  assert.equal(CB.fbKey(null), 'unknown');
  assert.equal(CB.fbKey('x'.repeat(200)).length, 120);
});

test('★ 사업자번호가 있으면 그것으로, 없으면 사업장명으로 키를 만든다', () => {
  assert.equal(CB.siteKeyOf('1234567890', '한빛산업'), 'site_1234567890');
  assert.equal(CB.siteKeyOf('', '한빛산업'), 'site_한빛산업');
  assert.equal(CB.siteKeyOf(null, '한빛 산업'), 'site_한빛_산업');
});

test('★ 하이픈은 살아남는다 — doSaveArchive 와 같은 형태여야 한다', () => {
  assert.equal(CB.siteKeyOf('123-45-67890', '한빛산업'), 'site_123-45-67890');
});

test('★ 조회는 두 형태를 모두 시도한다 — 하이픈 표기가 갈려도 찾아낸다', () => {
  const c = CB.siteKeyCandidates('123-45-67890', '한빛산업');
  assert.ok(c.includes('site_123-45-67890'), '보관함 레코드 형태가 빠졌습니다');
  assert.ok(c.includes('site_1234567890'), '숫자만 남긴 형태가 빠졌습니다');
});

test('두 형태가 같으면 한 번만 돌려준다', () => {
  assert.deepEqual(CB.siteKeyCandidates('1234567890', '한빛산업'), ['site_1234567890']);
});

test('사업자번호가 없으면 사업장명 하나만', () => {
  assert.deepEqual(CB.siteKeyCandidates('', '한빛산업'), ['site_한빛산업']);
});

test('★ rules.html 의 fbKey 정규식이 바뀌면 여기서 걸린다', () => {
  assert.ok(rules.includes('replace(/[.#$\\[\\]\\/\\s]/g,"_").slice(0,120)||"unknown"'),
    'rules.html 의 fbKey 가 바뀌었습니다 — pu-rules-casebook.js 의 fbKey 도 함께 고쳐야 합니다');
});

test('★ rules.html 의 보관함 키 조립이 바뀌면 여기서 걸린다', () => {
  assert.ok(rules.includes('const sk="site_"+fbKey(LAST.bizno||site);'),
    'doSaveArchive 의 키 조립이 바뀌었습니다 — siteKeyOf 를 맞춰야 서고가 붙습니다');
});
