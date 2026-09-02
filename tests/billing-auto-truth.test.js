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

test('★★ 자동으로 도는 것은 «넷»이다', () => {
  /* ★ 지키는 것은 「숫자」가 아니라 «화면에 적힌 것과 코드가 같은가»다.
     2026-08-31 홈페이지 뉴스·법령 브리핑(하루 한 번)이 늘어 셋에서 넷이 됐다.
     2026-09-02 대표 지시로 브리핑이 «주 1회»가 되면서 다섯이 됐다 —
       신문사 RSS 가 이틀치뿐이라(실측 50개 = 8/30~9/1), 주 1회만 읽으면
       「주간」이라면서 이틀치만 실린다. 그래서 «날마다 모으기»가 따로 생겼다.
     2026-09-02 대표 결정으로 «반출 기록 정리»(달마다 1일)가 늘어 여섯이 됐다 —
       반출 기록은 규칙이 새로 만드는 것만 되게 막아 두어(앱에서는 아무도 못 지운다)
       2년 지난 것을 치우는 일은 서버만 할 수 있다.
     ⚠ 달마다 도는 것은 «하루 셈»에 안 든다 — 그래서 화면의 289 는 그대로다.
     화면 문구도 같이 고쳤다. 다음에 또 늘면 여기와 화면을 함께 고쳐야 한다. */
  const all = (FIDX + FSYNC).match(/\.pubsub\.schedule\(/g) || [];
  assert.strictEqual(all.length, 6, '스케줄 함수 수가 바뀌었다 — 화면 문구도 같이 고쳐야 한다');
});

test('★★ 주간 브리핑은 «하루 셈에 안 든다» — 월요일에만 돈다', () => {
  /* 이것이 하루 한 번으로 되돌아가면 아래 289 라는 셈이 조용히 틀려진다 */
  const i = FIDX.indexOf('exports.weeklyNewsBrief');
  assert.ok(i >= 0, 'weeklyNewsBrief 를 못 찾음');
  assert.ok(/\.pubsub\.schedule\(["'][^"']*monday/i.test(FIDX.slice(i, i + 900)),
    '★ 주간 브리핑이 월요일에 도는 것이 아니다 — 화면의 하루 횟수가 틀려진다');
  assert.ok(ENTER.indexOf('주간 브리핑 월요일 한 번') >= 0,
    '화면이 「주간 브리핑 월요일 한 번」이라 안 말한다');
});

test('★★ 반출 기록 정리는 «하루 셈에 안 든다» — 달마다 1일에만 돈다', () => {
  /* 이것이 하루 한 번으로 바뀌면 아래 289 라는 셈이 조용히 틀려진다.
     ⚠ 함수 본문을 «다음 exports. 앞»까지로 자른다 — 고정 길이로 자르면 다음 함수까지
       넘쳐 헛통과한다(2026-09-02 에 실제로 그랬다). */
  const i = FIDX.indexOf('exports.monthlyExportLogTidy');
  assert.ok(i >= 0, 'monthlyExportLogTidy 를 못 찾음');
  const j = FIDX.indexOf(String.fromCharCode(10) + 'exports.', i + 10);
  const fn = FIDX.slice(i, j > i ? j : FIDX.length);
  assert.ok(fn.indexOf('"0 4 1 * *"') > 0,
    '★ 반출 기록 정리가 달마다 1일에 도는 것이 아니다 — 화면의 하루 횟수가 틀려진다');
});

test('★★ 화면에 적힌 주기가 «코드와 같다»', () => {
  const send = scheduleOf(FIDX, 'sendScheduledMail');
  const pay = scheduleOf(FIDX, 'receivePaydataMail');
  const sync = scheduleOf(FSYNC, 'syncMailbox');
  assert.strictEqual(send, 15, '메일 보내기 주기가 바뀌었다');
  assert.strictEqual(pay, 30, '급여자료 주기가 바뀌었다');
  assert.strictEqual(sync, 10, '메일 받기 주기가 바뀌었다');

  assert.ok(ENTER.indexOf('메일 받기 10분 · 메일 보내기 15분 · 급여자료 30분마다 · 홈페이지 뉴스 모으기 하루 한 번') >= 0,
    '뜻풀이의 주기가 코드와 다르다');
  assert.ok(ENTER.indexOf('메일 받기 10분마다 · 메일 보내기 15분마다 · 급여자료 30분마다') >= 0,
    '줄 설명의 주기가 코드와 다르다');
  assert.ok(ENTER.indexOf('홈페이지 뉴스 모으기 하루 한 번') >= 0,
    '줄 설명의 주기가 코드와 다르다');
});

test('★★ 하루 몇 번인지도 코드와 맞는다', () => {
  const send = scheduleOf(FIDX, 'sendScheduledMail');
  const pay = scheduleOf(FIDX, 'receivePaydataMail');
  const sync = scheduleOf(FSYNC, 'syncMailbox');
  const perDay = Math.round(1440 / send) + Math.round(1440 / pay) + Math.round(1440 / sync)
    + 1;   // 홈페이지 뉴스 모으기 — 하루 한 번 (주간 브리핑은 월요일뿐이라 안 센다)
  assert.strictEqual(perDay, 289, '셈이 바뀌었다');
  assert.ok(ENTER.indexOf('하루 <b>289번</b>') >= 0, '뜻풀이에 하루 횟수가 없거나 틀렸다');
  assert.ok(ENTER.indexOf('하루 289번, 밤낮 같이 돕니다') >= 0, '줄 설명에 하루 횟수가 없거나 틀렸다');
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

/* ⚠ 예전에는 여기서 «항목 셋»을 글자 그대로 박아 두었다(2026-08-29 고침).
   그래서 AI 칸을 하나 더한 것만으로 검사가 깨졌다 — 기능이 망가져서가 아니라
   «지금 값»을 박아 두었기 때문이다(CLAUDE.md 「검사를 쓰는 규칙」).
   못 박아야 할 것은 개수가 아니라 **「쪼갠 것이 총액에 못 미치면 그 차이가
   「그 밖」이 된다」**는 규칙이다. 항목이 늘든 줄든 이 규칙은 그대로다. */
test('★ 쪼갠 것이 총액에 못 미치면 그 차이가 「그 밖」이 된다', () => {
  /* 화면 쪽 파일이라 브라우저 전역에 붙는다 — 통째로 돌려 꺼낸다 */
  const vm = require('vm');
  const g = { window: {}, console, Math, Number, String, Object, Array, Date, isFinite, parseInt };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'pu-billing.js'), 'utf8'), g);
  const B = g.PuBilling;
  const now = Date.parse('2026-08-29T10:00:00Z');
  const row = (cost) => ({ cost, updatedAt: now, intervalStart: Date.parse('2026-08-01T00:00:00Z') });
  const s = B.summarize({
    total: row(1000), storage: row(100), database: row(300),
  }, now);
  const etc = s.parts.filter((p) => p.key === 'etc');
  assert.strictEqual(etc.length, 1, '모자란 몫을 「그 밖」으로 안 내놓는다');
  assert.strictEqual(etc[0].cost, 600, '「그 밖」이 총액 − 쪼갠 것의 합이 아니다');
  /* 쪼갠 것이 총액을 다 채우면 「그 밖」은 아예 없어야 한다 —
     0원짜리 줄을 남기면 「안 썼다」로 읽히고, 없는 칸과 헷갈린다. */
  const s2 = B.summarize({ total: row(400), storage: row(100), database: row(300) }, now);
  assert.ok(!s2.parts.some((p) => p.key === 'etc'), '다 채웠는데 「그 밖」이 남았다');
});

test('★ 쪼개는 항목이 바뀌면 「그 밖」 설명도 함께 손봐야 한다', () => {
  const bill = fs.readFileSync(path.join(ROOT, 'js', 'pu-billing.js'), 'utf8');
  const m = /var PARTS = \[([^\]]*)\]/.exec(bill);
  assert.ok(m, 'PARTS 를 찾지 못했다');
  /* 개수는 안 박는다. 다만 **「그 밖」 이 남을 수 있다**는 전제는 지켜져야 한다 —
     PARTS 가 총액까지 통째로 담게 되면 「그 밖」 설명이 거짓말이 된다. */
  assert.ok(!/'total'/.test(m[1]), '전체는 쪼갠 항목에 넣지 않는다 — 두 번 세어진다');
  assert.ok(ENTER.indexOf('「그 밖」은 구글 예산 알림이 안 걸린 서비스입니다') >= 0,
    '「그 밖」 설명이 화면에서 사라졌다');
});
