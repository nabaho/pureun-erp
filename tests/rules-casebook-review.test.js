'use strict';
/* 깊은 검토 — 회차 본문에 규칙을 돌린 «결과를 추리는» 부분 (대표 물음 2026-09-07)
 *
 * ★★ 이 화면이 가장 조심할 것 — 「위반의심 0」을 «깨끗하다»로 읽게 두면 안 된다.
 *   실제 규칙집 92개 가운데 27개는 「수동확인」이라 기계가 아예 판단하지 않는다.
 *   0 을 보고 안심하는 순간 그 27개가 통째로 사라진다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

/* ⚠ 줄끝을 가정하지 않는다 — 이 저장소는 윈도우에서 CRLF 로 내려온다.
     `];\n` 처럼 «글자 뒤에 곧바로 줄바꿈» 을 찾으면 `];\r\n` 을 못 맞춘다.
     그러면 match 가 null 이 되고, 검사는 「무엇이 틀렸는지」가 아니라
     TypeError 로 죽는다(2026-09-07 윈도우에서 넷이 그랬다. CI 는 LF 라 초록이었다).
   ★ 그래서 ㉠ 정규식을 `\r?\n` 으로 두고 ㉡ 못 찾으면 «까닭»을 적는다.
     읽는 자리가 둘이라 한 군데로 모았다 — 한쪽만 고치고 다른 쪽을 두는 일이 없게. */
function 규칙집() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8');
  const m = src.match(/const RULES = (\[[\s\S]*?\]);\r?\n/);
  assert.ok(m, 'rules.html 에서 규칙집(const RULES)을 못 찾았습니다 — 이름이 바뀌었는지 보세요'
    + '(줄끝은 CRLF·LF 둘 다 맞춥니다).');
  return JSON.parse(m[1]);
}

/* ── 규모 ─────────────────────────────────────────────────────────── */

test('★ 상시근로자 수를 검토 엔진이 쓰는 규모 열쇠로 옮긴다', () => {
  assert.equal(CB.sizeKeyOf(3), '5인미만');
  assert.equal(CB.sizeKeyOf(5), '5인이상');
  assert.equal(CB.sizeKeyOf(9), '5인이상');
  assert.equal(CB.sizeKeyOf(10), '10인이상');
  assert.equal(CB.sizeKeyOf(29), '10인이상');
  assert.equal(CB.sizeKeyOf(30), '30인이상');
  assert.equal(CB.sizeKeyOf(0), '5인미만');
});

test('★★ 모르면 «지어내지 않는다» — 규모에 따라 보는 규칙이 크게 달라진다', () => {
  assert.equal(CB.sizeKeyOf(null), null);
  assert.equal(CB.sizeKeyOf(undefined), null);
  assert.equal(CB.sizeKeyOf('열'), null);
  assert.equal(CB.sizeKeyOf(-1), null);
});

/* ── 결과 추리기 ──────────────────────────────────────────────────── */

const R = [
  { rule: { id: 'A1', name: '근로시간', law: '§93', category: '필수기재' }, status: '적합', loc: '제10조', note: '' },
  { rule: { id: 'B7', name: '연차유급휴가', law: '§60', category: '강행규정' }, status: '위반의심', loc: '제30조', note: '기준 미달' },
  { rule: { id: 'A5', name: '퇴직급여', law: '§93', category: '필수기재' }, status: '누락', loc: '', note: '미발견' },
  { rule: { id: 'D2', name: '육아휴직', law: '§19', category: '최신개정' }, status: '누락', loc: '', note: '미발견' },
  { rule: { id: 'E9', name: '직장 내 괴롭힘', law: '§76-2', category: '강행규정' }, status: '수동확인', loc: '', note: '' },
  { rule: { id: 'F1', name: '연차 시간단위', law: '', category: '최신개정' }, status: '시행예정', loc: '', note: '' }
];

