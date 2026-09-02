'use strict';
/* 반출 기록 정리 — 2년이 지난 줄만 (대표 결정 2026-09-02: 「2년 · 서버가 달마다」)
   ═══════════════════════════════════════════════════════════════════════════
   ■ ⚠⚠ 이것은 «감사 기록을 지우는» 일이다
     지운 것은 안 돌아온다. 그래서 여기서 못 박는 것은 「지우는가」가 아니라
     **「안 지우는가」**다:
       ① 날짜를 못 읽는 줄은 안 지운다 — 언제 것인지 모르는 것을 지우면 안 된다
       ② 앞날(미래) 날짜도 안 지운다 — 시계가 틀렸거나 손댄 자리다
       ③ 자르는 날이 이상하면 «아무것도» 안 지운다
       ④ 한 번에 지우는 수에 상한이 있다 — 남은 것은 다음 달에
       ⑤ 오래된 것부터 지운다 — 상한에 걸려도 가장 오래된 것이 먼저 없어진다
       ⑥ 지운 셈을 남긴다(exportLog «밖»에)
       ⑦ 2년 «경계»에서 하루라도 덜 지난 것은 남긴다

   실행: node --test functions/export-log-tidy.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./export-log-tidy.js');

/* 예약 함수 «본문만» 떼어 온다.
   ⚠ 고정 길이(3000자)로 자르다가 **다음 함수까지 넘쳐** 두 자리가 헛통과했다
     (weeklyNewsBrief 의 `설정.off === true` 가 창 안에 들어왔다).
     다음 `exports.` 앞까지로 자른다. */
function 예약함수본문() {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const idx = fs2.readFileSync(path2.join(__dirname, 'index.js'), 'utf8');
  const at = idx.indexOf('exports.monthlyExportLogTidy');
  if (at < 0) return { idx: idx, fn: '', at: at };
  const next = idx.indexOf('\nexports.', at + 10);
  return { idx: idx, at: at, fn: idx.slice(at, next > at ? next : idx.length) };
}

const 하루 = 24 * 60 * 60 * 1000;
const 지금 = Date.UTC(2026, 8, 2);            /* 2026-09-02 */
const 전 = (일) => 지금 - 일 * 하루;

/* ══════════ 보유기간 ══════════ */

test('★★ 보유기간은 2년(730일)이다 — 대표 결정 2026-09-02 · 검사고정-허용', () => {
  assert.equal(T.보유_일, 730,
    '★★ 보유기간이 바뀌었습니다 — 이 숫자는 대표가 정한 규칙입니다(용량이 아니라 보유기간)');
});

test('자르는 날은 지금에서 보유기간만큼 뺀 날이다', () => {
  assert.equal(T.자르는날(지금), 지금 - 730 * 하루);
  assert.equal(T.자르는날(지금, 30), 지금 - 30 * 하루);
});

test('★★★ 지금 시각이 이상하면 자르는 날을 «셈하지 않는다» — 0 이면 아무것도 안 지운다', () => {
  [0, -1, NaN, Infinity, null, undefined, 'x'].forEach(function (bad) {
    assert.equal(T.자르는날(bad), 0, '★★★ 이상한 시각으로 자르는 날을 만들었습니다: ' + bad);
  });
});

/* ══════════ ①② 안 지우는 자리 ══════════ */

test('★★★ 날짜를 못 읽는 줄은 «안 지운다» — 언제 것인지 모르는 것을 지우면 안 된다', () => {
  [{}, { at: null }, { at: '2020-01-01' }, { at: 0 }, { at: -5 },
   { at: NaN }, { at: Infinity }, null, 'x', 7].forEach(function (rec) {
    assert.equal(T.줄판정(rec, T.자르는날(지금), 지금), 'unknown',
      '★★★ 날짜를 못 읽는 줄을 지웁니다: ' + JSON.stringify(rec));
  });
});

test('★★★ 앞날(미래) 날짜도 «안 지운다» — 시계가 틀렸거나 손댄 자리다', () => {
  assert.equal(T.줄판정({ at: 지금 + 하루 }, T.자르는날(지금), 지금), 'unknown',
    '★★★ 앞날 기록을 지웁니다 — 가장 최근 기록이 사라질 수 있습니다');
});

