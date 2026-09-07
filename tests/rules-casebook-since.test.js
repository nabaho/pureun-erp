'use strict';
/* 「그 뒤 시행 N」 — 서고를 «명단»으로 바꾸는 자리 (대표 물음 2026-09-07 「취규 내용검토 필요한가?」)
 *
 * ★ 답: 필요하다. 그리고 그것이 서고의 값어치다.
 *   법이 계속 바뀐다. 규칙집 92개 중 18개에 시행일이 붙어 있고, 2022년 회차 뒤로만
 *   열 개가 시행됐다. 마지막 개정이 오래된 사업장은 그것들을 못 반영했을 수 있다.
 *
 * ★★ 그런데 「위반」이라 말하면 안 된다. 서고의 회차는 «그때 우리가 낸 것»이지
 *   «지금 그 회사가 쓰는 것»이 아니다. 우리를 안 거치고 자체 개정했을 수도 있다.
 *   그래서 「마지막으로 본 것이 언제이고 그 뒤 시행된 것이 몇 개인가」까지만 말한다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
/* ⚠ 줄끝을 고른다. 이 저장소는 윈도우에서 CRLF 로 내려오고, 아래 정규식은
     `];\n` 처럼 «글자 뒤에 곧바로 줄바꿈» 을 찾는다 — `];\r\n` 은 안 맞아
     「규칙집을 못 찾았습니다」로 죽는다(2026-09-07 윈도우에서 넷이 그랬다).
     CI(리눅스)는 LF 라 초록이어서 아무도 못 봤다. */
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const RAW = [
  { id: 'X1', name: '임금명세서 교부', law: '근로기준법 §48', category: '최신개정', effective: '2021-11-19' },
  { id: 'X2', name: '출산전후휴가',   law: '근로기준법 §74', category: '최신개정', effective: '2025-02-23' },
  { id: 'X3', name: '노동절 명칭',    law: '',               category: '최신개정', effective: '2026-05-01' },
  { id: 'X4', name: '연차 시간단위',  law: '',               category: '최신개정', effective: '2027-06-10' },
  { id: 'Y1', name: '시행일 없는 규칙', law: '', category: '필수기재', effective: '' },
  { id: 'Y2', name: '날짜가 이상한 것', law: '', category: '권장',     effective: '2025년' }
];
const 오늘 = '2026-09-07';

test('★ 시행일이 «제대로 붙은 것»만 추린다 — 빈 값·이상한 글자는 뺀다', () => {
  const d = CB.datedRules(RAW);
  assert.deepEqual(Array.from(d, r => r.id), ['X1', 'X2', 'X3', 'X4']);
});

test('추린 것은 시행일 차례로 선다', () => {
  const d = CB.datedRules(RAW);
  assert.deepEqual(Array.from(d, r => r.effective),
    ['2021-11-19', '2025-02-23', '2026-05-01', '2027-06-10']);
});

test('★★ 「이미 시행 중」과 「앞으로 시행」을 «섞지 않는다» — 앞엣것은 아직 안 지켜도 된다', () => {
  const d = CB.datedRules(RAW);
  const r = CB.sinceRules('2022', d, 오늘);
  assert.deepEqual(Array.from(r.since, x => x.id), ['X2', 'X3']);
  assert.deepEqual(Array.from(r.coming, x => x.id), ['X4']);
});

test('★ 회차 «그 해 안»에 시행된 것은 그 회차가 이미 봤다고 본다', () => {
  const d = CB.datedRules(RAW);
  /* 2021년 회차 — 2021-11-19 는 그 해 것이라 「그 뒤」가 아니다 */
  const r = CB.sinceRules('2021', d, 오늘);
  assert.ok(!r.since.some(x => x.id === 'X1'));
  /* 2020년 회차 — 그 뒤다 */
  assert.ok(CB.sinceRules('2020', d, 오늘).since.some(x => x.id === 'X1'));
});

test('★ 연도를 모르면 «0 이라고 하지 않는다» — 모르는 것과 없는 것은 다르다', () => {
  const d = CB.datedRules(RAW);
  assert.equal(CB.sinceRules('', d, 오늘).unknown, true);
  assert.equal(CB.sinceRules('연도미상', d, 오늘).unknown, true);
  const m = CB.markSince([{ site: 'ㄱ', lastYear: '' }], d, 오늘);
  assert.equal(m[0].sinceCount, null, '모르는 것을 0 으로 적으면 「다 반영됐다」로 읽힌다');
});

test('최근에 고친 곳은 그 뒤 시행된 것이 없다', () => {
  const d = CB.datedRules(RAW);
  assert.equal(CB.sinceRules('2026', d, 오늘).since.length, 0);
});

test('★ 목록 줄마다 셈을 붙이되 «본문은 안 읽는다» — lastYear 와 시행일만 견준다', () => {
  const d = CB.datedRules(RAW);
  const rows = CB.markSince([
    { site: '한빛산업', lastYear: '2021' },
    { site: '가나상사', lastYear: '2026' }
  ], d, 오늘);
  assert.equal(rows[0].sinceCount, 2);
  assert.equal(rows[1].sinceCount, 0);
  assert.equal(rows[0].comingCount, 1);
  /* 원래 줄을 안 뭉갠다 */
  assert.equal(rows[0].site, '한빛산업');
});

test('규칙집이 비어도 터지지 않는다', () => {
  assert.equal(CB.datedRules(null).length, 0);
  assert.equal(CB.sinceRules('2022', [], 오늘).since.length, 0);
  assert.equal(CB.markSince(null, [], 오늘).length, 0);
});

/* ── 진짜 규칙집으로 한 번 돌려 본다 ─────────────────────────────── */

test('★★ 실제 규칙집에서 «2022년 회차 뒤로 시행된 것»이 실제로 있다 — 이 기능의 존재 이유다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/const RULES = (\[[\s\S]*?\]);\n/);
  assert.ok(m, '규칙집을 못 찾았습니다');
  const d = CB.datedRules(JSON.parse(m[1]));
  assert.ok(d.length >= 5, '시행일 붙은 규칙이 너무 적습니다 — 규칙집이 바뀌었는지 보세요');
  const r = CB.sinceRules('2022', d, 오늘);
  assert.ok(r.since.length > 0,
    '2022년 회차 뒤로 시행된 규칙이 하나도 없다면 이 화면을 만들 까닭이 없습니다');
});

test('★ 오래된 회차일수록 «그 뒤 시행된 것»이 많거나 같다 — 셈이 거꾸로 가면 안 된다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');
  const d = CB.datedRules(JSON.parse(src.match(/const RULES = (\[[\s\S]*?\]);\n/)[1]));
  let 앞 = Infinity;
  ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'].forEach(y => {
    const n = CB.sinceRules(y, d, 오늘).since.length;
    assert.ok(n <= 앞, `${y}년이 그 앞 해보다 많습니다 — 셈이 거꾸로입니다`);
    앞 = n;
  });
});
