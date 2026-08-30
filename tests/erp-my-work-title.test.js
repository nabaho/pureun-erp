'use strict';
/* 「나의 업무」 제목칸에서 회사명 중복 걷어내기 — SEQ134 의 마무리(SEQ151)

   ■ 내력
   SEQ134 가 「프로젝트 제목에서 회사명 중복 제거」를 했는데, 대표 지시 2026-08-30
   「혹시 134번 수정했는지 검토만해라」로 돌려 보니 **절반만 걸려 있었다.**
     ① 제목이 회사명과 «똑같을 때»만 지웠다 — 「(주)한빛 자문계약」·
        「취업규칙 - (주)한빛」처럼 **앞뒤에 붙은** 흔한 꼴은 그대로 남았다.
     ② 일곱 갈래 중 **셋(계약·사건·컨설팅)에만** 걸려 있었다. 기금·기타·사업사건·
        업무항목은 제목 자리에서 companyName 으로 물러서서, 회사명이 두 번 찍혔다.
   → 대표 「둘다」. 그래서 SEQ151 로 둘 다 했다.

   ■ ⚠ 함부로 다 지우면 안 된다
   회사명이 **제목의 뜻을 이루는** 것이 있다 — 「(주)한빛 vs 김철수 사건」,
   「(주)한빛 외 2개사 자문」. 여기서 회사명을 떼면 «누구의» 사건인지가 사라진다.
   그래서 지우는 것은 세 가지를 지킬 때만이다:
     ① 앞이나 뒤에 붙어 있을 때만 (가운데 것은 안 건드린다)
     ② 떼고 남은 것이 2글자 이상 (껍데기만 남으면 안 지운다)
     ③ 남은 것이 이어 주는 말(vs·대·외·및·과·와)로 시작하지 않을 때

   ⚠⚠ 여기서 한 번 데었다 — `/^(외)\b/` 로 막으려 했는데 **안 걸렸다.**
     자바스크립트의 `\b` 는 영문·숫자만 낱말로 보아 **한글 뒤에서는 경계가 없다.**
     한글을 막을 때는 \b 대신 «뒤에 오는 글자»를 직접 본다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

/* 그 함수들을 «그대로 떠서» 돌린다 — 읽어서 짐작하면 한글 \b 같은 것을 놓친다 */
function api() {
  function grab(name) {
    const at = APP.indexOf('function ' + name + '(');
    assert.ok(at > 0, '★ ' + name + ' 을 찾지 못했습니다');
    let i = APP.indexOf('{', at), d = 0;
    for (; i < APP.length; i++) {
      if (APP[i] === '{') d++;
      else if (APP[i] === '}') { d--; if (!d) return APP.slice(at, i + 1); }
    }
    throw new Error('짝을 못 맞춤: ' + name);
  }
  const ctx = { _prjTypeName: function (x) { return x.__type || ''; }, String: String };
  vm.createContext(ctx);
  ['_coKey', '_stripCo', '_projTitle'].forEach(function (n) {
    vm.runInContext(grab(n).replace(/^function /, 'var ' + n + ' = function ') + ';', ctx);
  });
  return ctx;
}
const CO = '(주)한빛';
function title(t, type, icon) {
  return api()._projTitle({ companyName: CO, __type: type === undefined ? '자문' : type },
    'contract', t, icon);
}

/* ── ① 붙어 있는 회사명을 걷는다 ── */

test('★★ 제목 «앞뒤»에 붙은 회사명을 걷는다 — 회사칸에 이미 있는 말이다', () => {
  assert.equal(title('(주)한빛'), '자문', '★ 똑같을 때(SEQ134 가 하던 것)');
  assert.equal(title('(주)한빛 자문계약'), '자문 · 자문계약',
    '★★ 앞에 붙은 것을 안 걷습니다 — 회사명이 두 번 찍힙니다');
  assert.equal(title('취업규칙 - (주)한빛'), '자문 · 취업규칙',
    '★★ 뒤에 붙은 것을 안 걷습니다');
  assert.equal(title('2026 임금협상 ((주)한빛)'), '자문 · 2026 임금협상',
    '★ 괄호에 든 것을 안 걷습니다');
});

test('★★ 「(주)」가 빠진 꼴도 같은 회사로 본다 — 제목에는 흔히 빠져 있다', () => {
  assert.equal(title('한빛 자문계약'), '자문 · 자문계약',
    '★★ (주)·㈜·주식회사·띄어쓰기를 무시하고 견주지 않습니다');
  const c = api();
  assert.equal(c._coKey('주식회사 한 빛'), c._coKey('(주)한빛'));
  assert.equal(c._coKey('㈜한빛'), '한빛');
});

/* ── ② 뜻을 이루는 회사명은 «건드리지 않는다» ── */

test('★★ 회사명이 «뜻을 이루면» 안 지운다 — 누구의 사건인지가 사라진다', () => {
  assert.equal(title('(주)한빛 vs 김철수 사건', '사건'), '사건 · (주)한빛 vs 김철수 사건',
    '★★ 「vs 김철수 사건」이 되어 누구의 사건인지 사라집니다');
  /* ⚠⚠ 여기서 한 번 데었다 — /^(외)\b/ 는 **한글 뒤에서 안 걸린다**(\b 는 영문·숫자만
     낱말로 본다). 실제로 「외 2개사 자문」으로 잘려 나갔다. */
  assert.equal(title('(주)한빛 외 2개사 자문'), '자문 · (주)한빛 외 2개사 자문',
    '★★ 「외 2개사」의 주인이 사라집니다 — 한글에는 \\b 가 안 먹습니다');
  ['대', '및', '과', '와'].forEach(function (w) {
    const t = '(주)한빛 ' + w + ' 무엇';
    assert.equal(title(t), '자문 · ' + t, '★ 이어 주는 말 「' + w + '」에서 잘렸습니다');
  });
});