test('★★ 2년 «경계» — 하루라도 덜 지난 것은 남긴다', () => {
  const 자름 = T.자르는날(지금);
  assert.equal(T.줄판정({ at: 전(731) }, 자름, 지금), 'old', '731일 지난 것은 지웁니다');
  assert.equal(T.줄판정({ at: 전(729) }, 자름, 지금), 'keep', '★★ 729일밖에 안 된 것을 지웁니다');
  assert.equal(T.줄판정({ at: 자름 }, 자름, 지금), 'keep', '★★ 딱 2년 된 것을 지웁니다 — 아직 하루 남았습니다');
});

/* ══════════ ③ 자르는 날이 이상하면 통째로 멈춘다 ══════════ */

test('★★★ 지금 시각이 이상하면 «아무것도» 안 지운다', () => {
  const rows = { a: { at: 전(1000) }, b: { at: 전(2000) } };
  [0, NaN, null, undefined, 'x'].forEach(function (bad) {
    const r = T.고르기(rows, bad);
    assert.deepEqual(r.지울것, [], '★★★ 이상한 시각으로 감사 기록을 지웁니다: ' + bad);
    assert.ok(r.멈춤, '왜 멈췄는지 말해야 합니다');
  });
});

test('★★ 보유기간을 0·음수로 주면 아무것도 안 지운다 — 실수로 전부 지우는 길을 막는다', () => {
  const rows = { a: { at: 전(1) } };
  [0, -1, NaN].forEach(function (bad) {
    const r = T.고르기(rows, 지금, { 일: bad });
    assert.deepEqual(r.지울것, [],
      '★★ 보유기간 ' + bad + ' 로 기록을 지웁니다 — 오늘 것까지 없어집니다');
  });
});

/* ══════════ 고르기 ══════════ */

test('★ 2년 지난 것만 골라낸다', () => {
  const r = T.고르기({
    오래된하나: { at: 전(800) },
    오래된둘: { at: 전(1000) },
    최근: { at: 전(10) },
    날짜없음: { at: null }
  }, 지금);
  assert.deepEqual(Array.from(r.지울것).sort(), ['오래된둘', '오래된하나'].sort());
  assert.equal(r.남길것, 1);
  assert.equal(r.못본것, 1);
  assert.equal(r.멈춤, '');
});

test('★★ 상한이 있다 — 한 번에 다 지우지 않는다', () => {
  const rows = {};
  for (let i = 0; i < 20; i++) rows['k' + i] = { at: 전(800 + i) };
  const r = T.고르기(rows, 지금, { 상한: 5 });
  assert.equal(r.지울것.length, 5, '★★ 상한을 안 지킵니다');
  assert.equal(r.넘친것, 15, '남은 것을 안 셉니다 — 다음 달에 몇 개 남았는지 알아야 합니다');
});

test('★★★ «오래된 것부터» 지운다 — 상한에 걸려도 가장 오래된 것이 먼저 없어진다', () => {
  const r = T.고르기({
    새것: { at: 전(731) }, 중간: { at: 전(900) }, 제일오래: { at: 전(3000) }
  }, 지금, { 상한: 2 });
  assert.deepEqual(Array.from(r.지울것), ['제일오래', '중간'],
    '★★★ 오래된 차례가 아닙니다 — 상한에 걸리면 엉뚱한 것이 남습니다');
});

test('지울 것이 없으면 빈손으로 돌아온다 — 서버를 안 만진다', () => {
  const r = T.고르기({ a: { at: 전(10) } }, 지금);
  assert.deepEqual(Array.from(r.지울것), []);
  assert.equal(r.남길것, 1);
});

test('기록이 아예 없어도 죽지 않는다', () => {
  [null, undefined, {}, 'x', 7].forEach(function (bad) {
    const r = T.고르기(bad, 지금);
    assert.deepEqual(Array.from(r.지울것), []);
  });
});

/* ══════════ 지울 자리 ══════════ */

