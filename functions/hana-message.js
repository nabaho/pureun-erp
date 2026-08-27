"use strict";

/* 하나은행·하나카드 알림에서 거래내역에 필요한 최소 정보만 뽑는다.
   원문은 서버에 보관하지 않는다. 인증번호·보안 문구가 섞인 알림은 무조건 거부한다. */

const crypto = require("node:crypto");

const SECRET_RE = /(인증\s*번호|인증\s*코드|일회용\s*비밀번호|비밀번호|보안\s*카드|OTP|본인\s*확인|로그인\s*승인)/i;
const CARD_RE = /(하나\s*카드|하나\s*\d{3,4}\s*(?:승인|취소)|하나카드)/i;
/* ⚠ 실제 하나은행 입출금 문자는 「하나은행」이라고 안 적고 「하나 08/24 08:09」처럼
   은행 이름을 한 글자로 줄여 보낸다(2026-08-24 대표 문자). 예전 규칙은 「은행」이라는
   글자를 요구해서 이 형식을 통째로 버렸고, 휴대폰 쪽 거르개(HanaMessageFilter)는
   「하나 」를 받아들이므로 «휴대폰은 보내고 서버는 조용히 버리는» 어긋남이 있었다.
   그래서 «하나» 뒤에 빈칸이나 숫자가 오는 것도 은행으로 본다.
   ⚠ 「하나카드」는 뒤가 한글이라 여기 안 걸린다 — 카드는 위 CARD_RE 가 먼저 잡는다. */
const BANK_RE = /(하나\s*은행|하나\s*뱅크|하나1Q|KEB\s*하나|하나원큐|(?:^|[^가-힣])하나(?=[\s\d]))/i;

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
    /* ★ 금액도 뗀다 (2026-08-26) — 은행 쪽은 떼는데 카드만 안 뗐다.
       「71,700원 (주)루나」처럼 남으면 업체 이름 맞추기가 빗나간다. */
    .replace(/[0-9][0-9,]*\s*원/g, " ")
    /* ⚠ 「승인·취소·카드사 이름 떼기」는 넣었다가 «걷어냈다» (2026-08-26).
       실제 하나카드 문자는 그 말들이 «날짜 앞»에 있어 여기까지 오지 않는다 —
       쓰이지도 않으면서 「신용정보원」 같은 «진짜 가게 이름»을 깎을 위험만 있었다.
       근거 없이 넣은 거르개는 언젠가 엉뚱한 것을 지운다. */
    .replace(/[|·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!memo) memo = fallback;
  return memo.slice(0, 100);
}

/* 통장 문자의 적요 — 여기서 나온 글이 업체 이름과 맞춰진다.
   ⚠ 곁가지를 안 걷어내면 「적요 주식회사주원테」처럼 «이름표»가 이름에 붙어
     자동 맞춤이 빗나간다(2026-08-24 대표 문자에서 실제로 그랬다).
     계좌번호·「입금 165,000원」·잔액도 마찬가지로 이름이 아니다. */
