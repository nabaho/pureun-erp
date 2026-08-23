"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const HM = require("../functions/hana-message");

const NOW = new Date("2026-08-23T03:00:00.000Z");

test("하나카드 승인 알림은 카드 출금 최소정보로 읽는다", () => {
  const got = HM.parseHanaMessage(
    "[Web발신] 하나9950 승인 푸른노무법 26,000원 일시불 08/18 12:59 스시리두정 가용액3,432,999원",
    { now: NOW },
  );
  assert.equal(got.ok, true);
  assert.equal(got.transaction.src, "card");
  assert.equal(got.transaction.type, "expense");
  assert.equal(got.transaction.amount, 26000);
  assert.equal(got.transaction.date, "2026-08-18 12:59");
  assert.match(got.transaction.memo, /스시리두정/);
  assert.doesNotMatch(JSON.stringify(got.transaction), /푸른노무법/);
});

test("하나은행 입금 알림은 통장 입금으로 읽는다", () => {
  const got = HM.parseHanaMessage(
    "[Web발신] 하나은행 입금1,250,000원 08/22 15:31 주식회사 예시 잔액 2,000,000원",
    { now: NOW },
  );
  assert.equal(got.ok, true);
  assert.equal(got.transaction.src, "bank");
  assert.equal(got.transaction.type, "income");
  assert.equal(got.transaction.amount, 1250000);
  assert.equal(got.transaction.date, "2026-08-22 15:31");
});

test("인증번호·날짜 없는 알림·승인취소는 자동 저장하지 않는다", () => {
  assert.deepEqual(
    HM.parseHanaMessage("하나은행 인증번호 123456 입금 10,000원 08/22 15:31"),
    { ok: false, reason: "security_message" },
  );
  assert.deepEqual(
    HM.parseHanaMessage("하나은행 입금 10,000원 홍길동"),
    { ok: false, reason: "missing_datetime" },
  );
  assert.deepEqual(
    HM.parseHanaMessage("하나9950 승인취소 26,000원 08/23 09:02 스시리", { now: NOW }),
    { ok: false, reason: "card_cancel_review_required" },
  );
});

test("같은 거래 알림은 같은 중복방지 번호를 만든다", () => {
  const text = "하나9541 승인 권*하 100,000원 일시불 08/18 21:37 (주)월드홀딩스";
  const first = HM.parseHanaMessage(text, { now: NOW });
  const second = HM.parseHanaMessage(text, { now: NOW });
  assert.equal(first.transaction.id, second.transaction.id);
  assert.equal(first.transaction.rawHash, second.transaction.rawHash);
});
