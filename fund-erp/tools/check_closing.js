#!/usr/bin/env node
/* 결산 엔진 회귀 검사 — 실제 확정 결산서로 확인한 수치를 그대로 넣고 다시 계산해 본다.
 *
 * check_fund.js 가 "코드에 그 장치가 있는가"를 보는 것과 달리, 이 검사는
 * "계산 결과가 실제 결산서와 같은가"를 본다. 통장 파일 없이 수치만으로 돌아가므로
 * 자료 폴더가 없어도 언제든 실행된다.
 *
 *   node fund-erp/tools/check_closing.js
 *
 * 여기 적힌 수치는 모두 노동청에 제출된 확정 결산서(또는 그 전기 비교란)에서 읽은 것이다.
 * 제출본 자체가 틀린 항목은 expectNet/expectBasic 에 **바로잡은 값**을 적고 note 에 사유를 남긴다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'fund.html'), 'utf8');

/* fund.html 은 한 파일짜리 앱이라 필요한 함수만 떼어 낸다 */
function grabFn(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('함수를 찾지 못함: ' + n);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('함수가 닫히지 않음: ' + n);
}
function grabVar(n) {
  const i = src.indexOf('var ' + n + '=');
  if (i < 0) throw new Error('변수를 찾지 못함: ' + n);
  let d = 0;
  for (let k = src.indexOf('=', i); k < src.length; k++) {
    const c = src[k];
    if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') { d--; if (d === 0) return src.slice(i, src.indexOf(';', k) + 1); }
  }
  throw new Error('변수가 닫히지 않음: ' + n);
}
global.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : ''; };
global.S = { fundId: 'X', year: 2024 };
global.funds = { X: { fund_type: '공동', years: {} } };
/* 간접 eval — 이 파일은 strict 모드라 그냥 eval 하면 함수가 지역 스코프에 갇힌다 */
(0, eval)(['ACCT_CHART', 'PURPOSE_ACCTS', 'OPEN_ACCT', 'RESERVE_ACCTS', 'F15_ROWS'].map(grabVar).join('\n') + '\n'
  + ['_openingOf', '_splitsOf', '_splitSum', '_txnDone', 'expandSplits', 'journalOf', 'acctMoves',
     // 준비금 1·2 배치는 기금마다 다르다 — 그것을 읽는 도우미도 함께 들여온다
     'computeFin', '_contribOf', '_reserveRate', '_rsvSwapOf', '_rsvRoles', '_reserveAcct', 'reserveAdjust',
     '_reserveEntry', '_reserveEntries', 'finNegatives', '_retLabel', '_retVal',
     /* ⚠ buildF15 가 부르는 것은 모두 들여와야 한다 — 하나만 빠져도 이 검사가 «통째로» 죽고,
        167건이 도는 줄 알지만 실제로는 아무것도 안 돈다(bfMovesOf 가 빠져 그랬다).
        아래 «부르는데 없는 이름» 검사가 그것을 미리 잡는다. */
     '_k1000', '_openAssets', 'guessBfKind', 'bfMovesOf', 'bfDays', 'buildF15'].map(grabFn).join('\n'));

