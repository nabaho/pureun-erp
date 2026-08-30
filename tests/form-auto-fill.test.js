/* 서식을 «준비 없이» 채운다 — js/pu-form-auto.js
   대표 지시 2026-08-30: 「이렇게 만드는것 너무 불편하다 아주 쉽게 방법을 찾을것」.
   서식마다 사람이 {{토큰}}을 심어야 하면 쓰이지 않는다.
   정부·공단 서식은 칸 이름이 표준이므로, 앱이 이름표를 읽고 스스로 넣는다.

   지키려는 규칙:
     ① 표준 이름표는 알아본다 (업체명·사업자등록번호·소재지·전화번호)
     ② ★ 애매하면 «지어내지 않는다» — 근로자 칸에 회사 정보를 찍으면 서류가 잘못 나간다
     ③ 값이 없으면 «비었다고 말한다» — 조용히 넘기면 빈칸인 채로 접수된다
     ④ 이름표와 값 칸이 갈린 서식도 채운다
   실행: node --test tests/form-auto-fill.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const A = require(path.resolve(__dirname, '../js/pu-form-auto.js'));

/* ── 도우미: 표 한 줄을 만든다 ── */
const 칸 = (row, col, text) =>
  '<hp:tc><hp:subList><hp:p id="0"><hp:run charPrIDRef="0"><hp:t>' + text +
  '</hp:t></hp:run></hp:p></hp:subList>' +
  '<hp:cellAddr colAddr="' + col + '" rowAddr="' + row + '"/>' +
  '<hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc>';
const 표 = (...칸들) => '<hp:tbl>' + 칸들.join('') + '</hp:tbl>';

/* ① 표준 이름표를 알아본다 */
test('정부 서식의 표준 이름표를 알아본다', () => {
  const 본다 = {
    '업체명 Name of the enterprise': '{{회사명}}',
    '사업장명': '{{회사명}}',
    '상호': '{{회사명}}',
    '사업자등록번호(주민등록번호)': '{{사업자번호}}',
    '소재지 Location of the enterprise': '{{주소}}',
    '사업장 소재지': '{{주소}}',
    '전화번호 Phone number': '{{대표전화}}',
    '대표자': '{{대표자}}',
    '업태': '{{업태}}',
    '종목': '{{종목}}'
  };
  for (const [이름표, 토큰] of Object.entries(본다)) {
    assert.equal(A.무슨자리(이름표), 토큰, '「' + 이름표 + '」을 못 알아봅니다');
  }
});

/* ② ★ 지어내지 않는다 — 이 검사가 이 파일에서 가장 중요하다 */
test('★ 근로자 칸에는 회사 정보를 넣지 않는다', () => {
  for (const 남의칸 of [
    '성명 Name of the employee',
    '본국주소 Address(Home Country)',
    '근로자 성명',
    '피보험자 주소',
    '외국인 등록번호',
    '가입자 성명'
  ]) {
    assert.equal(A.무슨자리(남의칸), null,
      '「' + 남의칸 + '」에 사용자 정보를 넣으려 합니다 — 잘못된 서류가 접수됩니다');
  }
});

test('「성명」 혼자서는 누구 것인지 모르므로 비워 둔다', () => {
  assert.equal(A.무슨자리('성명'), null, '누구의 성명인지 모르는데 채우고 있습니다');
  assert.equal(A.무슨자리('성명 Name of the employer'), '{{대표자}}', '사용자 성명은 알아봐야 합니다');
  assert.equal(A.무슨자리('사용자 성명'), '{{대표자}}');
});

test('이름표가 아닌 긴 문장은 손대지 않는다', () => {
  const 본문 = '※ 근로자를 이 계약서에서 정한 장소 외에서 근로하게 해서는 안 됨. 위반 시 처벌될 수 있음.';
  assert.equal(A.무슨자리(본문), null, '본문을 이름표로 잘못 봤습니다');
});

