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

/* ===== 실제 기관 양식 모양 (2026-08-29) — 지방공기업평가원 위촉직이사 지원서 =====
   성명 칸에 (한글)/(한자), 전화번호 칸 안에 「자택:____ 직장:____」,
   현 근무처 칸에 「기관명 : 부서명 : 직위 :」가 한 칸에 들어 있다. */

test('칸 이름 확장: 현주소·휴대폰·기관명·부서명·직위·한자', () => {
  assert.equal(F.fieldKeyOf('현 주 소'), 'addr');
  assert.equal(F.fieldKeyOf('휴 대 폰'), 'phone');
  assert.equal(F.fieldKeyOf('기관명'), 'org');
  assert.equal(F.fieldKeyOf('부서명'), 'dept');
  assert.equal(F.fieldKeyOf('직위'), 'title');
  assert.equal(F.fieldKeyOf('한자'), 'nameHanja');
  assert.equal(F.fieldKeyOf('현 근무처'), 'org');
});

test('칸 안에 라벨이 있는 모양 — 「자택:____ 직장:____」을 채운다', () => {
  const xml = tbl([['전화번호', '자택:________  직장:________']]);
  const r = F.autoFill(xml, { fields: { phoneHome: '041-556-0035', phoneWork: '041-556-3656' } });
  assert.match(r.xml, /자택:041-556-0035/);
  assert.match(r.xml, /직장:041-556-3656/);
});

test('칸 안 라벨 — 「기관명 : 부서명 : 직위 :」 한 칸에 셋', () => {
  const xml = tbl([['현 근무처', '기관명 :        부서명 :        직위 :        ']]);
  const r = F.autoFill(xml, { fields: { org: '푸른노무법인', dept: '노무팀', title: '대표' } });
  assert.match(r.xml, /기관명 :\s*푸른노무법인/);
  assert.match(r.xml, /부서명 :\s*노무팀/);
  assert.match(r.xml, /직위 :\s*대표/);
});