/* ══ 파수꾼 ══ 들여온 함수들이 «부르는데 없는 이름»을 미리 찾는다.
   하나만 빠져도 이 검사는 첫 호출에서 죽고, 167건이 도는 줄 알지만 실제로는 0건이 돈다.
   실제로 bfMovesOf 가 빠져 결산 회귀가 통째로 꺼진 채 main 에 올라가 있었다. */
{
  const names = new Set();
  const bodies = ['buildF15', 'computeFin', 'bfMovesOf', 'reserveAdjust', '_reserveEntries'];
  bodies.forEach(fn => {
    let body; try { body = grabFn(fn); } catch (e) { return; }
    /* 그 함수 «안»에서 만든 이름은 밖에서 들여올 것이 아니다 — 빼지 않으면
       var sg=function(){…} 같은 지역 도우미가 «없는 이름»으로 잘못 걸린다. */
    const local = new Set();
    [...body.matchAll(/\b(?:var|let|const)\s+([_a-zA-Z][\w$]*)/g)].forEach(m => local.add(m[1]));
    [...body.matchAll(/\bfunction\s+([_a-zA-Z][\w$]*)/g)].forEach(m => local.add(m[1]));
    // 점 뒤에 오는 것은 «메서드»라 전역 이름이 아니다(String.fromCharCode 등)
    [...body.matchAll(/(^|[^.\w$])([_a-zA-Z][\w$]*)\s*\(/g)].forEach(m => {
      if (!local.has(m[2])) names.add(m[2]);
    });
  });
  const BUILTIN = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
    'String', 'Number', 'Math', 'Object', 'Array', 'Date', 'JSON', 'parseInt', 'parseFloat', 'isFinite',
    'push', 'map', 'filter', 'forEach', 'reduce', 'sort', 'join', 'slice', 'splice', 'concat', 'indexOf',
    'keys', 'assign', 'test', 'replace', 'match', 'split', 'trim', 'toFixed', 'localeCompare',
    'toLocaleString', 'some', 'every', 'find', 'includes', 'round', 'max', 'min', 'abs', 'floor', 'ceil',
    'charAt', 'substring', 'padStart', 'toString', 'getTime', 'call', 'apply', 'add', 'has']);
  const missing = [...names].filter(x => !BUILTIN.has(x) && typeof global[x] === 'undefined');
  if (missing.length) {
    console.log('\n✗ 들여오지 못한 이름: ' + missing.join(', '));
    console.log('  → check_closing.js 위쪽 grabFn 목록에 넣어야 이 검사가 실제로 돕니다.');
    process.exit(1);
  }
}

let fail = 0, n = 0;
const W = v => String(Math.round(v || 0).toLocaleString()).padStart(16);
function ok(label, got, want) {
  n++;
  const good = Math.round(got || 0) === Math.round(want || 0);
  if (!good) { fail++; console.log('FAIL ' + label + W(got) + '  기대' + W(want)); }
  return good;
}

/* 한 해를 돌린다. 거래는 종류별 금액만 넣으면 되고, 준비금 조정은 앱이 만든다. */
function runYear(o) {
  funds.X.fund_type = o.type || '공동';
  funds.X.years[o.year] = { opening: o.opening || {} };
  if (o.setup != null) funds.X.years[o.year].reserve_setup = o.setup;
  if (o.autoOff) funds.X.years[o.year].reserve_auto = false;
  S.year = o.year;
  const T = [];
  const push = x => T.push(Object.assign(
    { _id: 'T' + (T.length + 1), date: o.year + '-06-30', approved: true, deposit: 0, withdraw: 0 }, x));
  if (o.contribCash) push({ memo: '출연금', deposit: o.contribCash, debit: '현금성자산', credit: '기본재산' });
  if (o.contribKind) push({ memo: '현물출연', amount: o.contribKind, nocash: 1, debit: '매도가능증권', credit: '기본재산' });
  if (o.interest) push({ memo: '예금이자', deposit: o.interest, debit: '현금성자산', credit: '이자수익' });
  if (o.accrued) push({ memo: '미수이자', amount: o.accrued, nocash: 1, debit: '미수수익', credit: '이자수익' });
  if (o.misc) push({ memo: '잡수익', deposit: o.misc, debit: '현금성자산', credit: '잡수익' });
  if (o.purpose) push({ memo: '목적사업비', withdraw: o.purpose, debit: '기타복지비', credit: '현금성자산' });
  if (o.admin) push({ memo: '일반관리비', withdraw: o.admin, debit: '기타관리비', credit: '현금성자산' });
  if (o.loanOut) push({ memo: '근로자대부', withdraw: o.loanOut, debit: '근로자대부금', credit: '현금성자산' });
  if (o.loanBack) push({ memo: '대부상환', deposit: o.loanBack, debit: '현금성자산', credit: '근로자대부금' });
  (o.extra || []).forEach(push);
  const rc = reserveAdjust(T, 'X', o.year);
  const ents = _reserveEntries(o.year, rc);
  const g = computeFin(T.concat(ents.map(x => Object.assign({ _id: x.id }, x.e))), 'X', o.year);
  const bal = a => { const v = g.tb[a] || { debit: 0, credit: 0 }; return v.credit - v.debit; };
  const op = o.opening || {};
  return {
    rc: rc, fin: g,
    reserve1: bal(RESERVE_ACCTS[0]) + (num(op.reserve) || 0),
    reserve2: bal(RESERVE_ACCTS[1]) + (num(op.reserve2) || 0),
  };
}

