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
  assert.equal(KS.cleanCore('4. 협약서.hwp'), '4. 협약서');
  assert.equal(KS.cleanCore('위촉장_.jpg'), '위촉장');
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
    { level: 'sure', store: 'certdoc', type: '', titleHint: '' });
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