/* ③ 못 채운 자리를 말한다 */
test('값이 없는 자리는 «비었다»고 알려 준다', () => {
  const xml = 표(칸(0, 0, '업체명'), 칸(1, 0, '사업자등록번호'));
  const r = A.채우기(xml, { '{{회사명}}': '주식회사 한빛산업' });
  assert.equal(r.채운것.length, 1);
  assert.deepEqual(r.빈것.map((x) => x.토큰), ['{{사업자번호}}'],
    '비어 있는 자리를 조용히 넘깁니다');
});

/* ④ 두 가지 서식 생김새 모두 채운다 */
test('이름표 칸에 이어 쓰는 서식을 채운다', () => {
  const xml = 표(칸(0, 0, '업체명 Name of the enterprise'));
  const r = A.채우기(xml, { '{{회사명}}': '주식회사 한빛산업' });
  assert.match(r.xml, /업체명 Name of the enterprise\s+주식회사 한빛산업/);
  assert.equal(r.채운것[0].방식, '이어쓰기');
});

test('이름표와 값 칸이 갈린 서식도 채운다', () => {
  const xml = 표(칸(0, 0, '업체명'), 칸(0, 1, ''));
  const r = A.채우기(xml, { '{{회사명}}': '주식회사 한빛산업' });
  assert.equal(r.채운것[0].방식, '옆칸', '빈 값 칸을 못 찾았습니다');
  /* 이름표 칸은 그대로 남아야 한다 */
  assert.match(r.xml, /<hp:t>업체명<\/hp:t>/, '이름표를 덮어썼습니다');
  assert.match(r.xml, /<hp:t>주식회사 한빛산업<\/hp:t>/);
});

test('한 칸에 두 번 쓰지 않는다', () => {
  const xml = 표(칸(0, 0, '사업장 소재지 주소'));
  const r = A.채우기(xml, { '{{주소}}': '충남 천안시' });
  assert.equal((r.xml.match(/충남 천안시/g) || []).length, 1, '같은 칸에 값이 두 번 들어갔습니다');
});

test('원본 XML 구조를 깨지 않는다 (칸·런 수가 그대로)', () => {
  const xml = 표(칸(0, 0, '업체명'), 칸(0, 1, ''), 칸(1, 0, '전화번호'));
  const r = A.채우기(xml, { '{{회사명}}': '가나', '{{대표전화}}': '041-1234-5678' });
  const 세기 = (s, re) => (s.match(re) || []).length;
  assert.equal(세기(r.xml, /<hp:tc>/g), 3, '칸 수가 달라졌습니다');
  assert.equal(세기(r.xml, /<hp:cellAddr/g), 3);
  assert.equal(세기(r.xml, /<hp:run\b/g), 세기(xml, /<hp:run\b/g), '런 수가 달라졌습니다');
});

test('알아본 자리를 미리 보여 준다 (서식을 들일 때 눈으로 확인한다)', () => {
  const xml = 표(칸(0, 0, '업체명'), 칸(1, 0, '성명 Name of the employee'));
  const 본것 = A.미리보기(xml);
  assert.equal(본것.length, 1, '근로자 칸까지 채우려 합니다');
  assert.equal(본것[0].토큰, '{{회사명}}');
});

/* ⑤ 사전을 넓히는 길이 열려 있다 — 새 서식은 «한 줄»로 붙는다 */
test('사전 한 줄로 새 이름표를 붙일 수 있다', () => {
  assert.ok(Array.isArray(A.사전) && A.사전.length >= 8);
  for (const 항 of A.사전) {
    assert.match(항.토큰, /^\{\{.+\}\}$/, '토큰 모양이 다릅니다: ' + 항.토큰);
    assert.ok(항.말.length >= 1);
  }
});

/* ⑥ ERP 가 이 층을 실제로 부른다 */
test('ERP 가 자동 채우기 층을 캐시 번호와 함께 불러온다', () => {
  const fs = require('node:fs');
  const erp = fs.readFileSync(path.resolve(__dirname, '../pu-erp.html'), 'utf8');
  assert.match(erp, /src="js\/pu-form-auto\.js\?v=\d+"/,
    '캐시 번호가 없으면 고쳐도 브라우저가 옛 파일을 씁니다');
});
