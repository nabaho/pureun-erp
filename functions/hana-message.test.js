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

test("승인취소 문자는 출금으로 잘못 넣지 않고 검토 대상으로 제외한다", () => {
  const got = HM.parseHanaMessage("하나9950 승인취소 26,000원 08/23 09:02 스시리", { now: NOW });
  assert.deepEqual(got, { ok: false, reason: "card_cancel_review_required" });
});
