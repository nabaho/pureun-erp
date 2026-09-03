'use strict';
/* 계약 → 업체 이관: 같은 업체를 두 벌 만들지 않고, 갈래 없이 태어나지 않게
   (대표 결정 2026-08-23 — 「같이 고쳐」)

   조사에서 나온 문제 둘:

   ① **같은 업체가 두 벌 생겼다.** transferContract 의 업체 갈래는 사업자번호로
      찾아보지 않고 늘 새 co- 번호를 찍어냈다. 사건·컨설팅·기금 이관은 같은 파일
      안에서 CompanyRef.findCompany 로 찾아 companyId 를 붙이는데 업체만 안 했다.
      → 6-3단계부터 명시적으로 검증한 업체 ID에만 **빈 칸만** 채우고 잇는다.
        이름·사업자번호 후보는 자동 쓰기 대상이 아니며 사전 검증에서 선택을 요청한다. 이미 있는 값(자문료·계약기간·유형)을
        새 계약 값으로 덮으면 사람이 업체관리에서 고쳐 둔 것을 조용히 지운다.

   ② **업체가 갈래 없이 태어났다.** 업체계약에서 갈래 칸을 손대지 않으면 화면에는
      첫 항목이 보이는데 저장값은 빈 문자열이었다. 그 업체는 업체관리의 어느 유형
      칸에도 안 나온다(COMPANY_TYPE_FILTERS 가 유형으로 가른다).
      → toggleKind·fixTypeCodes 두 곳 모두에 company 를 넣는다.

   ⚠ 이 파일은 pu-erp.html 을 돌리지 않는다(React 화면 전체를 세울 수 없다).
     대신 «그 대목의 코드»를 떼어 내 못박고, 갈래 채우기는 실제로 돌려 본다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 업체 이관 대목만 떼어 온다 — 중괄호를 세어 그 if 덩이만 자른다. */
const COMPANY_ARM = (function () {
  const i = app.indexOf("if(kindV === 'company'){");
  assert.ok(i > 0, '업체 이관 갈래를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error('업체 이관 갈래의 끝을 찾지 못했습니다');
})();

/* ══════ ① 두 벌 만들지 않는다 ══════ */

test('★ 명시적으로 검증한 업체 ID로만 잇는다 — 이름·사업자번호는 후보일 뿐이다', () => {
  assert.doesNotMatch(COMPANY_ARM, /CompanyRef\.findCompany/);
  assert.match(COMPANY_ARM, /x\.id===contract\.companyId/,
    '6-3단계: 이름으로 쓰기 대상을 고르지 않고 검증한 ID만 사용합니다');
});

test('★ 찾았으면 «빈 칸만» 채운다 — 사람이 고쳐 둔 값을 덮지 않는다', () => {
  assert.match(COMPANY_ARM, /if\(coBlank\(item\[k\]\) \|\| !coBlank\(exist\[k\]\)\) return;/,
    '★ 이미 있는 값을 덮으면 업체관리에서 고쳐 둔 자문료·계약기간이 사라집니다');
  assert.match(COMPANY_ARM, /Object\.assign\(\{\}, exist, patch\)/, '기존 기록 위에 얹어야 합니다');
});

test('★ 번호(id)와 만든 때는 그대로 둔다 — 바꾸면 다른 물건이 된다', () => {
  assert.match(COMPANY_ARM, /if\(k === 'id' \|\| k === 'createdAt'/,
    '★ id 를 덮으면 그 업체를 가리키던 계약·사건이 모두 끊깁니다');
});

test('★ 담당자는 합친다 — 덮으면 원래 담당자가 사라진다', () => {
  assert.match(COMPANY_ARM, /mergeCompanyContacts\(exist\.contacts \|\| \[\], item\.contacts \|\| \[\]\)/);
});

test('★ 이었는지 새로 만들었는지 사람에게 알린다', () => {
  assert.match(COMPANY_ARM, /기존 업체에 이음/, '★ 조용히 이으면 왜 새 업체가 안 생겼는지 모릅니다');
  assert.match(COMPANY_ARM, /linked:true/, '결과에 표시가 없으면 뒷처리 코드가 가릴 수 없습니다');
  assert.match(COMPANY_ARM, /note = String\(exist\.note \|\| ''\)/,
    '어느 계약에서 왔는지 업체에 안 남으면 나중에 못 찾습니다');
});

test('새로 만드는 길은 그대로 남아 있다 — 처음 오는 업체는 만들어야 한다', () => {
  assert.match(COMPANY_ARM, /if\(!dbUpsert\('companies', item\)\) throw new Error/);
  assert.match(COMPANY_ARM, /sourceContractNo: contract\.contractNo/);
});

/* ══════ ② 갈래 없이 태어나지 않는다 ══════ */

/* 실제로 돌려 본다 — 「company 라는 낱말이 있나」로는 값이 채워지는지 못 잡는다. */
function runFix(kinds, typeCodes) {
  const i = app.indexOf('(function fixTypeCodes(){');
  assert.ok(i > 0, 'fixTypeCodes 를 찾지 못했습니다');
  let d = 0, body = '';
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    /* ⚠ 함수 «본문»의 끝까지만 세고, 감싼 괄호와 «부르는 괄호»를 손으로 붙인다.
       k+2 까지 잘라 `(function(){…})` 로만 두면 **부르지 않아** 값이 안 채워지고,
       검사는 「기본값이 안 채워진다」고 엉뚱하게 운다(여기서 한 번 속았다). */
    else if (app[k] === '}') { d--; if (!d) { body = app.slice(i, k + 2) + '();'; break; } }
  }
  assert.match(body, /\}\)\(\);$/, 'fixTypeCodes 를 부르는 꼴로 못 잘랐습니다');
  const ctx = {
    saveData: { kinds: kinds, typeCodes: typeCodes || {} },
    BIZ_CONS_SEED: [{ code: '컨설팅첫' }], BIZ_FUND_SEED: [{ code: '기금첫' }],
    BIZ_OTHER_SEED: [{ code: '기타첫' }], BIZ_CASE_SEED: [{ code: '사건첫' }],
    COMPANY_TYPE_SEED: [{ code: '자문' }, { code: '급여' }],
    dbGet: function (k, seed) { return seed; },
    Object: Object
  };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return ctx.saveData.typeCodes;
}

