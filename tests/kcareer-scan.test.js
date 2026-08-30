'use strict';
// kcareer 서류 폴더 스캔·판정 모듈 단위테스트 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const KS = require('../js/kcareer-scan.js');

test('isIgnoredFile: 임시·잠금·부산물 파일은 읽지 않는다', () => {
  assert.equal(KS.isIgnoredFile('.~lock.경력증명서 서류목록.xlsx#'), true);
  assert.equal(KS.isIgnoredFile('~$사무실사건.xlsx'), true);
  assert.equal(KS.isIgnoredFile('4NZFL.DOCX'), true);
  assert.equal(KS.isIgnoredFile('CLAUDE.md'), true);
  assert.equal(KS.isIgnoredFile('test_write'), true);
  assert.equal(KS.isIgnoredFile(''), true);
});

test('isIgnoredFile: 실제 서류는 읽는다', () => {
  assert.equal(KS.isIgnoredFile('2015 체당금국선노무사 위촉장 (2015.12.17).pdf'), false);
  assert.equal(KS.isIgnoredFile('위촉장.jpg'), false);
  assert.equal(KS.isIgnoredFile('컨설팅_실적증명_목록.xlsx'), false);
});

test('cleanCore: 확장자·발급일 괄호·사본 연번을 떼고 끝을 다듬는다', () => {
  assert.equal(KS.cleanCore('2015 체당금국선노무사 위촉장 (2015.12.17).pdf'), '2015 체당금국선노무사 위촉장');
  assert.equal(KS.cleanCore('충남지회 회장 위촉장 (2).pdf'), '충남지회 회장 위촉장');
  assert.equal(KS.cleanCore('4. 협약서.hwp'), '협약서');
  assert.equal(KS.cleanCore('위촉장_.jpg'), '위촉장');
});

test('cleanCore: 앞쪽 정리 연번을 뗀다 — 같은 서류가 여러 건으로 갈라지지 않게', () => {
  // 실제 폴더에 같은 충남도청 표창장이 연번만 다르게 4가지로 들어 있다
  assert.equal(KS.cleanCore('7-1. 2018충남도청(양승조)- 표창장.pdf'), '2018충남도청(양승조)- 표창장');
  assert.equal(KS.cleanCore('9-1.충남도청- 표창장.pdf'), '충남도청- 표창장');
  assert.equal(KS.cleanCore('18. 충남도청- 표창장.pdf'), '충남도청- 표창장');
  assert.equal(KS.cleanCore('10-2해양수산부(조승환)_표창장.pdf'), '해양수산부(조승환)_표창장');
  assert.equal(KS.cleanCore('9-3해양수산부_표창장.pdf'), '해양수산부_표창장');
  assert.equal(KS.cleanCore('12. 충남지회 회장 위촉장.pdf'), '충남지회 회장 위촉장');
  assert.equal(KS.cleanCore('1-1. (신청서)사업장방문교육신청서(수강생작성).hwp'), '(신청서)사업장방문교육신청서(수강생작성)');
});

test('cleanCore 회귀: 앞이 연도면 연번으로 보고 떼지 않는다', () => {
  assert.equal(KS.cleanCore('2015 체당금국선노무사 위촉장.pdf'), '2015 체당금국선노무사 위촉장');
  assert.equal(KS.cleanCore('2023 일터혁신.png'), '2023 일터혁신');
  assert.equal(KS.cleanCore('2023-2024 기술보호 실적증명서.pdf'), '2023-2024 기술보호 실적증명서');
  assert.equal(KS.cleanCore('20150507 위촉장.pdf'), '20150507 위촉장');
  assert.equal(KS.cleanCore('1999 옛자료 위촉장.pdf'), '1999 옛자료 위촉장');
});

test('extOf: 소문자 확장자', () => {
  assert.equal(KS.extOf('인력양성사업 협약서.PDF'), 'pdf');
  assert.equal(KS.extOf('위촉장.jpg'), 'jpg');
  assert.equal(KS.extOf('test_write'), '');
});