test('★★ «가운데» 있는 회사명은 안 건드린다 — 앞뒤에 붙은 것만 겹말이다', () => {
  assert.equal(title('2026 (주)한빛 정기감사'), '자문 · 2026 (주)한빛 정기감사');
});

test('★★ 떼고 나면 «껍데기»만 남을 때는 안 뗀다', () => {
  assert.equal(title('(주)한빛 - '), '자문 · (주)한빛 -',
    '★★ 「-」 한 글자만 남는 제목을 만듭니다');
  const c = api();
  assert.equal(c._stripCo('(주)한빛 A', CO), '(주)한빛 A', '★ 한 글자만 남으면 안 뗍니다');
});

test('★★ 회사명이 «한 글자»면 아예 안 뗀다 — 아무 제목에서나 그 글자가 뜯긴다', () => {
  /* 「한」·「A」 같은 이름이 있으면, 앞뒤에 그 글자가 있는 제목마다 잘려 나간다.
     ⚠ 돌연변이에서 살아남던 자리다 — 짧은 이름으로 시험해 보지 않았다. */
  const c = api();
  assert.equal(c._stripCo('한 정기감사', '한'), '한 정기감사',
    '★★ 한 글자짜리 회사명으로 제목을 뜯고 있습니다');
  assert.equal(c._stripCo('A 자문계약', 'A'), 'A 자문계약');
  /* 두 글자부터는 뗀다 */
  assert.equal(c._stripCo('한빛 자문계약', '한빛'), '자문계약');
});

test('★ 회사명이 없거나 제목이 비면 하던 대로', () => {
  assert.equal(title('2026 취업규칙'), '자문 · 2026 취업규칙');
  assert.equal(title(''), '자문');
  /* 유형도 제목도 없으면 회사명이라도 적는다 — 「무제」보다 낫다 */
  assert.equal(title('', ''), CO);
});

/* ── ③ 일곱 갈래 «모두» 같은 손잡이 ── */

test('★★ 일곱 갈래가 «같은 손잡이»를 쓴다 — SEQ134 는 셋만 고쳐 두었다', () => {
  const at = APP.indexOf('var allItems = [].concat(');
  assert.ok(at > 0, '★ 목록 만드는 자리를 찾지 못했습니다');
  const blk = APP.slice(at, APP.indexOf('진행상황', at));
  ['contract', 'case', 'consulting', 'fund', 'other', 'biz-case', 'work-item']
    .forEach(function (k) {
      const i = blk.indexOf("buildItems('" + k + "'");
      assert.ok(i > 0, '★ 갈래를 찾지 못했습니다: ' + k);
      /* ⚠ 길이로 잘라 보면 **다음 갈래까지 넘어가** 옆 것의 _projTitle 에 걸린다
         (돌연변이에서 실제로 새어 나갔다 — 기금을 옛 길로 되돌려도 통과했다).
         그러니 «다음 buildItems 앞»에서 끊는다. */
      const next = blk.indexOf('buildItems(', i + 12);
      const seg = blk.slice(i, next > 0 ? next : blk.length);
      assert.match(seg, /_projTitle\(/,
        '★★ 「' + k + '」이 아직 딴 길입니다 — 제목칸에 회사명이 그대로 두 번 찍힙니다');
      /* 옛 길(제목 자리에서 companyName 으로 물러서기)이 남아 있으면 안 된다 */
      assert.ok(!/\|\|\s*x\.companyName\s*\|\|/.test(seg.split('\n')[2] || ''),
        '★★ 「' + k + '」의 제목 자리가 아직 companyName 으로 물러섭니다');
    });
});

test('★ 아이콘이 붙는 갈래에서도 아이콘이 «살아 있다»', () => {
  /* 사업사건·업무항목은 제목 앞에 아이콘을 붙여 왔다 — 합치면서 잃으면 안 된다 */
  assert.equal(title('현장실사', '사업사건', '📋'), '📋 사업사건 · 현장실사');
  assert.equal(title('(주)한빛 현장실사', '사업사건', '📋'), '📋 사업사건 · 현장실사',
    '★ 아이콘 갈래에서는 회사명이 안 걷힙니다');
  assert.equal(title('현장실사', '사업사건', ''), '사업사건 · 현장실사',
    '★ 아이콘이 없을 때 빈 칸이 앞에 붙습니다');
});

/* ── ④ 관례 ── */

test('★ 고쳤으면 BUILD_SEQ 가 올라가 있다 — 배포된 것이 무엇인지 화면이 말한다', () => {
  const m = /var BUILD_SEQ = (\d+);/.exec(APP);
  assert.ok(m, '★ BUILD_SEQ 가 없습니다');
  assert.ok(Number(m[1]) >= 151,
    '★ 제목 만드는 길을 고쳤는데 BUILD_SEQ 가 ' + m[1] + ' 입니다');
  assert.match(APP, /var ERP_BUILD = '2026-08-30 나의 업무 제목칸에서 회사명/,
    '★ 무엇을 고쳤는지 적는 자리(ERP_BUILD)가 안 바뀌었습니다');
});