function scrubBank(value) {
  return String(value || "")
    .replace(/(?:잔액|가용액|출금\s*가능\s*금액|사용\s*가능\s*금액|사용가능액|누적)\s*[0-9,]*\s*원?/ig, " ")
    .replace(/[0-9*]{2,}-[0-9*]{2,}(?:-[0-9*]{2,})+/g, " ")
    .replace(/(?:입금|출금|이체)\s*(?:계좌|통장)?\s*[0-9,]*\s*원?/g, " ")
    .replace(/[0-9][0-9,]*\s*원/g, " ")
    .replace(/(?:^|\s)(?:적요|내용|비고|메모|받는분|보낸분)\s*[:：]?\s*/g, " ")
    .replace(/[|·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bankMemo(text, dt, fallback) {
  /* 날짜 뒤가 본문인 것이 보통이지만, 날짜를 끝에 붙여 보내는 형식도 있다 —
     뒤가 비면 앞을 본다. 앞을 볼 때는 맨 앞 은행 이름만 떼어 낸다. */
  let memo = scrubBank(dt ? text.slice(dt.end) : text);
  if (!memo && dt) {
    memo = scrubBank(text.slice(0, dt.index)
      .replace(/^\s*하나\s*(?:은행|뱅크|1Q|원큐)?/, " "));
  }
  return (memo || fallback).slice(0, 100);
}

/* 입금이냐 출금이냐 — «먼저 나온 쪽»을 따른다.
   ⚠ 그냥 「입금이 있나」로 보면 출금 문자 안의 «입금계좌» 때문에 출금이 입금으로
     잡힌다. 돈의 방향이 뒤집히는 것이라 회계가 통째로 어긋난다. */
function bankDirection(text) {
  const inAt = text.indexOf("입금");
  const outAt = text.indexOf("출금");
  if (inAt < 0) return "expense";
  if (outAt < 0) return "income";
  return inAt < outAt ? "income" : "expense";
}

/* 잔액 — 통장 문자에는 늘 붙어 오는데 여태 0 으로 버렸다.
   거래내역 표에 잔액 칸이 있고, 빠진 줄을 찾을 때 «잔액이 이어지는가»가 가장 빠른 길이다. */
function readBalance(text) {
  const m = /잔액\s*[:：]?\s*([0-9][0-9,]*)/.exec(text);
  return m ? (Number(String(m[1]).replace(/,/g, "")) || 0) : 0;
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
  let balance = 0;
  let memo;
  let note;
  let cancel = false;

  if (CARD_RE.test(text) && /(승인|취소)/.test(text)) {
    /* ★ 취소도 «대기함에 올린다» (2026-08-26 대표 답: 「대기함, 확정은 손으로」).
       종전에는 서버가 통째로 버려서 승인만 들어왔다 —
       ⚠ 그러면 카드 지출이 «실제보다 많아» 보인다.
       ⚠ 다만 스스로 마이너스로 만들지는 않는다. 취소는 사람이 보고 정한다. */
    const isCancel = /취소/.test(text);
    src = "card";
    type = "expense";
    cancel = isCancel;
    memo = tailMemo(text, dt, isCancel ? "하나카드 취소" : "하나카드 승인");
    if (isCancel) memo = `[취소] ${memo}`.slice(0, 100);
    note = `하나카드 ${isCancel ? "취소" : "승인"} 문자${accountHint(text) ? ` · ${accountHint(text)}` : ""}`;
  } else if (BANK_RE.test(text) && /(입금|출금|이체)/.test(text)) {
    src = "bank";
    type = bankDirection(text);
    balance = readBalance(text);
    memo = bankMemo(text, dt, type === "income" ? "하나은행 입금" : "하나은행 출금");
    note = `하나은행 문자${accountHint(text) ? ` · ${accountHint(text)}` : ""}`;
  } else {
    return reject("not_hana_transaction");
  }

  const rawHash = sha256(text);
  /* ⚠ 취소 여부를 열쇠에 넣는다 — 같은 날 같은 금액의 승인과 취소가
     한 줄로 겹쳐 «취소가 사라지는» 일을 막는다. */
  const id = sha256([src, type, cancel ? "C" : "A", dt.date, amount, compact(memo), rawHash].join("|"));
  return {
    ok: true,
    transaction: {
      id,
      rawHash,
      src,
      type,
      date: dt.date,
      amount,
      balance,
      memo,
      note,
      /* 취소 줄은 «스스로 확정되지 않는다» — 화면이 이 표를 보고 손을 막는다. */
      cancel,
    },
  };
}

module.exports = {
  parseHanaMessage,
  bankMemo,
  bankDirection,
  sha256,
  compact,
  readDateTime,
  hasSecuritySecret: (value) => SECRET_RE.test(compact(value)),
};
