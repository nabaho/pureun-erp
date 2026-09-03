'use strict';
/* 자문·고문 — 이름 없이 세기 · 내보낼 때 가림
   대표 결정 2026-09-03 「목록 보이고 내보낼떄 가림」. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../js/kcareer-adv-summary.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

function funcSource(name) {
  const m = source.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수가 있어야 합니다');
  return m[0];
}

const ROWS = [
  { org: '(주)가온정밀', bizType: '제조업', size: '중기업',   insured: 148, start: '2019-04-01', end: '',           status: '진행' },
  { org: '(주)나래물류', bizType: '운수업', size: '중기업',   insured: 210, start: '2020-07-01', end: '',           status: '진행' },
  { org: '다솜유통(주)', bizType: '도소매업', size: '소기업', insured: 42,  start: '2021-03-15', end: '',           status: '진행' },
  { org: '(주)라온전자', bizType: '제조업', size: '중견기업', insured: 530, start: '2017-01-02', end: '',           status: '진행' },
  { org: '마루서비스(주)', bizType: '서비스업', size: '소기업', insured: 38, start: '2018-05-01', end: '2023-06-30', status: '종료' },
  { org: '(주)바다상사', bizType: '도소매업', size: '소기업',  insured: 25, start: '2016-09-01', end: '2021-12-31', status: '종료' }
];
const TODAY = '2026-09-03';

/* ───────── 가리기 ───────── */

test('업태로 가린 이름을 만든다', () => {
  assert.equal(A.maskName('제조업'), '○○제조사');
  assert.equal(A.maskName('도소매업'), '○○도소매사');
  assert.equal(A.maskName('서비스업'), '○○서비스사');
  assert.equal(A.maskName(''), '○○사', '업태를 모르면 업태 없이 가린다');
});

test('같은 업태가 여럿이면 번호로 갈라 준다', () => {
  const out = A.maskRows(ROWS);
  const names = out.map((r) => r.org);
  assert.equal(names[0], '○○제조사');
  assert.equal(names[3], '○○제조사2', 'CSV 는 줄이 여럿이라 서로 구분돼야 한다');
  assert.equal(new Set(names).size, names.length, '가린 이름이 겹치면 안 됩니다');
});

test('★ 가리기는 사본을 준다 — 원본 목록은 그대로다', () => {
  const before = ROWS.map((r) => r.org);
  A.maskRows(ROWS);
  assert.deepEqual(ROWS.map((r) => r.org), before, '목록 화면의 이름이 바뀌면 안 됩니다');
});

test('가려도 세는 값은 그대로 남는다', () => {
  const out = A.maskRows(ROWS);
  assert.equal(out[3].insured, 530);
  assert.equal(out[3].bizType, '제조업');
  assert.equal(out[3].size, '중견기업');
});

/* ───────── 세기 ───────── */

test('진행·종료를 갈라 세고 근로자를 합한다', () => {
  const s = A.summarize(ROWS, TODAY);
  assert.equal(s.liveCount, 4);
  assert.equal(s.allCount, 6);
  assert.equal(s.sumLive, 148 + 210 + 42 + 530);
  assert.equal(s.sumAll, 148 + 210 + 42 + 530 + 38 + 25);
});

test('업태·규모를 묶어 센다', () => {
  const s = A.summarize(ROWS, TODAY);
  assert.equal(s.byBiz['제조업'], 2);
  assert.equal(s.byBiz['도소매업'], 2);
  assert.equal(s.bySize['소기업'], 3);
  assert.equal(s.bySize['중견기업'], 1);
});

test('평균 자문기간은 진행 중인 곳은 오늘까지 센다', () => {
  const s = A.summarize(ROWS, TODAY);
  assert.ok(s.avgYears > 5 && s.avgYears < 8, '실제 값: ' + s.avgYears);
});

test('배제된 줄은 세지 않는다', () => {
  const s = A.summarize(ROWS.concat([{ org: 'x', bizType: '제조업', insured: 9999,
    start: '2020-01-01', status: '진행', excluded: true }]), TODAY);
  assert.equal(s.allCount, 6);
  assert.equal(s.byBiz['제조업'], 2);
});

test('날짜가 뒤집힌 줄은 기간 셈에서 뺀다', () => {
  const s = A.summarize([{ org: 'a', bizType: '제조업', insured: 10,
    start: '2024-01-01', end: '2020-01-01', status: '종료' }], TODAY);
  assert.equal(s.avgYears, 0, '음수 기간이 평균을 망가뜨리면 안 됩니다');
});

