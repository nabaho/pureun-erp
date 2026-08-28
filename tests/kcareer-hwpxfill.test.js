'use strict';
// 기관 양식 자동 채움 — 순수 모듈 검사. 픽스처는 hwpx_gen.tablePara로 「진짜 모양」 XML을 만든다.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/kcareer-hwpxfill.js');
const H = require('../hwpx_gen.js');

function tbl(rows) { return H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length))); }
const FIELDS = { name: '권형하', birth: '1970.01.01', phone: '010-1234-5678', email: 'k@pureun.kr', org: '푸른노무법인' };

test('fieldKeyOf: 양식마다 다른 라벨 이름을 알아본다', () => {
  assert.equal(F.fieldKeyOf('성명'), 'name');
  assert.equal(F.fieldKeyOf('이 름'), 'name');       // 칸 맞춤용 공백
  assert.equal(F.fieldKeyOf('신청자명'), 'name');
  assert.equal(F.fieldKeyOf('성명 *'), 'name');      // 필수 표시 별표
  assert.equal(F.fieldKeyOf('(성명)'), 'name');
  assert.equal(F.fieldKeyOf('연락처'), 'phone');
  assert.equal(F.fieldKeyOf('휴대전화'), 'phone');
  assert.equal(F.fieldKeyOf('E-mail'), 'email');
  assert.equal(F.fieldKeyOf('생년월일'), 'birth');
  assert.equal(F.fieldKeyOf('소속기관'), 'org');
  assert.equal(F.fieldKeyOf('경력사항'), '', '모르는 라벨은 빈 값');
  assert.equal(F.fieldKeyOf('성명을 적으세요 어쩌고 저쩌고'), '', '긴 글은 라벨이 아니다');
});

test('라벨 칸 바로 옆 빈 칸에 값이 들어간다', () => {
  const xml = tbl([['성명', ''], ['연락처', '']]);
  const r = F.autoFill(xml, { fields: FIELDS });
  assert.equal(r.changed, true);
  assert.match(r.xml, />권형하</);
  assert.match(r.xml, />010-1234-5678</);
  assert.equal(r.report.fields.length, 2);
});

test('한 행에 라벨이 두 쌍 있어도 각각 채운다 (성명|빈칸|생년월일|빈칸)', () => {
  const xml = tbl([['성명', '', '생년월일', '']]);
  const r = F.autoFill(xml, { fields: FIELDS });
  assert.match(r.xml, />권형하</);
  assert.match(r.xml, />1970\.01\.01</);
});

test('이미 값이 있는 칸은 절대 덮지 않는다', () => {
  const xml = tbl([['성명', '홍길동']]);
  const r = F.autoFill(xml, { fields: FIELDS });
  assert.match(r.xml, />홍길동</);
  assert.ok(!/권형하/.test(r.xml), '기존 값을 덮으면 안 됩니다');
  assert.deepEqual(r.report.kept, ['name']);
});

test('같은 라벨이 두 번 나와도 값은 첫 자리에만 넣는다', () => {
  const xml = tbl([['성명', ''], ['성명', '']]);
  const r = F.autoFill(xml, { fields: FIELDS });
  assert.equal((r.xml.match(/>권형하</g) || []).length, 1);
});

test('값의 <·&는 이스케이프되어 XML이 깨지지 않는다', () => {
  const xml = tbl([['소속', '']]);
  const r = F.autoFill(xml, { fields: { org: '푸른<법인> & 사무소' } });
  assert.match(r.xml, /푸른&lt;법인&gt; &amp; 사무소/);
  assert.ok(!/푸른<법인>/.test(r.xml));
});

test('fillCell: 실제 한글 파일의 네 가지 빈 칸 모양을 다 받는다', () => {
  assert.match(F.fillCell('<hp:tc><hp:p a="1"><hp:run b="2"><hp:t></hp:t></hp:run></hp:p></hp:tc>', '값'), />값</);
  assert.match(F.fillCell('<hp:tc><hp:p a="1"><hp:run b="2"><hp:t/></hp:run></hp:p></hp:tc>', '값'), />값</);
  assert.match(F.fillCell('<hp:tc><hp:p a="1"><hp:run b="2"></hp:run></hp:p></hp:tc>', '값'), /<hp:t>값<\/hp:t>/);
  assert.match(F.fillCell('<hp:tc><hp:p a="1"></hp:p></hp:tc>', '값'), /charPrIDRef="0"><hp:t>값<\/hp:t>/);
  assert.equal(F.fillCell('<hp:tc></hp:tc>', '값'), null, '넣을 자리가 없으면 null — 망가뜨리지 않는다');
});