/* ══ 검증한 기금들 ══
   cash·reserve2·basic·assets 는 확정 결산서의 기말 수치.
   net 은 당기순이익(대개 0), deficit 은 재원이 모자라 결손금으로 이월되는 금액. */
const CASES = [
  { name: 'A공동 2022 (제1기)', year: 2022, opening: {},
    contribCash: 5010000, interest: 389, purpose: 0, admin: 4400,
    cash: 5005989, reserve2: 4504989, basic: 501000, setupWant: 4509000 },
  { name: 'A공동 2023 (제2기)', year: 2023,
    opening: { cash: 5005989, basic: 501000, reserve2: 4504989 },
    interest: 3444, purpose: 3410500, admin: 66900,
    cash: 1532033, reserve2: 1031033, basic: 501000, setupWant: 0 },
  { name: 'A공동 2024 (제3기)', year: 2024,
    opening: { cash: 1532033, basic: 501000, reserve2: 1031033 },
    contribCash: 13750000, interest: 4307, purpose: 8435500, admin: 62500,
    cash: 6788340, reserve2: 4912340, basic: 1876000, setupWant: 12375000 },
  { name: 'A공동 2025 (제4기)', year: 2025,
    opening: { cash: 6788340, basic: 1876000, reserve2: 4912340 },
    contribCash: 8000000, interest: 3357, purpose: 9735500, admin: 71300,
    cash: 4984897, reserve2: 2308897, basic: 2676000, setupWant: 7200000 },

  { name: 'B공동 2022 (현물출연 72.6억)', year: 2022, opening: {},
    contribCash: 30000000, contribKind: 7261110330, interest: 7247, purpose: 7364300, admin: 225300,
    cash: 22417647, reserve2: 19417647, basic: 7264110330, secu: 7261110330,
    assets: 7283527977, setupWant: 27000000 },
  { name: 'B공동 2025 (제4기)', year: 2025,
    opening: { cash: 12121204, secu: 7261110330, basic: 7266110330, reserve2: 7121204 },
    contribCash: 8000000, interest: 8167, purpose: 10255900, admin: 66900,
    cash: 9806571, reserve2: 4006571, basic: 7266910330, secu: 7261110330,
    assets: 7270916901, setupWant: 7200000 },

  /* 수익이 비용보다 커서 '전입'하는 해 — 그래도 설정은 한다 */
  { name: 'C공동 2022 (전입하는 해)', year: 2022, opening: {},
    contribCash: 70004400, interest: 7649, purpose: 0, admin: 4400,
    cash: 70007649, reserve2: 63007209, basic: 7000440, setupWant: 63003960, kindWant: '전입' },
  { name: 'C공동 2024 (출연금 0)', year: 2024,
    opening: { cash: 51046392, basic: 8800440, reserve2: 42245952 },
    interest: 40618, purpose: 17607800, admin: 107640,
    cash: 33371570, reserve2: 24571130, basic: 8800440, setupWant: 0,
    f15: { admin: 107640, rest: 33371570, total: 51087010 } },

  { name: 'D공동 2024', year: 2024,
    opening: { cash: 692612287, basic: 145000000, reserve2: 547612287 },
    interest: 253010, purpose: 127358807, admin: 1302640,
    cash: 564203850, reserve2: 419203850, basic: 145000000, setupWant: 0 },

  { name: 'E공동 2024 (제1기)', year: 2024, opening: {},
    contribCash: 10000000, interest: 2287, purpose: 6600000, admin: 4400,
    cash: 3397887, reserve2: 2397887, basic: 1000000, setupWant: 9000000 },

  /* 협의회가 한도보다 적게 정한 해 — 설정액을 넣으면 그대로 쓴다 */
  { name: 'F공동 2024 (설정액 지정·대부사업)', year: 2024, opening: {}, setup: 412000000,
    contribCash: 1032838188, interest: 81137, purpose: 101190224, admin: 4400,
    loanOut: 239720500, loanBack: 53270000,
    cash: 745274201, reserve2: 310886513, basic: 620838188, loan: 186450500,
    assets: 931724701, setupWant: 412000000 },

  /* 재원이 모자라 결손금이 남는 해 — 기본재산은 그대로 두어야 한다 */
  { name: 'G사내 2025 (결손금 이월)', year: 2025, type: '사내',
    opening: { cash: 830860, secu: 2172724200, basic: 2173524200, reserve2: 30860 },
    interest: 831, admin: 68770,
    cash: 762921, reserve2: 0, basic: 2173524200, secu: 2172724200,
    assets: 2173487121, net: -37079, deficitWant: 37079, setupWant: 0,
    f15: { admin: 68770, rest: 2173487121, total: 2173555891 },
    note: '제출본은 환입을 준비금 잔액에 반영하지 않아 대차가 831원 어긋나 있다' },

  { name: 'H사내 2025 (증권 26억)', year: 2025, type: '사내',
    opening: { cash: 1874382, secu: 2611059000, basic: 2611463400, reserve2: 1469982 },
    interest: 1468, misc: 1, purpose: 800000, admin: 351140,
    cash: 724711, reserve2: 320311, basic: 2611463400, secu: 2611059000,
    assets: 2611783711, setupWant: 0,
    note: '제출본은 계좌 간 이체 1원을 잡수익으로 이중계상해 1원씩 많다' },

  /* 비영리조직회계기준 — 준비금 자동조정을 끄고 당기운영이익을 남긴다 */
  { name: 'I공동 2025 (자동조정 끔)', year: 2025, opening: {}, autoOff: true,
    contribCash: 1061002607, interest: 461478, accrued: 66048, misc: 6353,
    purpose: 431200000, admin: 30140000,
    extra: [
      { memo: '출연금 미수분', amount: 77393, nocash: 1, debit: '미수금', credit: '기본재산' },
      { memo: '단기금융상품 예치', withdraw: 106108000, debit: '단기금융상품', credit: '현금성자산' },
      { memo: '손실대비특별적립금', amount: 106108000, nocash: 1, debit: '기본재산', credit: '손실대비특별적립금' },
      { memo: '특정현금과예금', withdraw: 3200000, debit: '특정현금과예금', credit: '현금성자산' },
      { memo: '준비금b 설정', amount: 461333647, nocash: 1, debit: '기본재산', credit: '고유목적사업준비금2' },
      { memo: '준비금b 환입', amount: 461333647, nocash: 1, debit: '고유목적사업준비금2', credit: '고유목적사업준비금환입' },
      { memo: '준비금a 전입', amount: 461478, nocash: 1, debit: '고유목적사업준비금전입액', credit: '고유목적사업준비금1' },
    ],
    cash: 490822438, basic: 493638353, assets: 600273879, net: 66048, setupWant: 0 },

  /* 전기이월 칸을 늘렸을 때 재무제표 집계에서 빠지지 않는지 — 거래 없이 이월만 */
  { name: 'I공동 2026 (이월만·거래 없음)', year: 2026, autoOff: true,
    opening: { cash: 490822438, accrued: 66048, recv: 77393, stfund: 106108000, spcash: 3200000,
               basic: 493638353, spresv: 106108000, retained: 66048, reserve: 461478 },
    cash: 490822438, basic: 493638353, assets: 600273879, net: 0, setupWant: 0 },

  { name: 'J공동 2025 (설정액 지정)', year: 2025, opening: {}, setup: 423361360,
    contribCash: 897260180, interest: 323627, purpose: 395865000, admin: 27496360,
    extra: [
      { memo: '출연금 미수분', amount: 49820, nocash: 1, debit: '미수금', credit: '기본재산' },
      { memo: '손실대비특별적립금', amount: 89731000, nocash: 1, debit: '기본재산', credit: '손실대비특별적립금' },
    ],
    cash: 474222447, reserve2: 323627, basic: 384217640, assets: 474272267, setupWant: 423361360 },
];

