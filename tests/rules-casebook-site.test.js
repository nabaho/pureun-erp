'use strict';
/* 사업장 가리기 — 폴더 이름이 파일명보다 믿을 만하다 (spec §4)

   10년치 폴더는 보통 「업체명/연도/파일」 꼴이다. 파일명은 「취업규칙(최종).hwp」
   처럼 업체명이 아예 없는 경우가 흔하다. 그래서 폴더를 먼저 본다.
   ERP 업체관리와 맞으면 사업자번호까지 채운다 — 그 번호가 보관함과 붙는 열쇠다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const ERP = [
  { name: '주식회사 한빛산업', bizNo: '123-45-67890' },
  { name: '㈜미래테크', bizNo: '2223344556' },
  { name: '청솔전자 주식회사', bizNo: '3334455667' }
];

test('★ 법인격 표기를 털어내고 견준다', () => {
  assert.equal(CB.normName('주식회사 한빛산업'), '한빛산업');
  assert.equal(CB.normName('㈜한빛산업'), '한빛산업');
  assert.equal(CB.normName('(주) 한빛 산업'), '한빛산업');
  assert.equal(CB.normName('한빛산업(유한회사)'), '한빛산업');
});

test('★ 폴더 이름으로 ERP 업체를 찾고 사업자번호를 채운다', () => {
  const r = CB.siteOf({ path: '한빛산업/2022/취업규칙(최종).hwp', name: '취업규칙(최종).hwp' }, ERP);
  assert.equal(r.site, '주식회사 한빛산업', 'ERP 에 적힌 정식 상호로 맞춰야 합니다');
  assert.equal(r.bizno, '123-45-67890');
  assert.equal(r.how, 'ERP 정확');
});

test('★ 폴더가 파일명보다 이긴다', () => {
  const r = CB.siteOf({ path: '한빛산업/2022/취업규칙_미래테크.hwp', name: '취업규칙_미래테크.hwp' }, ERP);
  assert.equal(r.site, '주식회사 한빛산업');
});

test('폴더가 부분만 맞아도 찾아낸다', () => {
  const r = CB.siteOf({ path: '한빛산업 서울지점/2022/취업규칙.hwp', name: '취업규칙.hwp' }, ERP);
  assert.equal(r.bizno, '123-45-67890');
  assert.equal(r.how, 'ERP 부분');
});

test('★ 폴더가 없으면 파일명에서 뽑는다', () => {
  const r = CB.siteOf({ path: '취업규칙_미래테크_개정안.hwp', name: '취업규칙_미래테크_개정안.hwp' }, ERP);
  assert.equal(r.bizno, '2223344556');
  assert.ok(r.how === 'ERP 정확' || r.how === 'ERP 부분');
});

test('★ ERP 에 없으면 이름만 두고 사업자번호는 빈칸 — 지어내지 않는다', () => {
  const r = CB.siteOf({ path: '없는회사/2022/취업규칙.hwp', name: '취업규칙.hwp' }, ERP);
  assert.equal(r.site, '없는회사');
  assert.equal(r.bizno, '');
  assert.equal(r.how, '폴더');
});

test('★ 아무 단서도 없으면 확인 필요(how=null)', () => {
  const r = CB.siteOf({ path: '취업규칙.hwp', name: '취업규칙.hwp' }, ERP);
  assert.equal(r.site, '');
  assert.equal(r.bizno, '');
  assert.equal(r.how, null);
});

test('연도 폴더는 사업장 이름이 아니다', () => {
  const r = CB.siteOf({ path: '2022/취업규칙.hwp', name: '취업규칙.hwp' }, ERP);
  assert.equal(r.how, null, '「2022」를 업체명으로 잡으면 수백 건이 2022 라는 사업장이 됩니다');
});

test('한 글자 폴더는 단서로 쓰지 않는다', () => {
  const r = CB.siteOf({ path: 'A/취업규칙.hwp', name: '취업규칙.hwp' }, ERP);
  assert.equal(r.how, null);
});

test('★ 파일명에서 업체명을 뽑는다 — 2단계가 이 함수를 따로 쓴다', () => {
  assert.equal(CB.nameFromFile('취업규칙_삼성디지컴_개정안.hwp'), '삼성디지컴');
  assert.equal(CB.nameFromFile('취업규칙_미래테크.hwp'), '미래테크');
  assert.equal(CB.nameFromFile('취업규칙.hwp'), '', '뒤에 이름이 없으면 빈 문자열');
  assert.equal(CB.nameFromFile('규정.hwp'), '', '「취업규칙」이라는 말이 없으면 뽑지 않는다');
});

test('ERP 목록이 없어도 터지지 않는다', () => {
  const r = CB.siteOf({ path: '한빛산업/취업규칙.hwp', name: '취업규칙.hwp' }, null);
  assert.equal(r.site, '한빛산업');
  assert.equal(r.bizno, '');
  assert.equal(r.how, '폴더');
});
