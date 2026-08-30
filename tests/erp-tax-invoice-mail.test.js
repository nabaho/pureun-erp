'use strict';
/* 세금계산서 발급 메일이 «푸른이알피에서 실제로 쓰이는가» (대표 검토 지시 2026-08-30)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 화면에서 드러난 것
     등록증 상세의 「메모」에 이렇게 들어 있었다 —
       「전자세금계산서 전용 전자우편주소: KJKdoc111@Naver.Com」
     새로 만든 taxInvoiceEmail 칸이 «아니라» 메모다. 예전 판독기에는 그 칸이 없어서
     읽은 것을 메모로 흘려 둔 것이다. 등록증 351장이 거의 다 이 꼴이다.

   ■ 그래서 끊긴 곳이 둘이었다
     ① 이미 판독된 등록증은 값이 «메모»에 있어 자동 채우기가 못 잡는다.
        (taxAutoTargets 는 taxInvoiceEmail 만 본다 → 늘 빈칸 → 한 곳도 안 채워진다)
     ② 푸른이알피에는 그 값을 «보여 줄 자리»가 없다. pu-erp.html 에 taxInvoiceEmail 이
        한 글자도 없었다 — 써 넣어도 사람 눈에는 안 보이고, 내보내기에도 안 실린다.
        「추후 기록도 넣을 수 있게 되었는지」에 대한 답이 바로 이것이다: 아직 아니었다.

   ★ 여기서 못 박는 것
     ① 메모에 적힌 「전자세금계산서 전용 전자우편주소」를 읽어 낸다
     ② 아무 이메일이나 끌어오지 않는다 — 세금계산서 이야기일 때만
     ③ 제 칸(taxInvoiceEmail)이 있으면 그것이 이긴다 — 메모는 «채워 주는» 것뿐이다
     ④ 회사로 올릴 때 그 되살린 값을 쓴다
     ⑤ 푸른이알피 업체 상세가 «발급 메일·담당자»를 보여 준다
     ⑥ 내보내기에도 실린다 — 화면에만 있으면 자료로 못 쓴다
   실행: node --test tests/erp-tax-invoice-mail.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const src = R('pu-cards.html');
const erp = R('pu-erp.html');

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
function loadPick(){
  const ctx = { console, Object, String, Array, RegExp };
  vm.createContext(ctx);
  vm.runInContext(fnBody('taxInvoiceFromText'), ctx);
  return ctx;
}

/* ══════ ① 메모에서 되살린다 ══════ */
test('★ 메모에 적힌 「전자세금계산서 전용 전자우편주소」를 읽어 낸다 — 등록증 351장이 이 꼴이다', () => {
  const C = loadPick();
  assert.equal(C.taxInvoiceFromText('전자세금계산서 전용 전자우편주소: KJKdoc111@Naver.Com'),
    'KJKdoc111@Naver.Com',
    '★ 못 읽으면 이미 판독된 등록증은 한 곳도 이알피로 못 간다');
});

test('줄바꿈·다른 말이 섞여 있어도 읽는다', () => {
  const C = loadPick();
  assert.equal(C.taxInvoiceFromText('교부 사유: 정정\n전자세금계산서 전용 전자우편주소 abc.d@gana.co.kr\n끝'),
    'abc.d@gana.co.kr');
});

test('없으면 빈 문자열이다 — 지어내지 않는다', () => {
  const C = loadPick();
  assert.equal(C.taxInvoiceFromText('그냥 메모입니다'), '');
  assert.equal(C.taxInvoiceFromText(''), '');
  assert.equal(C.taxInvoiceFromText(null), '');
});

/* ══════ ② 아무 이메일이나 끌어오지 않는다 ══════ */
test('★ 세금계산서 이야기가 아니면 안 가져온다 — 대표 개인 메일이 발급처가 되면 안 된다', () => {
  const C = loadPick();
  assert.equal(C.taxInvoiceFromText('대표자 개인 연락 ceo@gana.co.kr 로'), '',
    '★ 메모에 있는 아무 주소나 끌어오면 엉뚱한 곳으로 계산서가 나간다');
});

/* ══════ ③④ 제 칸이 이긴다 · 회사로 올린다 ══════ */
test('★ 제 칸이 있으면 그것이 이긴다 — 메모는 «채워 주는» 것뿐이다', () => {
  const b = code(fnBody('coListBuild'));
  assert.match(b, /it\.taxInvoiceEmail\s*\|\|\s*taxInvoiceFromText/,
    '★ 메모를 먼저 쓰면 사람이 고쳐 둔 제 칸 값을 덮는다');
});

/* ══════ ⑤ 이알피 화면 ══════ */
/* ⚠ 주석을 «먼저 걷는다». 안 그러면 「taxInvoiceEmail 에 채워 넣는다」고 적어 둔 설명이
   검사를 통과시킨다 — 줄을 통째로 지워도 안 걸렸다(2026-08-30 확인).
   화면에 그리는 «코드»가 있는지를 봐야 한다. */
test('★★ 푸른이알피 업체 상세가 «발급 메일»을 보여 준다 — 이것이 대표 물음의 답이다', () => {
  const bare = code(erp);
  assert.match(bare, /taxInvoiceEmail/,
    '★★ 써 넣어도 이알피 화면 어디에도 안 나오면 «넣을 수 있게 된 것»이 아니다');
  const i = bare.indexOf("row('세금계산서'");
  assert.ok(i > 0, '업체 상세의 세금계산서 줄을 찾을 수 없습니다');
  const seg = bare.slice(i, i + 700);
  assert.match(seg, /co\.taxInvoiceEmail/,
    '★ 발급일·입금일 옆에 있어야 한 눈에 읽힌다');
  assert.match(seg, /co\.taxInvoiceContact/, '담당자도 함께 보여야 한다');
});

/* ══════ ⑥ 내보내기 ══════ */
test('★ 내보내기에도 실린다 — 화면에만 있으면 자료로 못 쓴다', () => {
  const i = erp.indexOf('세금계산서_발급일: co.taxInvoiceIssueDay');
  assert.ok(i > 0, '내보내기 줄을 찾을 수 없습니다');
  const seg = erp.slice(i - 200, i + 500);
  assert.match(seg, /co\.taxInvoiceEmail/,
    '★ 내보내기에 없으면 엑셀로 뽑아 돌려 볼 수가 없다');
});
