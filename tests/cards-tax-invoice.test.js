'use strict';
/* 세금계산서 발급 이메일·담당자 (대표 지시 2026-08-30)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「사업자등록증에 세금계산서 발급 이메일과 담당자가 있는 경우가 많이 있다. 이 부분도
      항목 만들어 달라. 그리고 사진첩에서도 이 부분 OCR 해서 반영하고 입력하게 해달라.
      내용 집어넣어서 푸른이알피에 세금계산서 발급 메일 및 담당자도 자동 찾아 입력
      가능하게 해달라.」

   ■ ⚠ 이미 있는 taxEmail 을 쓰면 «안 된다»
     푸른이알피 업체에는 taxEmail·taxContact 가 이미 있다. 그런데 그것은 «세무사무실»
     주소다 — 보수총액신고 자료 요청 메일(taxMailSubject: 「[N년 보수총액신고] 신고자료
     요청」)이 그리로 나간다. 등록증에 적힌 「전자세금계산서 전용 전자우편주소」는 우리가
     그 업체에 «계산서를 보낼» 곳이라 완전히 다른 자리다.
     같은 칸에 넣으면 보수총액신고 요청이 엉뚱한 주소로 나간다 — 새 칸으로 가른다.
     이름은 이미 있는 taxInvoiceIssueDay·taxInvoicePaymentDay 와 결을 맞춰
     taxInvoiceEmail·taxInvoiceContact 로 둔다.

   ★ 여기서 못 박는 것
     ① 등록증 서식에 두 칸이 있다 (사람이 손으로 넣을 수 있다)
     ② 기업 상세에도 이름표가 있다 (읽은 값이 화면에 나온다)
     ③ 판독기가 등록증에서 그 둘을 읽는다
     ④ 사진첩이 기업정보로 보낼 때 그 둘을 싣는다
     ⑤ 회사 목록이 등록증에서 그 값을 올린다
     ⑥ 검색목록(idx)에 실린다 — 푸른이알피가 읽는 자리다
     ⑦ 푸른이알피로 보낼 때 «세무사무실 칸을 건드리지 않는다» (이 검사의 알맹이)
     ⑧ 이미 적힌 값은 안 덮는다 — 사람이 고쳐 둔 것을 조용히 지우지 않는다
   실행: node --test tests/cards-tax-invoice.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const src = R('pu-cards.html');
const read = R('js/pu-doc-read.js');
const file = R('js/pu-doc-file.js');

function code(s){
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}
function fnBody(name, s){
  s = s || src;
  let i = s.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = s.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = s.indexOf('{', i);
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

const F = ['taxInvoiceEmail', 'taxInvoiceContact'];

/* ══════ ① 등록증 서식 ══════ */
test('★ 등록증 서식에 세금계산서 이메일·담당자 칸이 있다', () => {
  const m = src.match(/^const BIZ_FIELDS=[\s\S]*?\];$/m);
  assert.ok(m, 'BIZ_FIELDS 를 찾을 수 없습니다');
  F.forEach(k => assert.match(m[0], new RegExp("'" + k + "'"),
    '★ 「' + k + '」 칸이 없다 — 손으로 넣을 자리조차 없다'));
});

/* ══════ ② 기업 상세 이름표 ══════ */
test('★ 기업 상세에도 이름표가 있다 — 없으면 값은 쌓이는데 화면에 안 나온다', () => {
  const m = src.match(/^const CO_FIELDS = \[[\s\S]*?^\];$/m);
  assert.ok(m, 'CO_FIELDS 를 찾을 수 없습니다');
  F.forEach(k => assert.match(m[0], new RegExp("'" + k + "'"),
    '★ 「' + k + '」 이름표가 없다 — pu-doc-file 의 KEEP 과 짝이 어긋난다'));
});

/* ══════ ③ 판독기 ══════ */
test('★ 판독기가 등록증에서 세금계산서 이메일·담당자를 읽는다', () => {
  const line = read.split('\n').find(l => l.includes('kind=bizreg 이면 키'));
  assert.ok(line, '등록증 키 목록을 찾을 수 없습니다');
  F.forEach(k => assert.ok(line.includes(k),
    '★ 판독기가 「' + k + '」 를 안 읽는다 — 사진에 적혀 있어도 안 들어온다'));
});