test('시계에 매달리지 않는다 — today 를 주면 늘 같은 답', () => {
  const a = A.summarize(ROWS, '2026-09-03').avgYears;
  const b = A.summarize(ROWS, '2026-09-03').avgYears;
  assert.equal(a, b);
  assert.notEqual(A.summarize(ROWS, '2020-09-03').avgYears, a, 'today 가 실제로 쓰여야 합니다');
});

/* ───────── 문장 ───────── */

test('문장에 고객사 이름이 한 곳도 없다', () => {
  const txt = A.sentence(A.summarize(ROWS, TODAY));
  ROWS.forEach((r) => {
    assert.ok(txt.indexOf(r.org) < 0, '고객사 이름이 새어 들었습니다: ' + r.org);
  });
  assert.match(txt, /4개 사업장/);
  assert.match(txt, /930명/, '근로자 합계가 천 단위로 찍혀야 합니다');
});

test('기관 업태를 주면 대응 문장을 붙인다', () => {
  const txt = A.sentence(A.summarize(ROWS, TODAY), ['도소매업', '운수업']);
  assert.match(txt, /도소매업·운수업 분야가 3곳/);
});

test('★ 겹치는 업태가 없으면 대응 문장을 지어내지 않는다', () => {
  const txt = A.sentence(A.summarize(ROWS, TODAY), ['광업', '어업']);
  assert.ok(txt.indexOf('직접 대응') < 0, '없는 대응을 있다고 쓰면 허위기재다');
});

test('★ 300인 이상이 없으면 그 문장을 쓰지 않는다', () => {
  const small = ROWS.filter((r) => r.insured < 300);
  const txt = A.sentence(A.summarize(small, TODAY));
  assert.ok(txt.indexOf('300인 이상') < 0);
  const txt2 = A.sentence(A.summarize(ROWS, TODAY));
  assert.match(txt2, /300인 이상/, '실제로 있으면 밝힌다');
});

test('실적이 없으면 빈 글자를 준다', () => {
  assert.equal(A.sentence(A.summarize([], TODAY)), '');
});

/* ───────── kcareer.html 배선 ───────── */

test('요약 모듈을 외부 파일로 로드한다', () => {
  assert.match(source, /<script src="js\/kcareer-adv-summary\.js(\?v=\d+)?"><\/script>/);
});

test('★ CSV 로 내보낼 때 자문 고객사 이름을 가린다', () => {
  const src = funcSource('exportCsv');
  assert.match(src, /exportMask/, '화면별 가림 갈고리가 있어야 합니다');
  assert.match(source, /exportMask:\s*rows\s*=>\s*KcareerAdvSummary\.maskRows\(rows\)/,
    'advisory 에 가림이 걸려 있어야 합니다');
});

test('자문 화면에 지원서 문장 칸이 있다', () => {
  assert.match(source, /id="advSummary"/);
  assert.match(source, /function renderAdvSummary/);
});

test('★ 목록 표는 이름을 가리지 않는다', () => {
  // 대표 결정: 「목록 보이고 내보낼 때 가림」.
  // ⚠ 설정 블록 «전체»를 보면 안 된다 — exportMask 가 그 안에서 maskRows 를 부르는 것이
  //   바로 우리가 원한 것이다. 봐야 할 곳은 «줄을 그리는» row 템플릿뿐이다.
  // ⚠ 정규식 [\s\S]*? 로 끝을 찾으면 advisory 항목을 지나 한참 뒤까지 잡힌다(실제로 6만 자).
  //   항목의 끝은 row 템플릿을 닫는 백틱+`},` 이므로 그것으로 자른다.
  const start = source.indexOf("advisory:{store:'advisory'");
  assert.ok(start > 0, 'CAREER_CFG.advisory 를 찾아야 합니다');
  const end = source.indexOf('`},', start);
  assert.ok(end > start, 'advisory 항목의 끝을 찾아야 합니다');
  const cfg = source.slice(start, end);
  const rowTpl = cfg.slice(cfg.indexOf('row:'));
  assert.ok(rowTpl.indexOf('row:') === 0, 'row 템플릿을 찾아야 합니다');
  assert.ok(rowTpl.indexOf('mask') < 0, '목록에서 가리면 안에서 일을 할 수 없습니다');
  assert.match(rowTpl, /\$\{r\.org\|\|'-'\}/, '목록은 고객사 이름을 그대로 보여 준다');
  assert.match(cfg, /exportMask/, '가림은 내보내는 자리에만 걸려 있어야 한다');
});
