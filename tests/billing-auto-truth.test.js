/* 사용액 창 — 「자동」이 무엇을 도는지, 그리고 «시각의 뜻» (2026-08-26 대표 물음)
 *
 * 대표: 「매번 새벽에 금액이 올라갈 때 자동인데 이 부분은 뭐 하는지 표시해 주고,
 *        실제 자동으로 계속 비용이 올라가서 정리해야 되는 것인지도 정확하게 분석해 달라」
 *
 * ⚠ 이 검사의 핵심은 «화면에 적힌 주기가 코드와 같은가»이다.
 *   화면 문구를 «10/5/10 분(하루 576번)»으로 고치려다 이 검사에 붙잡혔다 —
 *   그 숫자는 공용 작업트리에 있던 «커밋 안 된 남의 수정»이었고, main 은 10/15/30 이다.
 *   틀린 숫자를 보고 줄일 곳을 고르면 엉뚱한 데를 줄인다.
 *   ★ 그래서 주기를 «글로 적지 않고 코드에서 읽어» 화면과 맞춰 본다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENTER = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const FIDX = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const FSYNC = fs.readFileSync(path.join(ROOT, 'functions', 'mail-sync.js'), 'utf8');

/* 실제 주기를 «코드에서» 읽어 온다 — 화면 문구와 맞춰 보려고. */
function scheduleOf(src, exportName) {
  /* ⚠ 셋이 «같은 꼴»로 안 적혀 있다 — 둘은 `exports.이름 = functions`,
     syncMailbox 는 돌려주는 덩어리 안의 `이름: F` 다. 두 꼴을 다 찾는다. */
  let i = src.indexOf('exports.' + exportName);
  if (i < 0) i = src.indexOf('\n    ' + exportName + ': F');
  assert.ok(i >= 0, exportName + ' 을 못 찾음');
  const seg = src.slice(i, i + 900);
  const m = seg.match(/\.pubsub\.schedule\(['"]every (\d+) minutes['"]\)/);
  assert.ok(m, exportName + ' 의 주기를 못 읽음');
  return parseInt(m[1], 10);
}

test('★★ 자동으로 도는 것은 «셋»이다', () => {
  const all = (FIDX + FSYNC).match(/\.pubsub\.schedule\(/g) || [];
  assert.strictEqual(all.length, 3, '스케줄 함수 수가 바뀌었다 — 화면 문구도 같이 고쳐야 한다');
});

test('★★ 화면에 적힌 주기가 «코드와 같다»', () => {
  const send = scheduleOf(FIDX, 'sendScheduledMail');
  const pay = scheduleOf(FIDX, 'receivePaydataMail');
  const sync = scheduleOf(FSYNC, 'syncMailbox');
  assert.strictEqual(send, 15, '메일 보내기 주기가 바뀌었다');
  assert.strictEqual(pay, 30, '급여자료 주기가 바뀌었다');
  assert.strictEqual(sync, 10, '메일 받기 주기가 바뀌었다');

  assert.ok(ENTER.indexOf('메일 받기 10분 · 메일 보내기 15분 · 급여자료 30분마다') >= 0,
    '뜻풀이의 주기가 코드와 다르다');
  assert.ok(ENTER.indexOf('메일 받기 10분마다 · 메일 보내기 15분마다 · 급여자료 30분마다') >= 0,
    '줄 설명의 주기가 코드와 다르다');
});

test('★★ 하루 몇 번인지도 코드와 맞는다', () => {
  const send = scheduleOf(FIDX, 'sendScheduledMail');
  const pay = scheduleOf(FIDX, 'receivePaydataMail');
  const sync = scheduleOf(FSYNC, 'syncMailbox');
  const perDay = Math.round(1440 / send) + Math.round(1440 / pay) + Math.round(1440 / sync);
  assert.strictEqual(perDay, 288, '셈이 바뀌었다');
  assert.ok(ENTER.indexOf('하루 <b>288번</b>') >= 0, '뜻풀이에 하루 횟수가 없거나 틀렸다');
  assert.ok(ENTER.indexOf('셋이 하루 288번, 밤낮 같이 돕니다') >= 0, '줄 설명에 하루 횟수가 없거나 틀렸다');
});

test('★★ 옛 «틀린» 숫자가 어디에도 안 남아 있다', () => {
  ['메일 보내기 5분', '급여자료 10분', '하루 576번'].forEach((s) => {
    assert.strictEqual(ENTER.indexOf(s), -1, '틀린 주기가 남아 있다: ' + s);
  });
});

test('★★ 표의 시각이 «구글이 알려 준» 시각임을 밝힌다', () => {
  assert.ok(ENTER.indexOf('이 표의 시각은 «구글이 알려 준» 시각입니다 — 「그때 썼다」가 아닙니다') >= 0,
    '시각의 뜻을 안 밝힌다 — 새벽 한 칸이 크게 오르면 그때 쓴 줄로 읽는다');
  assert.ok(ENTER.indexOf('몇 시간 몰아서 보내기도 합니다') >= 0, '몰아서 오는 것을 안 알려 준다');
});

test('★ 기록이 «알림이 올 때» 쌓인다는 것이 코드와 맞다', () => {
  /* 시각의 뜻이 그러한 «까닭» — recordBillingAlert 는 구글 쪽지를 받을 때 돈다. */
  const i = FIDX.indexOf('exports.recordBillingAlert');
  assert.ok(i >= 0, 'recordBillingAlert 를 못 찾음');
  const seg = FIDX.slice(i, i + 400);
  assert.ok(/\.pubsub\.topic\(["']billing-alerts["']\)/.test(seg),
    '쪽지로 도는 것이 아니면 시각의 뜻 설명이 틀린 것이 된다');
});

test('★★ 「그 밖」이 무엇인지 «모른다»고 밝히고, 어디서 봐야 하는지 알려 준다', () => {
  assert.ok(ENTER.indexOf('「그 밖」은 구글 예산 알림이 안 걸린 서비스입니다') >= 0,
    '「그 밖」의 뜻을 안 밝힌다');
  assert.ok(ENTER.indexOf('구글 클라우드 «청구 내역»에서 서비스별로 봐야 합니다') >= 0,
    '어디서 봐야 하는지 안 알려 준다 — 모른다고만 하면 손이 없다');
});

test('★ 쪼개 보는 항목은 셋뿐이다 (그래서 나머지가 「그 밖」이 된다)', () => {
  const bill = fs.readFileSync(path.join(ROOT, 'js', 'pu-billing.js'), 'utf8');
  assert.ok(/var PARTS = \['storage', 'database', 'functions'\]/.test(bill),
    '쪼개는 항목이 바뀌었다 — 「그 밖」 설명도 같이 고쳐야 한다');
});
