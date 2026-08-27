/* 카드내역 연결 — 셋 고침 (2026-08-26 대표 답: 「대기함, 확정은 손으로. 셋 고침」)
 * ① 카드 「취소」 문자를 대기함에 올린다 — 종전에는 서버가 통째로 버려
 *    승인만 들어왔고, 그래서 카드 지출이 «실제보다 많아» 보였다.
 * ② 확정할 때 카드가 「하나은행」으로 적히던 것 — 화면 전체가 아니라 «줄마다» 본다.
 * ③ 카드 적요에 금액이 섞여 들어가던 것 — 적요는 업체 이름을 맞추는 칸이다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const { parseHanaMessage } = require(path.join(ROOT, 'functions', 'hana-message.js'));
const NOW = { now: new Date('2026-08-26T00:00:00Z') };

function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}

/* ─────────── ① 취소 ─────────── */
test('★★ 카드 «취소» 문자가 이제 들어온다 (종전에는 통째로 버렸다)', () => {
  const r = parseHanaMessage('[Web발신] 하나카드 취소 권형하 08/25 13:00 71,700원 (주)루나', NOW);
  assert.ok(r.ok, '아직 버리고 있다: ' + r.reason);
  assert.strictEqual(r.transaction.src, 'card');
  assert.strictEqual(r.transaction.cancel, true, '취소라고 표시하지 않는다');
});

test('★★ 취소인지 «표»로 알려 준다 — 글자만 보고 재게 하면 안 된다', () => {
  const c = parseHanaMessage('하나카드 취소 08/25 13:00 71,700원 (주)루나', NOW);
  const a = parseHanaMessage('하나카드 승인 08/25 12:16 71,700원 일시불 (주)루나', NOW);
  assert.strictEqual(c.transaction.cancel, true);
  assert.strictEqual(a.transaction.cancel, false, '승인인데 취소로 본다');
});

test('★ 적요 앞에 「[취소]」를 붙여 눈으로도 보인다', () => {
  const r = parseHanaMessage('하나카드 취소 08/25 13:00 71,700원 (주)루나', NOW);
  assert.ok(r.transaction.memo.indexOf('[취소]') === 0, '적요: ' + r.transaction.memo);
});

test('★★ 같은 날 같은 금액의 승인과 취소가 «한 줄로 겹치지» 않는다', () => {
  const a = parseHanaMessage('하나카드 승인 08/25 13:00 71,700원 (주)루나', NOW);
  const c = parseHanaMessage('하나카드 취소 08/25 13:00 71,700원 (주)루나', NOW);
  assert.notStrictEqual(a.transaction.id, c.transaction.id,
    '열쇠가 같으면 취소가 승인에 덮여 사라진다');
});