test('classify 확실: 이름 끝이 결과물 단어이고 원본 확장자면 승격', () => {
  assert.deepEqual(KS.classify('2015 질병판정위원회 위원 위촉장 (2015.05.07).pdf'),
    { level: 'sure', store: 'wiccok', type: '위촉장', titleHint: '' });
  assert.deepEqual(KS.classify('2017 대전질판위 재위촉 (2017.04.28).pdf'),
    { level: 'sure', store: 'wiccok', type: '위촉장', titleHint: '' });
  assert.deepEqual(KS.classify('인력양성사업 협약서.PDF'),
    { level: 'sure', store: 'wiccok', type: '협약서', titleHint: '' });
  assert.deepEqual(KS.classify('2025 충청남도 표창장.pdf'),
    { level: 'sure', store: 'wiccok', type: '표창', titleHint: '' });
  assert.deepEqual(KS.classify('공인노무사자격증.pdf'),
    { level: 'sure', store: 'cert', type: '', titleHint: '자격' });
  assert.deepEqual(KS.classify('2017 기업복지컨설팅 교육 수료증 (2017.04.18).pdf'),
    { level: 'sure', store: 'cert', type: '', titleHint: '수료' });
  assert.deepEqual(KS.classify('2.권형하노무사 경력증명서.pdf'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'own' });
});

test('certKindOf: 외부기관 발급과 본인 경력증명을 가른다', () => {
  assert.equal(KS.certKindOf('2024 구조혁신지원사업 컨설팅 수행실적 증명서_성문전자(주)_권형하'), 'ext');
  assert.equal(KS.certKindOf('실적증명서_(주)선진테크_권'), 'ext');
  assert.equal(KS.certKindOf('2.공인노무사회 정부위탁사업 참여확인서_권형하노무사'), 'ext');
  assert.equal(KS.certKindOf('2025년 산업·일자리전환 지원 컨설팅 수행 확인(푸른노무법인)'), 'ext');
  assert.equal(KS.certKindOf('경력증명서-푸른'), 'own');
  assert.equal(KS.certKindOf('재직증명서-권형하'), 'own');
  assert.equal(KS.certKindOf('2015 체당금국선노무사 위촉장'), '');
});

test('classify: 증명서 낱말은 이름 끝이 아니어도 승격한다 (실사용 190건 누락)', () => {
  // 증명서 파일명은 '증명서_대상_본인이름' 꼴이 흔해 '이름 끝' 규칙으로는 전부 놓쳤다
  assert.deepEqual(KS.classify('2024 구조혁신지원사업 컨설팅 수행실적 증명서_(주)코시노인터네셔널_권형하.pdf'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'ext' });
  assert.deepEqual(KS.classify('경력증명서-푸른.pdf'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'own' });
  assert.deepEqual(KS.classify('재직증명서-권형하.pdf'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'own' });
  assert.deepEqual(KS.classify('실적증명서- 중소벤처기업부 비즈니스지원단.pdf'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'ext' });
  assert.deepEqual(KS.classify('실적증명서_(주)영도_권.jpg'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'ext' });
  assert.deepEqual(KS.classify('2025년 산업·일자리전환 지원 컨설팅 수행 확인(푸른노무법인).pdf'),
    { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: 'ext' });
});

test('classify 증명서: 부정어·확장자 제한은 그대로 걸러낸다', () => {
  // 실측으로 확인된 3건 — 신청서 묶음과 빈 양식
  assert.equal(KS.classify('신청서 및 실적증명서.pdf').level, 'submission');
  assert.equal(KS.classify('실적증명서_양식.hwp').level, 'submission');
  assert.equal(KS.classify('붙임4. 컨설팅 수행실적 증명서 표준양식.hwp').level, 'submission');
  assert.equal(KS.classify('컨설팅_실적증명_목록.xlsx').level, 'submission');
  assert.equal(KS.classify('능률협회,공인노무사회경력증명서.zip').level, 'maybe');   // zip은 원본 확장자 아님
});

test('classify 회귀: 증명서 규칙이 위촉장으로 새지 않는다', () => {
  assert.equal(KS.classify('위촉장 목록.xlsx').level, 'submission');
  assert.equal(KS.classify('★ 노동권익보호관 위촉식 시나리오.hwp').level, 'submission');
  assert.equal(KS.classify('★ 제1기 노동권익보호관 위촉 대상자 명단.hwp').level, 'submission');
  assert.equal(KS.classify('위촉 동의서.hwp').level, 'submission');
  assert.equal(KS.classify('위촉장 사본 스캔.pdf').level, 'maybe');
  // 위촉장 판정에는 certKind가 붙지 않는다
  assert.deepEqual(KS.classify('2015 질병판정위원회 위원 위촉장 (2015.05.07).pdf'),
    { level: 'sure', store: 'wiccok', type: '위촉장', titleHint: '' });
});

