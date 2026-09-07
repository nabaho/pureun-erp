'use strict';
/* ㉠ 「글 없음」 세기 · ㉡ 제출 서류에 몇 줄 적기 (대표 지시 2026-09-07 「ㄱ ㄴ」)
 *
 * ★ 대표 물음: 「보관함 저장할 때 OCR 하는 게 좋은 건가, 단순 보관은 의미가 없을 것 같은데」
 *
 * 답을 «먼저 세어 보고» 정하기로 했다. 모르고 OCR 을 붙이면 큰 공사를 헛한다.
 * 그리고 제출 서류(신고서·의견청취·동의서)는 OCR 로 뽑을 것이 애초에 없다 —
 * 정작 필요한 「언제·어디에·몇 명」은 도장과 손글씨다. 사람이 3초면 적는다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

/* rules_mgmt/casebook/rev 를 통째로 읽은 모양 */
const ALL = {
  site_a: {
    '2024': { docs: { after: { sha: 'a', artCount: 60 }, before: { sha: 'b' },
                      report: { sha: 'c', noText: true }, consent: { sha: 'd', noText: true } } },
    '2022': { docs: { after: { sha: 'e' }, daejo: { sha: 'f' } } }
  },
  site_b: {
    '2023': { docs: { after: { sha: 'g', noText: true }, opinion: { sha: 'h', noText: true } } }
  }
};

/* ── ㉠ 세어 보기 ─────────────────────────────────────────────────── */

test('★ 서류를 갈래로 세어 준다 — 본문류와 제출류는 «다른 물건»이다', () => {
  const t = CB.tallyNoText(ALL);
  assert.equal(t.total, 8);
  assert.equal(t.noText, 4);
  /* 본문류: after×3 · before×1 · daejo×1 = 5, 그중 글 없음 1 */
  assert.equal(t.body.total, 5);
  assert.equal(t.body.noText, 1);
  /* 제출류: report·consent·opinion = 3, 전부 글 없음 */
  assert.equal(t.submit.total, 3);
  assert.equal(t.submit.noText, 3);
});

test('★★ 이 셈이 답해야 하는 것 — 「본문류는 대개 글이 있고, 스캔은 제출류다」', () => {
  const t = CB.tallyNoText(ALL);
  assert.ok(CB.pct(t.body.noText, t.body.total) < CB.pct(t.submit.noText, t.submit.total),
    '본문류가 제출류보다 글이 잘 들어 있어야 OCR 을 안 붙이는 판단이 선다');
});

test('갈래별로도 센다 · 사업장·회차 수도 함께', () => {
  const t = CB.tallyNoText(ALL);
  assert.equal(t.byRole.after.total, 3);
  assert.equal(t.byRole.after.noText, 1);
  assert.equal(t.sites, 2);
  assert.equal(t.revs, 3);
});

test('★ 「없다」와 「0%」는 다른 말이다 — 하나도 없으면 백분율이 아니라 null', () => {
  assert.equal(CB.pct(0, 0), null);
  assert.equal(CB.pct(0, 4), 0);
  assert.equal(CB.pct(1, 3), 33.3);
});

test('빈 서고를 세어도 터지지 않는다', () => {
  const t = CB.tallyNoText(null);
  assert.equal(t.total, 0);
  assert.equal(t.sites, 0);
});

test('업체가 아닌 것(숫자·배열)이 섞여도 서류로 세지 않는다', () => {
  const t = CB.tallyNoText({ site_a: ALL.site_a, 뭔가: 3, 또: [1, 2] });
  assert.equal(t.sites, 1);
  assert.equal(t.total, 6);
});

/* ── ㉡ 제출 정보 ─────────────────────────────────────────────────── */

test('★ 아무것도 안 적힌 것은 «없는 것»이다 — 빈 칸을 화면에 그리지 않는다', () => {
  assert.equal(CB.subOf({ sha: 'x' }), null);
  assert.equal(CB.subOf({ sub: {} }), null);
  assert.equal(CB.subOf({ sub: { at: '', no: '', office: '' } }), null);
  assert.ok(CB.subOf({ sub: { at: '2024-03-15' } }));
});

test('★★ 없는 값은 «건너뛴다» — 「— · — · 0명」을 채워 그리지 않는다', () => {
  const 한줄 = CB.subLine('report', { at: '2024-03-15' });
  assert.equal(한줄, '2024-03-15 신고');
  assert.ok(한줄.indexOf('—') < 0);
  assert.ok(한줄.indexOf('0명') < 0);
});

test('★ 서류에 따라 «말이 달라진다» — 신고와 동의는 다른 일이다', () => {
  assert.ok(CB.subLine('report', { at: '2024-03-15' }).indexOf('신고') >= 0);
  assert.ok(CB.subLine('consent', { at: '2024-03-01' }).indexOf('동의') >= 0);
  assert.ok(CB.subLine('opinion', { at: '2024-02-20' }).indexOf('의견청취') >= 0);
});

test('신고서는 날짜·기관·접수번호, 동의서는 인원이 붙는다', () => {
  assert.equal(CB.subLine('report', { at: '2024-03-15', office: '천안지청', no: '2024-1234' }),
    '2024-03-15 신고 · 천안지청 · 접수 2024-1234');
  assert.equal(CB.subLine('consent', { at: '2024-03-01', n: 42, nAll: 50 }),
    '2024-03-01 동의 · 42/50명');
});

test('전체 인원만 알 때도 말이 된다', () => {
  assert.equal(CB.subLine('opinion', { n: 50 }), '의견청취 · 50명');
  assert.ok(CB.subLine('opinion', { nAll: 50 }).indexOf('전체 50명') >= 0);
});

/* ── 적기 전에 걸러 내기 ──────────────────────────────────────────── */

test('★★ 규칙에 막히기 «전에» 사람에게 말해 준다 — permission_denied 는 아무것도 안 알려 준다', () => {
  const 나쁜날짜 = CB.validSub({ at: '2024.3.15' });
  assert.equal(나쁜날짜.ok, false);
  assert.ok(나쁜날짜.why[0].indexOf('2024-03-15') >= 0, '어떻게 적어야 하는지 보여야 합니다');
});

test('인원은 0 이상의 정수라야 한다', () => {
  assert.equal(CB.validSub({ n: -1 }).ok, false);
  assert.equal(CB.validSub({ n: 3.5 }).ok, false);
  assert.equal(CB.validSub({ n: '열' }).ok, false);
  assert.equal(CB.validSub({ n: 0 }).ok, true, '0명 동의도 있을 수 있는 값입니다');
});

test('★ 동의 인원이 전체보다 많으면 «막는다» — 그대로 두면 실적표가 거짓말을 한다', () => {
  assert.equal(CB.validSub({ n: 60, nAll: 50 }).ok, false);
  assert.equal(CB.validSub({ n: 50, nAll: 50 }).ok, true);
});

test('빈 것은 통과한다 — 안 적는 것도 답이다', () => {
  assert.equal(CB.validSub({}).ok, true);
  assert.equal(CB.validSub(null).ok, true);
});

test('★ 저장할 때 빈 값을 «안 담는다» — 빈 칸이 자리로 남으면 「없음」이 「빈 값」이 된다', () => {
  assert.deepEqual(CB.subClean({ at: '2024-03-15', no: '', office: '  ', n: null }),
    { at: '2024-03-15' });
  assert.equal(CB.subClean({}), null);
  assert.equal(CB.subClean({ at: '', no: '' }), null);
});

test('0 은 «빈 값이 아니다» — 담아야 한다', () => {
  assert.deepEqual(CB.subClean({ n: 0 }), { n: 0 });
});