test('★★ 취소 줄은 «스스로 확정되지 않는다» (대표 답: 확정은 손으로)', () => {
  const fn = bare(cutBlock(SRC, 'function erpRowState(row, groups, ctx){'));
  assert.ok(/if\(row\.cancel\) return \{ state:'check'/.test(fn), '취소 줄이 초록이 될 수 있다');
  const i = fn.indexOf('row.cancel');
  const j = fn.indexOf("state:'ready'");
  assert.ok(i >= 0 && j >= 0 && i < j, '막는 것이 «확정 가능»보다 뒤에 있으면 이미 늦다');
});

test('★★ 그렇다고 «감추지는» 않는다 — 감추면 지출이 많아 보이던 옛 문제로 돌아간다', () => {
  const fn = cutBlock(SRC, 'function erpRowState(row, groups, ctx){');
  assert.ok(fn.indexOf("label:'카드 취소 — 손으로 처리'") >= 0, '무엇을 해야 하는지 안 알려 준다');
  assert.ok(fn.indexOf("state:'done'") >= 0, '「이미 처리」 갈래가 사라졌다');
  /* done 이 아니라 check 여야 목록에 남아 사람 눈에 띈다 */
  assert.ok(!/if\(row\.cancel\) return \{ state:'done'/.test(bare(fn)), '취소를 「이미 처리」로 감춘다');
});

test('★ 화면이 취소 표를 «담는다» (서버가 줘도 안 담으면 소용없다)', () => {
  assert.ok(bare(SRC).indexOf('cancel: !!x.cancel') >= 0, '문자에서 취소 표를 안 가져온다');
});

/* ─────────── ② 이름표 ─────────── */
test('★★ 확정할 때 이름표를 «줄마다» 본다 (화면 전체를 보면 카드가 은행이 된다)', () => {
  const B = bare(SRC);
  const n = B.split("'[하나'+((row&&row.src==='card')?'카드':'은행')+'] '").length - 1;
  assert.strictEqual(n, 3, '줄마다 보는 자리가 셋이어야 한다 (지금 ' + n + ')');
  assert.strictEqual(B.indexOf("'[하나'+(fileType==='bank'?'은행':'카드')+'] '"), -1,
    '화면 전체를 보고 적는 옛 길이 남아 있다 — 은행·카드가 섞이면 카드가 은행으로 적힌다');
});

/* ─────────── ③ 적요 ─────────── */
test('★★ 카드 적요에서 «금액»을 뗀다 (적요는 업체 이름을 맞추는 칸이다)', () => {
  const r = parseHanaMessage('[Web발신] 하나카드 승인 권형하 08/25 12:16 71,700원 일시불 (주)루나', NOW);
  assert.strictEqual(r.transaction.memo, '(주)루나', '적요: ' + r.transaction.memo);
});

test('★★ 가게 이름을 깎지 «않는다» (거르개를 넓히면 진짜 이름이 잘린다)', () => {
  /* 「승인·취소·카드사 이름 떼기」를 넣었다가 걷어낸 까닭 —
     실제 문자는 그 말들이 «날짜 앞»에 있어 적요까지 오지 않고,
     대신 「신용정보원」 같은 진짜 가게 이름이 깎일 뻔했다. */
  const r = parseHanaMessage('하나카드 승인 08/25 09:11 12,000원 일시불 신용정보원', NOW);
  assert.strictEqual(r.transaction.memo, '신용정보원', '적요: ' + r.transaction.memo);
  const b = parseHanaMessage('하나 1234 승인 08/25 09:11 12,000원 스타벅스', NOW);
  assert.strictEqual(b.transaction.memo, '스타벅스', '적요: ' + b.transaction.memo);
});

test('★ 은행 쪽 적요는 그대로다 (건드리면 안 된다)', () => {
  const r = parseHanaMessage('[Web발신] 하나 08/25 16:09 165,000원 입금 대흥중공업(주) 잔액 3,980,000원', NOW);
  assert.strictEqual(r.transaction.src, 'bank');
  assert.strictEqual(r.transaction.type, 'income');
  assert.strictEqual(r.transaction.memo, '대흥중공업(주)');
  assert.strictEqual(r.transaction.balance, 3980000, '잔액이 사라졌다');
});

/* ─────────── 지키던 것 ─────────── */
test('★★ 인증번호·보안 문자는 여전히 «통째로» 거부한다', () => {
  ['하나은행 인증번호 123456', '하나카드 일회용 비밀번호 8/25 12:00 1,000원',
   '하나 08/25 12:00 OTP 확인 1,000원'].forEach((t) => {
    const r = parseHanaMessage(t, NOW);
    assert.strictEqual(r.ok, false, '보안 문자가 들어온다: ' + t);
    assert.strictEqual(r.reason, 'security_message');
  });
});

test('하나 것이 아니면 안 받는다', () => {
  const r = parseHanaMessage('국민카드 승인 08/25 12:00 10,000원 어디가게', NOW);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not_hana_transaction');
});

test('휴대폰 거르개도 취소를 «보낸다» (서버만 고치면 오지 않는다)', () => {
  const f = fs.readFileSync(path.join(ROOT, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
    'java', 'kr', 'pureun', 'hanabridge', 'HanaMessageFilter.java'), 'utf8');
  assert.ok(f.indexOf('value.contains("취소")') >= 0, '휴대폰이 취소 문자를 거른다');
  assert.ok(f.indexOf('value.contains("하나카드")') >= 0, '휴대폰이 카드 문자를 거른다');
});
