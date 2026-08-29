"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const HM = require("./hana-message");

const NOW = new Date("2026-08-23T03:00:00.000Z");

test("하나카드 승인 문자를 카드 출금으로 최소 파싱한다", () => {
  const got = HM.parseHanaMessage("[Web발신] 하나9950 승인 푸른노무법 26,000원 일시불 08/18 12:59 스시리두정 가용액3,432,999원", { now: NOW });
  assert.equal(got.ok, true);
  assert.equal(got.transaction.src, "card");
  assert.equal(got.transaction.type, "expense");
  assert.equal(got.transaction.amount, 26000);
  assert.equal(got.transaction.date, "2026-08-18 12:59");
  assert.match(got.transaction.memo, /스시리두정/);
  assert.doesNotMatch(JSON.stringify(got.transaction), /푸른노무법/);
});

test("하나은행 입금 문자를 통장 입금으로 파싱한다", () => {
  const got = HM.parseHanaMessage("[Web발신] 하나은행 입금 1,250,000원 08/22 15:31 주식회사 예시 잔액 2,000,000원", { now: NOW });
  assert.equal(got.ok, true);
  assert.equal(got.transaction.src, "bank");
  assert.equal(got.transaction.type, "income");
  assert.equal(got.transaction.amount, 1250000);
  assert.equal(got.transaction.date, "2026-08-22 15:31");
});

test("인증번호가 들어간 알림은 하나 거래 문구가 있어도 거부한다", () => {
  const got = HM.parseHanaMessage("하나은행 인증번호 123456 입금 10,000원 08/22 15:31");
  assert.deepEqual(got, { ok: false, reason: "security_message" });
});

test("날짜·시간이 없는 알림은 추측 저장하지 않는다", () => {
  const got = HM.parseHanaMessage("하나은행 입금 10,000원 홍길동");
  assert.deepEqual(got, { ok: false, reason: "missing_datetime" });
});

test("같은 문자는 같은 중복방지 번호를 만든다", () => {
  const s = "하나9541 승인 권*하 100,000원 일시불 08/18 21:37 (주)월드홀딩스";
  const a = HM.parseHanaMessage(s, { now: NOW });
  const b = HM.parseHanaMessage(s, { now: NOW });
  assert.equal(a.transaction.id, b.transaction.id);
  assert.equal(a.transaction.rawHash, b.transaction.rawHash);
});

test("금액 앞 공백이 없는 은행 알림도 읽는다", () => {
  const got = HM.parseHanaMessage("하나은행 입금1,000,000원 08/23 09:01 거래처", { now: NOW });
  assert.equal(got.ok, true);
  assert.equal(got.transaction.amount, 1000000);
});

/* ⚠ 2026-08-26 에 규칙이 «뒤집혔다» (대표: 「대기함, 확정은 손으로」).
   그 전에는 취소 문자를 통째로 버렸는데, 그러면 카드 지출이 «실제보다 많아» 보인다.
   이제는 대기함에 올리고 cancel 표를 달아 «사람이» 정한다.
   ★ 이 검사는 그때 같이 안 고쳐져 빨강인 채로 남아 있었다 —
     CI 가 tests/ 만 돌아서 아무도 못 봤다. 아래에서 CI 가 이 파일도 돌게 했다. */
test("★★ 승인취소 문자는 «대기함에 올리고» 취소 표를 단다 (버리지 않는다)", () => {
  const got = HM.parseHanaMessage("하나9950 승인취소 26,000원 08/23 09:02 스시리", { now: NOW });
  assert.equal(got.ok, true, "취소를 버리면 카드 지출이 실제보다 많아 보인다");
  assert.equal(got.transaction.cancel, true, "취소 표가 없으면 승인처럼 보인다");
  assert.equal(got.transaction.src, "card");
  assert.match(got.transaction.memo, /^\[취소\]/, "한눈에 취소인 줄 알아야 한다");
});

/* ★★ 실제 하나은행 입출금 문자의 «짧은 꼴» (2026-08-24 대표 문자).
   은행 이름을 「하나」 한 낱말로 줄여 보낸다.
   ⚠ 이 꼴이 여기 표본으로 «없어서» 폰 거르개 검사(tests/hana-phone-filter.test.js)가
     이 꼴을 볼 수가 없었다 — 폰이 은행 문자를 통째로 버리는 것을 아무도 못 잡았다
     (대표: 「왜 입출금내역은 없나 30일간」). 규칙은 주석이 아니라 «표본»으로 적어 둔다. */
test("★★ 은행 짧은 꼴 — 「하나 08/24 16:35 … 입금」", () => {
  const r = HM.parseHanaMessage("[Web발신]\n하나 08/24 16:35\n680******45904\n입금 512,073원\n잔액 3,210,000원", { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.transaction.src, "bank");
  assert.equal(r.transaction.type, "income");
  assert.equal(r.transaction.amount, 512073);
});

test("★★ 은행 짧은 꼴 — 출금", () => {
  const r = HM.parseHanaMessage("[Web발신]\n하나 08/25 09:31\n680******45904\n출금 110,000원\n잔액 3,100,000원", { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.transaction.src, "bank");
  assert.equal(r.transaction.type, "expense");
});

/* 「가능액」이 가게 이름에 붙어 남던 것 (2026-08-29 대표 화면) */
test("★★ 「누적가능액」이 가게 이름에 안 붙는다", () => {
  const r = HM.parseHanaMessage("[Web발신] 하나9950 승인 권*하 52,200원 일시불 07/31 11:48 롯데리아천 누적가능액 1,234,567원", { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.transaction.memo, "롯데리아천");
});