test('★ 갈래별로 센다', () => {
  const t = CB.reviewTally(R);
  assert.equal(t.total, 6);
  assert.equal(t.count.위반의심, 1);
  assert.equal(t.count.누락, 2);
  assert.equal(t.count.수동확인, 1);
  assert.equal(t.count.시행예정, 1);
  assert.equal(t.count.적합, 1);
});

test('★★ 「적합」은 목록에 «안 싣는다» — 볼 것이 90줄이면 봐야 할 3줄이 묻힌다', () => {
  const t = CB.reviewTally(R);
  assert.equal(t.must.length, 3);
  assert.ok(!t.must.some(x => x.status === '적합'));
  assert.ok(!t.must.some(x => x.status === '수동확인'), '수동확인은 셈에만 남기고 목록에는 안 싣는다');
});

test('★ 급한 것이 앞으로 — 위반의심 → 누락, 그 안에서는 필수기재 → 강행규정 → 최신개정', () => {
  const t = CB.reviewTally(R);
  assert.deepEqual(Array.from(t.must, x => x.id), ['B7', 'A5', 'D2']);
});

test('빈 결과를 받아도 터지지 않는다', () => {
  const t = CB.reviewTally(null);
  assert.equal(t.total, 0);
  assert.equal(t.must.length, 0);
  assert.equal(t.count.위반의심, 0);
});

/* ── 안 본 것을 «반드시» 말한다 ───────────────────────────────────── */

test('★★ 「수동확인 N개는 기계가 판단하지 않았다」를 «늘» 적는다', () => {
  const c = CB.reviewCaveats({ manual: 27, sizeKey: '10인이상', sizeFrom: '사람' });
  assert.ok(c.some(x => x.indexOf('수동확인') >= 0 && x.indexOf('27') >= 0));
  assert.ok(c.some(x => x.indexOf('깨끗하다는 뜻이 아닙니다') >= 0),
    '0 을 「깨끗함」으로 읽지 못하게 말로 막아야 합니다');
});

test('★ 규모를 모르면 그렇다고 말한다 · 짐작이면 어디서 온 값인지 말한다', () => {
  assert.ok(CB.reviewCaveats({ sizeKey: null }).some(x => x.indexOf('규모') >= 0));
  assert.ok(CB.reviewCaveats({ sizeKey: '10인이상', sizeFrom: '짐작' })
    .some(x => x.indexOf('10인이상') >= 0 && x.indexOf('고쳐') >= 0));
  /* 사람이 직접 고른 규모는 굳이 토를 안 단다 */
  assert.ok(!CB.reviewCaveats({ sizeKey: '10인이상', sizeFrom: '사람' })
    .some(x => x.indexOf('고쳐') >= 0));
});

test('★★ 「그때 낸 것」이라는 단서와 「최종 판단은 노무사」는 «늘» 붙는다', () => {
  const c = CB.reviewCaveats({});
  assert.ok(c.some(x => x.indexOf('그때 우리가 낸 것') >= 0));
  assert.ok(c.some(x => x.indexOf('공인노무사') >= 0));
});

/* ── 진짜 규칙집으로 ─────────────────────────────────────────────── */

test('★★ 실제 규칙집에 «수동확인»이 많다 — 이 단서가 없으면 화면이 거짓말을 한다', () => {
  const R2 = 규칙집();
  const 수동 = R2.filter(r => r.type === '수동확인').length;
  assert.ok(수동 >= 10,
    `수동확인이 ${수동}개뿐이면 단서 문구를 다시 보세요 — 지금은 그 수가 많다는 전제입니다`);
  assert.ok(수동 < R2.length, '전부 수동확인이면 자동 검토라 할 수 없습니다');
});

test('★ 규칙집의 갈래 이름이 추리는 차례와 어긋나지 않는다', () => {
  const R2 = 규칙집();
  const 모름 = [...new Set(R2.map(r => r.category))].filter(c => CB.CAT_ORDER.indexOf(c) < 0);
  assert.deepEqual(모름, [],
    '규칙집에 새 갈래가 생겼습니다 — CAT_ORDER 에 넣지 않으면 그 규칙이 목록 맨 뒤로 밀립니다: ' + 모름.join(', '));
});
