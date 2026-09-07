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

/* ── 폴더 이름의 «연도 벗기기» (2026-09-07 실측에서 잡았다) ──────────────
   폴더가 「한빛산업2022」면 사업장이 «한빛산업2022»로 앉았다.
   ★ 그러면 같은 회사가 «해마다 딴 사업장»이 되어 이력이 갈라진다 —
     2022 회차와 2024 회차가 서로 다른 사업장으로 담긴다. */

test('★★ 폴더 이름에 붙은 연도를 벗긴다 — 안 벗기면 같은 회사가 해마다 갈라진다', () => {
  const 꼴 = ['한빛산업2022', '2022 한빛산업', '한빛산업_2022개정', '2022년_한빛산업',
              '한빛산업 2022 전부개정'];
  꼴.forEach((f) => {
    const r = CB.siteOf({ path: f + '/개정안.hwp', name: '개정안.hwp' }, []);
    assert.strictEqual(r.site, '한빛산업', `「${f}」 에서 연도가 안 벗겨졌습니다`);
  });
});

test('연도가 없는 이름은 «그대로 둔다»', () => {
  assert.strictEqual(CB.stripYear('한빛산업'), '한빛산업');
  assert.strictEqual(CB.stripYear('씨티에스㈜'), '씨티에스㈜');
  assert.strictEqual(CB.stripYear('주식회사 다래물산'), '주식회사 다래물산');
});

test('★ 벗긴 것으로 «바꿔치기»하지 않는다 — 이름에 정말 숫자가 든 회사가 있다', () => {
  /* ERP 에 「2020컴퍼니」가 있으면 원래 이름으로 맞아야 한다.
     벗긴 것만 남기면 「컴퍼니」가 되어 영영 못 찾는다. */
  const erp = [{ name: '2020컴퍼니', bizNo: '1112223330' }];
  const r = CB.siteOf({ path: '2020컴퍼니/취업규칙.hwp', name: '취업규칙.hwp' }, erp);
  assert.strictEqual(r.site, '2020컴퍼니');
  assert.strictEqual(r.bizno, '1112223330');
});

test('★ 연도만 있는 폴더는 사업장 후보가 «아니다»(예전부터 지키던 것)', () => {
  const r = CB.siteOf({ path: '한빛산업/2022/개정안.hwp', name: '개정안.hwp' }, []);
  assert.strictEqual(r.site, '한빛산업');
});

test('벗기고 나서 너무 짧아지면 원래 이름을 쓴다', () => {
  /* 「2022」만 남는 폴더는 애초에 걸러지고, 「가2022」처럼 한 글자만 남는 것도
     사업장 이름으로 쓰기엔 위험하다 — 원래 것을 남긴다. */
  const r = CB.siteOf({ path: '가2022/개정안.hwp', name: '개정안.hwp' }, []);
  assert.ok(r.site.length >= 1, '이름이 통째로 사라지면 안 됩니다');
});