test('classify 제출서류: 결과물 단어가 끝이 아니거나 부정어가 있으면 승격하지 않는다', () => {
  assert.equal(KS.classify('위촉장 목록.xlsx').level, 'submission');
  assert.equal(KS.classify('★ 노동권익보호관 위촉식 시나리오.hwp').level, 'submission');
  assert.equal(KS.classify('★ 제1기 노동권익보호관 위촉 대상자 명단.hwp').level, 'submission');
  assert.equal(KS.classify('위촉 동의서.hwp').level, 'submission');
  assert.equal(KS.classify('신청서 및 실적증명서.pdf').level, 'submission');
  assert.equal(KS.classify('2019년도 경영컨설팅 신청공고.hwp').level, 'submission');
});

test('classify 애매: 결과물 단어가 중간에 있거나 원본 확장자가 아니면 사람이 확인', () => {
  assert.equal(KS.classify('2023.2024 기술보호 컨설팅전문가+상담현황_20250318.xlsx').level, 'submission');
  assert.equal(KS.classify('위촉장 사본 스캔.pdf').level, 'maybe');
  assert.equal(KS.classify('능률협회,공인노무사회경력증명서.zip').level, 'maybe');
});

test('classify 회귀: 상공회의소 위촉장은 절대 걸러지지 않는다 (부정어에 회의 금지)', () => {
  // 부정어에 '회의'를 넣으면 '상공회의소'가 걸려 진짜 위촉장이 사라진다 — 설계서 7.3 경고
  assert.equal(KS.classify('2019 천안북부상공회의소 경영상담사 위촉장 (2019.05.17).pdf').level, 'sure');
  assert.equal(KS.classify('2020 충남북부상공회의소 자문위원 위촉장 (2020.07.17).pdf').level, 'sure');
  assert.equal(KS.classify('2019 상공회의소 경영상담 위촉장.pdf').level, 'sure');
});

test('classify: 제외 파일은 ignore', () => {
  assert.equal(KS.classify('4NZFL.DOCX').level, 'ignore');
  assert.equal(KS.classify('.~lock.경력증명서 서류목록.xlsx#').level, 'ignore');
});

test('pickYear: 파일명 → 경로 → 수정일 순서로 연도를 정한다', () => {
  assert.deepEqual(
    KS.pickYear('2015 체당금국선노무사 위촉장 (2015.12.17).pdf', '1. 위촉장/2015 체당금국선노무사 위촉장 (2015.12.17).pdf', '2015-12-17T00:00:00.000Z'),
    { year: '2015', from: 'name', needCheck: false });
  assert.deepEqual(
    KS.pickYear('위촉장.jpg', '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/위촉장.jpg', '2020-01-02T00:00:00.000Z'),
    { year: '2019', from: 'path', needCheck: false });
  assert.deepEqual(
    KS.pickYear('실적증명서.hwp', '6. 컨설팅 실적증명/실적증명서.hwp', '2024-03-05T00:00:00.000Z'),
    { year: '2024', from: 'mtime', needCheck: true });
  assert.deepEqual(
    KS.pickYear('실적증명서.hwp', '6. 컨설팅 실적증명/실적증명서.hwp', ''),
    { year: '', from: 'none', needCheck: true });
});

test('orgFromCaseDir: 건 폴더명 앞쪽 연도·번호를 떼고 기관을 뽑는다', () => {
  assert.equal(KS.orgFromCaseDir('2019경제진흥원컨설턴트'), '경제진흥원컨설턴트');
  assert.equal(KS.orgFromCaseDir('2019 충남 도청사업'), '충남 도청사업');
  assert.equal(KS.orgFromCaseDir('2024 경영평가위원모집'), '경영평가위원모집');
  assert.equal(KS.orgFromCaseDir('2019. 일터혁신자료'), '일터혁신자료');
  assert.equal(KS.orgFromCaseDir('2018청소년권익센타'), '청소년권익센타');
});