test('칸 안 라벨 — 뒤에 이미 글자가 있으면 덮지 않는다', () => {
  const xml = tbl([['전화번호', '자택:041-000-0000  직장:________']]);
  const r = F.autoFill(xml, { fields: { phoneHome: '999', phoneWork: '041-556-3656' } });
  assert.match(r.xml, /자택:041-000-0000/, '이미 적힌 번호는 그대로');
  assert.ok(!/자택:999/.test(r.xml));
  assert.match(r.xml, /직장:041-556-3656/, '빈자리만 채운다');
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

/* ═══ ★ 라벨 사전 넓히기 (2026-09-05, 대표 지시 「1, 2 해라」) ═══
   ■ 왜
     칸 이름을 못 알아보면 그 칸은 «비어서» 나간다. 사전을 넓히는 것이 가장 싸게
     효과가 큰 일이다 — 코드를 바꾸지 않고 알아보는 양식이 늘어난다.
   ⚠ 그런데 넓힐수록 «남의 표»를 건드릴 위험도 같이 는다. 아래 두 검사가 그 빗장이다. */

test('★ 사람 이름 칸은 부르는 말이 여럿이다 — 위원·강사·심사위원·응시자', () => {
  ['위원명', '강사명', '자문위원', '심사위원', '평가위원', '응시자', '지원자',
   '피추천인', '작성자', '대표자', '본인성명']
    .forEach((w) => assert.equal(F.fieldKeyOf(w), 'name', w + ' 를 이름 칸으로 봐야 합니다'));
});

test('★ 연락처·주소·소속·직위도 양식마다 다르게 부른다', () => {
  const cases = {
    휴대전화번호: 'phone', 개인연락처: 'phone', 본인연락처: 'phone',
    사무실번호: 'phoneWork', 직장연락처: 'phoneWork',
    이메일주소: 'email', 전자메일: 'email',
    주소지: 'addr', 현거주지: 'addr', 우편물수령주소: 'addr',
    사무소주소: 'addrWork', 사업장주소: 'addrWork',
    소속기관명: 'org', 사업장명: 'org', 현소속: 'org', 사무소명: 'org',
    담당부서: 'dept', 소속팀: 'dept',
    직급: 'title', 현직: 'title', '직위/직급': 'title',
    보유자격증: 'license', 전문자격: 'license', '자격/면허': 'license',
    출생일: 'birth', 성별구분: 'gender', 한문성명: 'nameHanja'
  };
  Object.keys(cases).forEach((w) => assert.equal(F.fieldKeyOf(w), cases[w], w));
});

test('★ 괄호·공백은 떼고 본다 — 「성 명 (한글)」도 이름이다', () => {
  assert.equal(F.fieldKeyOf('성 명 (한글)'), 'name');
  assert.equal(F.fieldKeyOf('성명(한자)'), 'nameHanja');
});

test('★★ 「자격증명」은 인적 라벨이 아니다 — 자격증 «목록 표»의 머리칸이다', () => {
  /* 인적 라벨로 넣으면 그 머리칸 옆(첫 줄 첫 칸)에 자격 한 줄이 박혀 남의 표를 어지럽힌다. */
  assert.equal(F.fieldKeyOf('자격증명'), '');
  assert.equal(F.colKeyOf('자격증명'), 'certName');
});

test('★ 목록 표 머리칸도 넓혔다 — 수행기간·발주처·담당역할', () => {
  const cases = {
    수행기간: 'period', 위촉기간: 'period', 참여기간: 'period',
    출신교: 'school', 졸업학교: 'school',
    /* ★ 2026-09-06: 「학위」를 major 에서 떼어 degree 로 두었다.
       이력서에는 「전   공」과 「학   위」 칸이 따로 있는데 둘 다 major 로 뭉쳐 있어,
       같은 열쇠는 첫 열에만 넣는 규칙 때문에 «한 칸만» 채워졌다.
       「전공/학위」처럼 한 칸에 묶인 옛 서식은 그대로 major 이고,
       채우는 쪽이 major↔degree 로 서로 메워 뒷걸음질하지 않는다. */
    전공분야: 'major', '전공/학위': 'major', 학위명: 'degree', 학위: 'degree',
    단체명: 'org', 발주처: 'org', 주관기관: 'org', 소속기관: 'org',
    담당역할: 'role', 수행업무: 'role', 담당분야: 'role',
    자격증: 'certName', 종목: 'certName', 수여일: 'gotAt', 비고사항: 'note'
  };
  Object.keys(cases).forEach((w) => assert.equal(F.colKeyOf(w), cases[w], w));
});

test('★★ 머리행에 빈 칸이 있으면 머리행이 아니다 — 사전을 넓히면 오인이 는다', () => {
  /* ■ 실제로 난 사고 (2026-09-05)
       사전에 「소속기관」을 더했더니 「소속기관 | (빈칸) | 직위 | (빈칸)」 라는
       «보통 라벨 표»가 경력 목록으로 오인되어, 그 표에 채울 자리 4개가 0개가 됐다.
     머리행은 열 이름이 죽 적혀 있는 줄이라 빈 칸이 없다 — 그것으로 가른다.
     ⚠ 이 빗장을 풀지 말 것. 낱말을 더할 때마다 이 위험이 함께 는다.
     ⚠ 같은 빗장이 js/kcareer-formmap.js 의 detectList 에도 있다(둘이 같아야 한다). */
  const data = { fields: {}, career: [{ period: '2020', org: '푸른', role: '대표' }] };

  const r1 = F.autoFill(tbl([['소속기관', '', '직위', '']]), data);
  assert.equal(r1.report.lists.length, 0, '★ 보통 라벨 표를 목록 표로 보면 안 됩니다');

  const r2 = F.autoFill(tbl([['기간', '소속기관', '직위', '비고'], ['', '', '', '']]), data);
  assert.equal(r2.report.lists.length, 1, '진짜 머리행은 그대로 알아봐야 합니다');
  assert.equal(r2.report.lists[0].put, 1);
});

test('★ 칸 안 라벨도 넓혔다 — 「소속 : ___  직급 : ___」', () => {
  /* 실제 양식은 라벨과 빈자리가 «한 칸에» 들어 있는 경우가 많다.
     ⚠ 짧은 말(부서)은 긴 말(부서명) «뒤»에 두어야 한다 — 같은 열쇠는 먼저 걸린 것만
       쓰므로, 짧은 것이 먼저 걸리면 「부서명 :」에서 라벨 뒤를 못 찾아 통째로 빠진다. */
  const data = { fields: { org: '푸른노무법인', title: '대표노무사', dept: '노무1팀' } };
  const out = F.autoFill(tbl([['근무처', '소속 : ____  직급 : ____']]), data);
  assert.match(out.xml, /푸른노무법인/);
  assert.match(out.xml, /대표노무사/);

  const out2 = F.autoFill(tbl([['근무처', '부서명 : ____']]), data);
  assert.match(out2.xml, /노무1팀/, '★ 긴 말이 먼저 걸려야 합니다');
});
