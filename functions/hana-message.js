"use strict";

/* 하나은행·하나카드 알림에서 거래내역에 필요한 최소 정보만 뽑는다.
   원문은 서버에 보관하지 않는다. 인증번호·보안 문구가 섞인 알림은 무조건 거부한다. */

const crypto = require("node:crypto");

const SECRET_RE = /(인증\s*번호|인증\s*코드|일회용\s*비밀번호|비밀번호|보안\s*카드|OTP|본인\s*확인|로그인\s*승인)/i;
const CARD_RE = /(하나\s*카드|하나\s*\d{3,4}\s*(?:승인|취소)|하나카드)/i;
const BANK_RE = /(하나\s*은행|하나\s*뱅크|하나1Q|KEB\s*하나|하나원큐)/i;

function compact(value) {
  return String(value || "")
    .replace(/\[\s*Web\s*발신\s*\]/ig, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function koreaParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now || new Date());
  const out = {};
  parts.forEach((p) => { if (p.type !== "literal") out[p.type] = Number(p.value); });
  return out;
}

function pad2(n) { return String(Number(n) || 0).padStart(2, "0"); }

function readDateTime(text, now) {
  const re = /(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일)?(?:\s+|\s*,\s*)(\d{1,2})\s*:\s*(\d{2})/;
  const m = re.exec(text);
  if (!m) return null;
  const kp = koreaParts(now || new Date());
  let year = Number(m[1]) || kp.year;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  if (!m[1]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
    if (candidate.getTime() > (now || new Date()).getTime() + 31 * 86400000) year -= 1;
  }
  return {
    date: `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}`,
    index: m.index,
    end: m.index + m[0].length,
    raw: m[0],
  };
}

function firstAmount(text) {
  const all = Array.from(text.matchAll(/([0-9][0-9,]*)\s*원/g));
  if (!all.length) return 0;
  return Number(String(all[0][1]).replace(/,/g, "")) || 0;
}

function tailMemo(text, dt, fallback) {
  let memo = dt ? text.slice(dt.end) : "";
  memo = memo
    .replace(/(?:일시불|할부\s*\d+개월|누적|잔액|가용액|사용가능액)\s*[0-9,]*\s*원?/ig, " ")
    .replace(/[|·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!memo) memo = fallback;
  return memo.slice(0, 100);
}

function accountHint(text) {
  const m = /하나\s*(\d{3,4})/.exec(text);
  return m ? `****${m[1]}` : "";
}

function reject(reason) { return { ok: false, reason }; }

function parseHanaMessage(input, options) {
  const opts = options || {};
  const text = compact(input);
  if (!text) return reject("empty");
  if (SECRET_RE.test(text)) return reject("security_message");

  const dt = readDateTime(text, opts.now || new Date());
  if (!dt) return reject("missing_datetime");
  const amount = firstAmount(text);
  if (!amount || amount > 100000000000) return reject("missing_amount");

  let src;
  let type;
  let memo;
  let note;

  if (CARD_RE.test(text) && /취소/.test(text)) {
    return reject("card_cancel_review_required");
  } else if (CARD_RE.test(text) && /승인/.test(text)) {
    src = "card";
    type = "expense";
    memo = tailMemo(text, dt, "하나카드 승인");
    note = `하나카드 문자${accountHint(text) ? ` · ${accountHint(text)}` : ""}`;
  } else if (BANK_RE.test(text) && /(입금|출금|이체)/.test(text)) {
    src = "bank";
    type = /입금/.test(text) ? "income" : "expense";
    memo = tailMemo(text, dt, type === "income" ? "하나은행 입금" : "하나은행 출금");
    note = "하나은행 문자";
  } else {
    return reject("not_hana_transaction");
  }

  const rawHash = sha256(text);
  const id = sha256([src, type, dt.date, amount, compact(memo), rawHash].join("|"));
  return {
    ok: true,
    transaction: {
      id,
      rawHash,
      src,
      type,
      date: dt.date,
      amount,
      balance: 0,
      memo,
      note,
    },
  };
}

module.exports = {
  parseHanaMessage,
  sha256,
  compact,
  readDateTime,
  hasSecuritySecret: (value) => SECRET_RE.test(compact(value)),
};