test('caseKeyOf: 7번 폴더의 연도/건 폴더만 건으로 묶는다', () => {
  assert.equal(
    KS.caseKeyOf('7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/위촉장.jpg'),
    '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트');
  assert.equal(
    KS.caseKeyOf('7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/하위/더깊은/파일.pdf'),
    '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트');
  // 연도 폴더 직속 낱파일은 건이 아니다 (파일 1개 = 1건)
  assert.equal(KS.caseKeyOf('7. 컨설턴트,위원신청등/2019년/낱파일.pdf'), null);
  // 다른 폴더는 건 묶음 대상이 아니다
  assert.equal(KS.caseKeyOf('1. 위촉장/2015 체당금국선노무사 위촉장 (2015.12.17).pdf'), null);
  assert.equal(KS.caseKeyOf('권형하_전체이력현황.xlsx'), null);
});

const FIXTURE = [
  // 1번 폴더 — 파일 1개 = 1건, 승격
  { name: '2015 체당금국선노무사 위촉장 (2015.12.17).pdf', relPath: '1. 위촉장/2015 체당금국선노무사 위촉장 (2015.12.17).pdf', size: 100, mtime: '2015-12-17T00:00:00.000Z' },
  // 1번 폴더 — ⚪ 제출서류
  { name: '위촉장 목록.xlsx', relPath: '1. 위촉장/위촉장 목록.xlsx', size: 200, mtime: '2020-01-01T00:00:00.000Z' },
  // 7번 건 폴더 — 승격 1건 + 잡음 1건
  { name: '위촉장.jpg', relPath: '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/위촉장.jpg', size: 300, mtime: '2020-05-05T00:00:00.000Z' },
  { name: '신청서.hwp', relPath: '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/신청서.hwp', size: 400, mtime: '2019-03-03T00:00:00.000Z' },
  // 7번 연도 직속 낱파일 — 건이 아니다
  { name: '공고문.hwp', relPath: '7. 컨설턴트,위원신청등/2020년/공고문.hwp', size: 500, mtime: '2020-02-02T00:00:00.000Z' },
  // 사본 — 위 위촉장.jpg와 name+size 동일
  { name: '위촉장.jpg', relPath: '7. 컨설턴트,위원신청등/2020년/2020충남도청/위촉장.jpg', size: 300, mtime: '2020-06-06T00:00:00.000Z' },
  // 제외 파일
  { name: '4NZFL.DOCX', relPath: '1. 위촉장/4NZFL.DOCX', size: 0, mtime: '2026-07-30T00:00:00.000Z' }
];

test('buildRecords: 제외·사본을 걸러내고 승격·보류·제출서류로 나눈다', () => {
  const r = KS.buildRecords(FIXTURE, { scanId: 'S-TEST' });
  assert.equal(r.ignored, 1);
  assert.equal(r.copies.length, 1);
  assert.equal(r.copies[0].sameAs, '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/위촉장.jpg');
  assert.equal(r.promotions.length, 2);
  assert.equal(r.maybes.length, 0);
});

test('buildRecords: 승격 레코드에 연도·기관·출처가 채워진다', () => {
  const r = KS.buildRecords(FIXTURE, { scanId: 'S-TEST' });
  const fromCase = r.promotions.find((p) => p.relPath.startsWith('7. '));
  assert.equal(fromCase.store, 'wiccok');
  assert.equal(fromCase.type, '위촉장');
  assert.equal(fromCase.year, '2019');            // 파일명에 연도 없음 → 경로에서
  assert.equal(fromCase.yearFrom, 'path');
  assert.equal(fromCase.org, '경제진흥원컨설턴트');
  assert.equal(fromCase.fromCase, '7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트');
  assert.equal(fromCase.src, 'fs');
  assert.equal(fromCase.scanId, 'S-TEST');
});