console.log('결산 엔진 회귀 검사 — 확정 결산서 수치로 다시 계산\n');
CASES.forEach(c => {
  const r = runYear(c);
  const f = r.fin;
  console.log('── ' + c.name);
  if (c.cash != null) ok('    현금및현금성자산', f.cash, c.cash);
  if (c.secu != null) ok('    매도가능증권', f.secu, c.secu);
  if (c.loan != null) ok('    근로자대부금', f.loan, c.loan);
  if (c.assets != null) ok('    자산총계', f.totalAssets, c.assets);
  if (c.reserve2 != null) ok('    고유목적사업준비금2', r.reserve2, c.reserve2);
  if (c.basic != null) ok('    기본재산', f.basic, c.basic);
  if (c.setupWant != null) ok('    준비금2 설정액', r.rc.setup, c.setupWant);
  if (c.deficitWant != null) ok('    결손금 이월', r.rc.deficit, c.deficitWant);
  if (c.kindWant) { n++; if (r.rc.kind !== c.kindWant) { fail++; console.log('FAIL     조정 방향 ' + r.rc.kind + '  기대 ' + c.kindWant); } }
  ok('    당기순이익', f.net, c.net || 0);
  /* 어떤 기금이든 반드시 지켜야 하는 것 */
  n++; if (!f.balanced) { fail++; console.log('FAIL     대차 불일치  차이' + W(f.totalAssets - f.totalLiabEq)); }
  n++; if (Math.round(r.reserve1) < 0 || Math.round(r.reserve2) < 0) {
    fail++; console.log('FAIL     준비금이 음수  1:' + W(r.reserve1) + '  2:' + W(r.reserve2));
  }
  const negs = finNegatives(f);
  n++; if (negs.length) { fail++; console.log('FAIL     음수 항목 ' + negs.map(x => x.name + ' ' + x.v.toLocaleString()).join(', ')); }
  if (c.note) console.log('         ※ ' + c.note);
});