test('★★★ 지우는 자리가 «반출 기록 안»뿐이다 — 다른 곳을 지우면 안 된다', () => {
  const u = T.지울자리(['a', 'b'], 'exportLog');
  assert.deepEqual(Object.keys(u).sort(), ['exportLog/a', 'exportLog/b']);
  Object.keys(u).forEach(function (k) {
    assert.equal(u[k], null, '지우기는 null 로 씁니다');
    assert.match(k, /^exportLog\//, '★★★ 반출 기록 밖을 지웁니다: ' + k);
  });
});

test('★★ 빈 열쇠는 자리표에 안 넣는다 — 뿌리를 통째로 지울 수 있다', () => {
  const u = T.지울자리(['', null, undefined, 'ok'], 'exportLog');
  assert.deepEqual(Object.keys(u), ['exportLog/ok'],
    '★★ 빈 열쇠가 「exportLog/」 가 되어 뿌리를 지웁니다');
});

/* ══════════ ⑥ 셈을 남긴다 ══════════ */

test('★★ 지운 셈을 남긴다 — 조용히 지우면 그것이 또 하나의 감사 구멍이다', () => {
  const r = T.고르기({ a: { at: 전(800) }, b: { at: 전(10) }, c: {} }, 지금);
  const 셈 = T.셈기록(r, 지금);
  assert.equal(셈.지움, 1);
  assert.equal(셈.남김, 1);
  assert.equal(셈.못본것, 1);
  assert.equal(셈.보유일, 730, '몇 년 기준으로 지웠는지 안 남으면 나중에 못 따진다');
  assert.equal(셈.at, 지금);
  assert.ok(셈.자름 > 0, '자른 날을 안 남깁니다');
});

test('★ 멈췄으면 «왜»가 셈에 남는다', () => {
  const 셈 = T.셈기록(T.고르기({ a: { at: 전(800) } }, 0), 0);
  assert.ok(셈.멈춤, '★ 멈춘 까닭이 안 남습니다 — 왜 안 지워졌는지 아무도 모릅니다');
  assert.equal(셈.지움, 0);
});

/* ══════════ 서버 쪽 ══════════ */

test('★★★ 예약 함수가 달마다 돌고, 끌 수 있다', () => {
  const { idx, at, fn } = 예약함수본문();
  assert.ok(at > 0, '★★★ 예약 함수가 없습니다 — 만들어 놓고 안 부르면 없는 기능입니다');
  assert.match(fn, /pubsub\.schedule\(/, '달마다 도는 설정이 없습니다');
  assert.match(fn, /off === true|off===true/,
    '★★★ 끌 수 있는 자리가 없습니다 — 감사 기록을 지우는 일은 멈출 수 있어야 합니다');
  /* ⚠ 들여오는 줄(require)은 파일 머리에 있다 — 함수 안이 아니다. 파일 전체에서 본다. */
  assert.ok(idx.indexOf("require('./export-log-tidy.js')") > 0
    || idx.indexOf('require("./export-log-tidy.js")') > 0,
    '순수 로직을 안 들여옵니다 — 서버에 규칙을 또 짜면 두 벌이 됩니다');
  assert.ok(fn.indexOf('고르기(') > 0, '함수가 고르기를 안 씁니다');
});

test('★★★ 서버가 «고르기»를 거치지 않고 지우지 않는다', () => {
  const { idx, at, fn } = 예약함수본문();
  /* exportLog 를 지우는 자리는 지울자리() 가 만든 것뿐이어야 한다 */
  assert.doesNotMatch(fn, /exportLog['"]\)\s*\.remove\(|child\([^)]*\)\.remove\(/,
    '★★★ 고르기를 거치지 않고 바로 지웁니다 — 날짜를 못 읽는 줄까지 사라집니다');
  assert.match(fn, /지울자리\(/, '지우는 자리표를 순수 로직에서 안 만듭니다');
  /* ⚠ 지울자리() 만 보면 «고르기를 건너뛰고» 손으로 만든 목록을 넘겨도 통과한다 —
     실제로 그 돌연변이가 안 걸렸다(2026-09-02). 거치는 것을 함께 못 박는다. */
  assert.match(fn, /반출정리\.고르기\(rows, 지금\)/,
    '★★★ 고르기를 거치지 않고 지울 목록을 손으로 만듭니다 — 날짜를 못 읽는 줄까지 사라집니다');
});

test('★★ 셈을 반출 기록 «밖»에 남긴다 — 안에 남기면 그 줄도 2년 뒤 지워진다', () => {
  const { idx, at, fn } = 예약함수본문();
  assert.match(fn, /exportLogTidy/, '★★ 셈을 남기는 자리가 없습니다');
  assert.doesNotMatch(fn, /exportLog\/[^T"']*\/셈|exportLog"\)[^\n]*셈기록/,
    '★★ 셈을 반출 기록 안에 남깁니다');
});