test('★ 업체계약이면 갈래 기본값이 채워진다 — 빈 채로 저장되면 유형 칸에 안 나온다', () => {
  const t = runFix(['company']);
  assert.equal(t.company, '자문',
    '★ 빈 문자열로 저장되면 그 업체가 업체관리 어느 유형 칸에도 안 나옵니다');
});

test('사람이 고른 갈래는 안 건드린다', () => {
  const t = runFix(['company'], { company: '급여' });
  assert.equal(t.company, '급여', '★ 골라 둔 것을 덮으면 계약 내용이 바뀝니다');
});

test('다른 갈래도 그대로 채워진다 — 업체를 넣다가 남을 깨뜨리지 않았다', () => {
  const t = runFix(['company', 'consulting', 'fund', 'other', 'case']);
  assert.equal(t.consulting, '컨설팅첫');
  assert.equal(t.fund, '기금첫');
  assert.equal(t.other, '기타첫');
  assert.equal(t.case, '사건첫');
  assert.equal(t.company, '자문');
});

test('고르지 않은 갈래는 채우지 않는다', () => {
  const t = runFix(['consulting']);
  assert.equal(t.company, undefined, '켜지도 않은 갈래에 값을 넣으면 안 됩니다');
});

test('★ 켜는 순간에도 채운다 — 저장 때만 채우면 화면과 값이 어긋난다', () => {
  /* toggleKind 안의 seedMap 에도 company 가 있어야 한다. */
  const i = app.indexOf('// ★ 새로 추가된 종류의 typeCodes 기본값 자동 세팅');
  assert.ok(i > 0, 'toggleKind 의 기본값 대목을 찾지 못했습니다');
  const seg = app.slice(i, i + 1200);
  assert.match(seg, /company:COMPANY_TYPE_SEED/,
    '★ 켤 때 안 채우면 화면에는 「자문」이 보이는데 값은 빈 채로 남습니다');
  assert.match(seg, /company:'biz_company_types'/, '고쳐 둔 유형 목록을 안 봅니다');
});