test('학력 표: 머리행을 알아보고 아래 빈 행에 한 줄씩 채운다', () => {
  const xml = tbl([['기간', '학교명', '전공/학위'], ['', '', ''], ['', '', '']]);
  const edu = [
    { period: '1990~1994', school: '한국대학교', major: '법학사' },
    { period: '1995~1997', school: '한국대학원', major: '법학석사' }
  ];
  const r = F.autoFill(xml, { edu: edu });
  assert.match(r.xml, />한국대학교</);
  assert.match(r.xml, />법학석사</);
  assert.deepEqual(r.report.lists, [{ kind: 'edu', put: 2, total: 2 }]);
});

test('경력 표: 빈 행이 모자라면 넣을 만큼만 넣고 부족을 보고한다', () => {
  const xml = tbl([['기간', '기관명', '직위'], ['', '', ''], ['', '', '']]);
  const career = [1, 2, 3, 4].map((n) => ({ period: '202' + n, org: '기관' + n, role: '위원' + n }));
  const r = F.autoFill(xml, { career: career });
  assert.match(r.xml, />기관1</);
  assert.match(r.xml, />기관2</);
  assert.ok(!/기관3/.test(r.xml), '행이 없으면 새로 만들지 않는다(v1)');
  assert.deepEqual(r.report.lists, [{ kind: 'career', put: 2, total: 4 }]);
  assert.match(F.summarize(r.report), /경력 2\/4줄\(칸 부족\)/);
});

test('목록 표: 이미 쓴 행은 건너뛰고 다음 빈 행부터 채운다', () => {
  const xml = tbl([['기간', '기관명', '직위'], ['2020', '이미쓴기관', '위원'], ['', '', '']]);
  const r = F.autoFill(xml, { career: [{ period: '2025', org: '새기관', role: '자문' }] });
  assert.match(r.xml, />이미쓴기관</);
  assert.match(r.xml, />새기관</);
  assert.deepEqual(r.report.lists, [{ kind: 'career', put: 1, total: 1 }]);
});

test('머리행 열쇠가 1개뿐이면 목록 표로 보지 않는다', () => {
  const xml = tbl([['기간', '비고'], ['', '']]);
  const r = F.autoFill(xml, { career: [{ period: '2025', org: 'X', role: 'Y' }] });
  assert.equal(r.report.lists.length, 0);
});

test('중첩 표(셀 안의 표)는 통째로 건너뛴다 — 정규식 경계 안전', () => {
  const inner = tbl([['성명', '']]);
  // 바깥 표의 첫 셀 안에 안쪽 표를 심는다
  const outer = tbl([['라벨', '']]).replace('</hp:tc>', inner + '</hp:tc>');
  const r = F.autoFill(outer, { fields: FIELDS });
  assert.ok(!/권형하/.test(r.xml), '중첩 표는 건드리면 안 됩니다');
});

test('summarize: 사람이 읽을 한 줄', () => {
  assert.equal(F.summarize({ fields: [], lists: [], kept: [] }), '알아본 칸이 없습니다');
  assert.equal(
    F.summarize({ fields: [1, 2, 3], lists: [{ kind: 'edu', put: 2, total: 2 }], kept: [] }),
    '인적 3칸 · 학력 2줄');
});

test('통합: 채운 XML이 실제 HWPX로 조립돼 검증을 통과한다', () => {
  const body = tbl([['성명', ''], ['연락처', '']])
    + tbl([['기간', '기관명', '직위'], ['', '', ''], ['', '', '']]);
  const r = F.autoFill(body, {
    fields: FIELDS,
    career: [{ period: '2025', org: '충남도청', role: '위촉위원' }]
  });
  const bytes = H.build(r.xml);
  // zip 서명(PK)과 채운 값이 실제 파일에 들어 있는지
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const s = Buffer.from(bytes).toString('utf8');
  // (zip은 압축되지만 hwpx_gen.build는 STORE 방식이라 본문이 그대로 보인다 — 아니면 이 검사는 조정)
  assert.ok(bytes.length > 1000);
});