test('★ 무슨 글자를 찾아야 하는지 알려 준다 — 등록증에는 「전자세금계산서 전용 전자우편주소」로 적힌다', () => {
  assert.match(read, /전자세금계산서/,
    '★ 칸 이름만 주면 어디를 봐야 할지 몰라 빈 값으로 온다');
});

/* ══════ ④ 사진첩 → 기업정보 ══════ */
test('★ 사진첩이 기업정보로 보낼 때 그 둘을 싣는다', () => {
  const m = file.match(/var KEEP = \[[\s\S]*?\];/);
  assert.ok(m, 'KEEP 목록을 찾을 수 없습니다');
  F.forEach(k => assert.match(m[0], new RegExp("'" + k + "'"),
    '★ KEEP 에 없으면 판독은 되는데 기업 상세로 오지 못한다'));
});

/* ══════ ⑤ 회사로 올라온다 ══════ */
test('★ 등록증의 값이 «회사»로 올라온다', () => {
  const b = code(fnBody('coListBuild'));
  F.forEach(k => assert.match(b, new RegExp(k),
    '★ 회사로 안 올리면 기업 상세·이알피 보내기가 늘 빈칸을 본다'));
});

/* ══════ ⑥ 검색목록 ══════ */
test('★ 검색목록(idx)에 실린다 — 푸른이알피가 읽는 자리다', () => {
  const b = code(fnBody('idxRecord'));
  F.forEach(k => assert.match(b, new RegExp(k),
    '★ idx 에 없으면 푸른이알피 쪽에서 이 값을 볼 길이 없다'));
});

/* ══════ ⑦⑧ 이알피로 보내기 ══════ */
function loadPush(){
  const ctx = { console, Object, String, Array, Date };
  vm.createContext(ctx);
  vm.runInContext(fnBody('taxInvoicePatch'), ctx);
  return ctx;
}

test('★★ 세무사무실 칸을 건드리지 않는다 — 보수총액신고 요청이 엉뚱한 곳으로 간다', () => {
  const C = loadPush();
  const p = C.taxInvoicePatch({ id: 'c1' },
    { taxInvoiceEmail: 'bill@abc.co.kr', taxInvoiceContact: '김경리' });
  const keys = Object.keys(p);
  ['taxEmail', 'taxContact', 'taxOfficeName', 'taxPhone'].forEach(k => {
    assert.ok(!keys.includes(k),
      '★★ 「' + k + '」 은 «세무사무실» 자리다 — 여기 계산서 주소를 넣으면 보수총액신고 요청이 그리로 간다');
  });
  assert.equal(p.taxInvoiceEmail, 'bill@abc.co.kr');
  assert.equal(p.taxInvoiceContact, '김경리');
});

test('★ 이미 적힌 값은 안 덮는다 — 사람이 고쳐 둔 것을 조용히 지우지 않는다', () => {
  const C = loadPush();
  const p = C.taxInvoicePatch({ id: 'c1', taxInvoiceEmail: '손으로@넣은.값' },
    { taxInvoiceEmail: 'bill@abc.co.kr', taxInvoiceContact: '김경리' });
  assert.ok(!('taxInvoiceEmail' in p),
    '★ 이미 있는 이메일을 덮었다 — 업체관리에서 고쳐 둔 것이 말없이 사라진다');
  assert.equal(p.taxInvoiceContact, '김경리', '빈 칸은 채워야 한다');
});

test('채울 것이 없으면 아무것도 안 쓴다 — 헛 쓰기는 요금만 는다', () => {
  const C = loadPush();
  const p = C.taxInvoicePatch({ id: 'c1', taxInvoiceEmail: 'a@b.c', taxInvoiceContact: '김' },
    { taxInvoiceEmail: 'bill@abc.co.kr', taxInvoiceContact: '이' });
  assert.deepEqual(Object.keys(p), []);
});

test('값이 비어 있으면 빈 값을 밀어 넣지 않는다', () => {
  const C = loadPush();
  const p = C.taxInvoicePatch({ id: 'c1' }, { taxInvoiceEmail: '   ', taxInvoiceContact: '' });
  assert.deepEqual(Object.keys(p), [], '빈 값을 쓰면 「채워졌다」고 잘못 보인다');
});