/* ══ 별지 제15호서식 — 확정 제출본과 칸별로 대조 ══
   결산이 맞아도 보고서 칸이 틀리면 소용이 없다. 천원 단위로 본다.
   F공동 2024 제출본은 대부금 상환 53,270,000원을 반영하지 않아 ⑬·⑳·㉗·㉘·61 다섯 칸이
   그만큼 어긋난다 — 여기서는 **바로잡은 값**을 기대값으로 적고 제출본 값을 주석에 남긴다. */
function f15Of(o) {
  funds.X.fund_type = o.type || '공동';
  funds.X.years[o.year] = { opening: o.opening || {} };
  if (o.setup != null) funds.X.years[o.year].reserve_setup = o.setup;
  S.year = o.year;
  const T = [];
  const push = x => T.push(Object.assign({ _id: 'T' + (T.length + 1), date: o.year + '-06-30', approved: true, deposit: 0, withdraw: 0 }, x));
  if (o.contribCash) push({ memo: '출연금', deposit: o.contribCash, debit: '현금성자산', credit: '기본재산' });
  if (o.interest) push({ memo: '예금이자', deposit: o.interest, debit: '현금성자산', credit: '이자수익' });
  (o.costs || []).forEach(c => push({ memo: c[0], withdraw: c[1], debit: c[0], credit: '현금성자산' }));
  if (o.admin) push({ memo: '일반관리비', withdraw: o.admin, debit: '지급수수료', credit: '현금성자산' });
  if (o.loanOut) push({ memo: '근로자대부', withdraw: o.loanOut, debit: '근로자대부금', credit: '현금성자산' });
  if (o.loanBack) push({ memo: '대부상환', deposit: o.loanBack, debit: '현금성자산', credit: '근로자대부금' });
  const rc = reserveAdjust(T, 'X', o.year);
  const all = T.concat(_reserveEntries(o.year, rc).map(x => Object.assign({ _id: x.id }, x.e)));
  return buildF15(all, 'X', o.year, o.rep || {}, o.sites || [], o.welf || []);
}
const K1 = v => Math.round((v || 0) / 1000);
function okK(label, got, want) {
  n++;
  if (K1(got) !== want) { fail++; console.log('FAIL ' + label + String(K1(got)).padStart(14) + '천  기대' + String(want).padStart(14) + '천'); }
}
console.log('\n── 별지 제15호서식 (천원)');
let R15 = f15Of({
  year: 2024, opening: {}, setup: 412000000,
  contribCash: 1032838188, interest: 81137, admin: 4400,
  costs: [['기념품비', 41154000], ['의료비', 48600000], ['기타복지비', 11436224]],
  loanOut: 239720500, loanBack: 53270000,
  welf: [{ category: '대부사업', beneficiaries: 8, spent: 239720500 }],
});
/* F공동 2024 — 괄호 안은 제출본 값(대부금 상환 미반영) */
okK('    F공동 ⑬ 사업주 출연', R15.bf.employer, 1032838);      // 제출본 1,086,108
okK('    F공동 ⑰ 기본재산 사용', R15.bf.use, 412000);
okK('    F공동 ⑳ 기본재산 총액', R15.bfEnd, 620838);           // 제출본 674,108
okK('    F공동 ㉗ 근로자 대부', R15.run.loan, 186451);          // 제출본 239,720
okK('    F공동 ㉘ 합계', R15.run.total, 807289);               // 제출본 913,828
okK('    F공동 ㉙ 기금운용 수익금', R15.src.income, 81);
okK('    F공동 ㉚ 출연금 사용한도 범위', R15.src.contrib, 412000);
okK('    F공동 ㉟ 재원 합계', R15.src.total, 412081);
okK('    F공동 60 기금 운영비', R15.admin, 4);
/* 61.잔액은 제출본 310,887천원이 맞다 — 대부금 상환은 대부금이 현금으로 자리만 바꾸는 것이라
   잔액을 바꾸지 않는다. 앞서 상환액만큼 뺀 257,617천원을 여기 적어 두었던 것은 잘못이었다. */
