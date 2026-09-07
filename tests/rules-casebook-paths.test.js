'use strict';
/* 저장 경로 조립 (spec §3)

   무게별로 층을 갈라 두는 것이 이 설계의 핵심이다. 목록 노드에 본문을 같이
   넣으면 서고를 여는 순간 수십 MB 가 딸려 온다. 경로를 코드 여러 곳에서
   문자열로 이어 붙이면 그 경계가 반드시 무너지므로 한 곳에 모은다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const SK = 'site_1234567890';

test('★ 네 층이 서로 다른 자리에 있다', () => {
  assert.equal(CB.paths.index(SK), 'rules_mgmt/casebook/index/site_1234567890');
  assert.equal(CB.paths.rev(SK, '2022'), 'rules_mgmt/casebook/rev/site_1234567890/2022');
  assert.equal(CB.paths.text(SK, '2022', 'after'), 'rules_mgmt/casebook/text/site_1234567890/2022/after');
  assert.equal(CB.paths.idx('연차', SK, '2022'), 'rules_mgmt/casebook/idx/k/연차/site_1234567890__2022');
});

test('★ 목록 경로에 회차가 끼어들지 않는다 — 끼면 목록이 무거워진다', () => {
  const p = CB.paths.index(SK);
  assert.ok(p.indexOf('2022') < 0);
  assert.equal(p.split('/').length, 4);
});

test('★ 원본 파일은 실시간DB 가 아니라 Storage 자리다', () => {
  assert.equal(CB.paths.file(SK, '2022', 'after', 'hwp'), 'casebook/site_1234567890/2022/after.hwp');
  assert.ok(CB.paths.file(SK, '2022', 'after', 'hwp').indexOf('rules_mgmt') < 0,
    'Storage 경로에 실시간DB 자리가 섞이면 안 됩니다');
});

test('확장자는 소문자로, 점은 빼고 받는다', () => {
  assert.equal(CB.paths.file(SK, '2022', 'daejo', '.HWPX'), 'casebook/site_1234567890/2022/daejo.hwpx');
});

test('★ 색인 키는 사업장과 회차를 함께 담는다 — 회차까지 짚어야 본문을 찾는다', () => {
  const p = CB.paths.idx('연차', SK, '2022-2');
  assert.ok(p.endsWith('site_1234567890__2022-2'));
});

test('알 수 없는 역할은 거절한다 — 오타가 조용히 새 자리를 만들면 안 된다', () => {
  assert.throws(() => CB.paths.text(SK, '2022', 'aftre'), /역할/);
  assert.throws(() => CB.paths.file(SK, '2022', 'aftre', 'hwp'), /역할/);
});