test('buildRecords: 7번은 건 단위, 승격된 파일도 건 첨부에 남는다', () => {
  const r = KS.buildRecords(FIXTURE, { scanId: 'S-TEST' });
  const kase = r.submissions.find((s) => s.caseDir.endsWith('2019경제진흥원컨설턴트'));
  assert.equal(kase.fileCount, 2);                                  // 위촉장.jpg + 신청서.hwp
  assert.equal(kase.year, '2019');
  assert.equal(kase.org, '경제진흥원컨설턴트');
  assert.deepEqual(kase.promoted, ['7. 컨설턴트,위원신청등/2019년/2019경제진흥원컨설턴트/위촉장.jpg']);
});

test('buildRecords: 건 밖 제출서류는 파일 1개 = 1건, 승격된 파일은 제출서류를 만들지 않는다', () => {
  const r = KS.buildRecords(FIXTURE, { scanId: 'S-TEST' });
  const paths = r.submissions.map((s) => s.caseDir || s.files[0].relPath);
  assert.ok(paths.includes('1. 위촉장/위촉장 목록.xlsx'));
  assert.ok(paths.includes('7. 컨설턴트,위원신청등/2020년/공고문.hwp'));
  assert.ok(!paths.includes('1. 위촉장/2015 체당금국선노무사 위촉장 (2015.12.17).pdf'));
  assert.equal(r.submissions.length, 4);          // 건 2개 + 낱파일 2개
});

test('buildRecords: 사본도 건 첨부 목록에는 남는다 — 그 사업에 무엇을 냈는지가 정보다', () => {
  const r = KS.buildRecords(FIXTURE, { scanId: 'S-TEST' });
  // 2020충남도청 건은 사본 1개로만 이뤄져 있지만 건 자체는 만들어져야 한다
  const copyOnly = r.submissions.find((s) => s.caseDir.endsWith('2020충남도청'));
  assert.ok(copyOnly, '사본만 있는 건도 목록에 남아야 합니다');
  assert.equal(copyOnly.fileCount, 1);
  assert.deepEqual(copyOnly.promoted, []);        // 사본은 승격하지 않는다
  // 승격은 여전히 2건뿐 — 사본이 위촉장 목록을 오염시키지 않는다
  assert.equal(r.promotions.length, 2);
  assert.equal(r.copies.length, 1);
});

/* ===== ★★ 표창은 「이름 어느 자리에든」 (2026-08-30) ===== */

test('★★ 기관명이 뒤에 붙은 표창장도 잡는다 — 「이름 끝」만 보면 놓친다', () => {
  // 실측: 「2025 표창장 노사분쟁조정중재단 충청남도.jpg」가 애매로 빠져 등록이 안 됐다.
  // 증명서 때와 똑같은 사연이다(2026-08-06 CERT_ANY).
  [
    '2025 표창장 노사분쟁조정중재단 충청남도.jpg',
    '2017 민주당표창장.pdf',
    '2021 한국경영기술지도사회(김오연)_우수사례표창.pdf',
    '2022 해양수산부(조승환)_표창장.pdf',
  ].forEach((f) => {
    const r = KS.classify(f);
    assert.equal(r.level, 'sure', f + ' 는 확실해야 합니다');
    assert.equal(r.type, '표창');
    assert.equal(r.store, 'wiccok');
  });
});

test('★★ 상을 «받기 전» 서류는 표창이 아니다 — 추천서·후보자', () => {
  // 표창을 넓히면서 함께 막지 않으면 추천서가 표창으로 등록된다
  ['2023년 노사민정협력활성화 유공표창 후보자 추천서.pdf',
   '표창 추천서.pdf'].forEach((f) => {
    assert.notEqual(KS.classify(f).type, '표창', f + ' 는 표창이 아닙니다');
  });
});

test('★★ 위촉장·자격증은 «이름 끝» 규칙 그대로다 — 넓히면 오탐이 난다', () => {
  // ⚠ 표창만 넓혔다. 위촉장까지 넓히면 「위촉장 목록」이 위촉장이 된다.
  assert.notEqual(KS.classify('위촉장 목록.xlsx').level, 'sure', '목록은 위촉장이 아닙니다');
  assert.notEqual(KS.classify('위촉식 시나리오.hwp').level, 'sure');
  // ⚠ 부정어에 '회의'를 넣으면 상공회의소 위촉장이 오탐된다
  const c = KS.classify('2026 상공회의소 위촉장.pdf');
  assert.equal(c.level, 'sure');
  assert.equal(c.type, '위촉장');
});