okK('    F공동 61 잔액', R15.rest, 310887);

R15 = f15Of({
  year: 2024, opening: { cash: 51046392, basic: 8800440, reserve: 0, reserve2: 42245952 },
  interest: 40618, admin: 107640,
  costs: [['체육문화비', 5521600], ['장학금', 4027000], ['기타복지비', 8059200]],
});
okK('    C공동 ㉙ 기금운용 수익금', R15.src.income, 41);
okK('    C공동 ㉞ 이월금', R15.src.carry, 51046);
okK('    C공동 ㉟ 재원 합계', R15.src.total, 51087);
okK('    C공동 67 복지사업비 소계', R15.subAmt, 17608);
okK('    C공동 68 기금 운영비', R15.admin, 108);
okK('    C공동 69 잔액', R15.rest, 33372);
okK('    C공동 70 합계', R15.total, 51087);

R15 = f15Of({
  year: 2025, type: '사내',
  opening: { cash: 830860, secu: 2172724200, basic: 2173524200, reserve: 0, reserve2: 30860 },
  interest: 831, admin: 68770,
});
okK('    G사내 ㉞ 이월금', R15.src.carry, 2173555);
okK('    G사내 ㉟ 재원 합계', R15.src.total, 2173556);
okK('    G사내 68 기금 운영비', R15.admin, 69);
okK('    G사내 69 잔액', R15.rest, 2173487);
okK('    G사내 70 합계', R15.total, 2173556);

/* 대부금이 **이월된** 해 — 확정 제출본에 없던 상황이라 산식이 오래 틀린 채 있었다.
   그 해 거래가 하나도 없으면 잔액은 이월금 그대로여야 하고, 상환이 있어도 달라지지 않는다.
   (대부금 항을 넣은 옛 산식은 각각 497,337천·447,337천으로 부풀었다.) */
const CARRY = { cash: 124436013, loan: 186450500, basic: 620838188, reserve: 0, reserve2: 310886513 };
R15 = f15Of({ year: 2025, setup: 0, opening: CARRY });
okK('    대부금 이월 · 거래 없음 — ㉞ 이월금', R15.src.carry, 310887);
okK('    대부금 이월 · 거래 없음 — 69 잔액', R15.rest, 310887);
R15 = f15Of({ year: 2025, setup: 0, opening: CARRY, loanBack: 50000000 });
okK('    대부금 이월 · 5천만원 상환 — 69 잔액', R15.rest, 310887);

/* 결손금은 음수가 아니라 이름을 바꿔 양수로 적는다 */
n++; if (_retLabel(-100) !== '이월결손금' || _retVal(-100) !== 100 || _retLabel(100) !== '이월잉여금' || _retVal(100) !== 100) {
  fail++; console.log('FAIL 결손금 표시 규칙');
}

console.log('\n' + (fail ? 'FAILURES ' + fail + ' / ' + n : 'ALL PASS (' + n + '건)'));
process.exit(fail ? 1 : 0);
