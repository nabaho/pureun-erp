'use strict';
/* ══════ 이름이 «그대로» 같은 곳이 먼저다 (2026-09-03) ══════
   대표 지시로 「업무관리·급여데이터함이 회사를 이름으로만 맞춘다」를 살펴보다 알게 된 것.

   ■ 살펴본 결론부터 — 두 앱은 «이름으로만» 맞추지 않는다
     · 급여데이터함은 저장을 **companyId**(푸른이알피 업체 번호)로 한다.
     · 업무관리도 **co_id 우선**, 없을 때만 정규화한 이름 «정확 일치»로 물러난다
       (`coFind` · `_normCo` 가 (주)·주식회사·빈칸을 뗀다 — 2026-08-28 의
       「주식회사 행복한단홍갈비」/「행복한 단홍갈비」 쌍은 이미 맞는다).
     그래서 「사업자번호를 넣어야 한다」는 앞선 진단은 **틀렸다.**
     사업자번호는 이 자리의 열쇠가 아니다 — 업체 번호가 이미 그 일을 하고 있다.

   ■ 다만 «이름으로 짐작하는» 자리가 하나 남아 있고, 거기서 진짜 결함을 찾았다
     급여데이터함은 올린 파일의 «이름»으로 사업장을 짐작한다(guessTag → matchCompanyName).
     사업자번호가 파일 이름에 있을 수 없으니 이 자리는 이름으로 할 수밖에 없다.
     그런데 긴 이름부터 훑으며 「담고 있나」만 보아서 —
       파일 「천성」  ·  목록 [천성, 천성가축약품]  →  «천성가축약품» 을 골랐다.
     목록에 「천성」이 버젓이 있는데 다른 회사를 고른 것이다.
     PR #837 이 「「천성」은 「천성가축약품」과 다른 곳」이라고 못 박은 그 쌍이다.

   ★ 여기서 못 박는 것
     ① 이름이 그대로 같은 곳이 «먼저»다 — 긴 이름 우선보다 앞선다
     ② 앞가지·괄호·빈칸을 뗀 뒤 견주는 것은 그대로다
     ③ 「지점」처럼 뒤에 붙는 것은 여전히 그 회사로 본다 (화담원 아산점 → 화담원)
     ④ 못 알아본 것은 «빈칸»으로 남긴다
     ⑤ ⚠ 「천성전자」가 「천성」으로 걸리는 것은 «못 막는다» — 여기 적어 둔다
   실행: node --test tests/paydata-name-exact.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');

function grab(name){
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
function load(){
  const ctx = { console, String, Array, Object };
  vm.createContext(ctx);
  vm.runInContext(grab('coreName') + '\n' + grab('matchCompanyName'), ctx);
  return ctx;
}
const co = (id, name) => ({ id, name });
const 목록 = [co('a', '천성'), co('b', '천성가축약품'),
              co('c', '화담원'), co('d', '화담원산업'),
              co('e', '주식회사 행복한단홍갈비')];
const hit = (text, list) => {
  const r = load().matchCompanyName(text, list || 목록);
  return r ? r.name : null;
};

/* ── ① 그대로 같은 것이 먼저 ──────────────────────────────────── */

test('★ 이름이 «그대로» 같은 곳이 먼저다 — 긴 이름이 짧은 이름을 가로채지 않는다', () => {
  assert.equal(hit('천성'), '천성',
    '★ 목록에 「천성」이 있는데 「천성가축약품」을 골랐다 — 다른 회사 서랍에 들어간다');
});

test('★ 앞가지·괄호·빈칸을 뗀 뒤에도 «그대로 같음»으로 본다', () => {
  const list = [co('a', '천성'), co('b', '천성가축약품')];
  assert.equal(hit('주식회사 천성', list), '천성');
  assert.equal(hit('(주)천성', list), '천성');
  assert.equal(hit('천 성', list), '천성');
});

test('그대로 같은 것이 없으면 «담고 있는» 곳으로 물러난다', () => {
  assert.equal(hit('천성가축약품 8월.xlsx'), '천성가축약품');
  assert.equal(hit('천성 8월.xlsx'), '천성', '파일 이름이 「천성」으로 시작하면 천성이다');
  assert.equal(hit('천성.xlsx'), '천성');
});

/* ── ③ 지점은 그 회사다 (이미 있던 약속) ────────────────────── */

test('★ 「지점」처럼 뒤에 붙는 것은 그 회사로 본다 — 급여관리 설정카드가 그렇게 적는다', () => {
  assert.equal(hit('화담원 아산점 8월'), '화담원');
  assert.equal(hit('화담원 아산점_25년 07월_급여대장.xlsx'), '화담원');
});

test('더 긴 이름이 맞으면 그것을 고른다 — 「화담원」이 「화담원산업」을 가로채지 않는다', () => {
  assert.equal(hit('화담원산업 8월'), '화담원산업');
});

/* ── ④ 못 알아본 것은 빈칸 ──────────────────────────────────── */

test('★ 못 알아본 것은 «빈칸»으로 남긴다 — 아무거나 골라 넣으면 아무도 모른다', () => {
  assert.equal(hit('8월.xlsx'), null);
  assert.equal(hit(''), null);
  assert.equal(hit('미르텍 8월.xlsx'), null);
  assert.equal(load().matchCompanyName('화담원', null), null, '목록이 없어도 터지지 않는다');
  assert.equal(load().matchCompanyName('화담원', []), null);
});

test('★ 이름이 빈 업체가 «못 알아본» 파일을 가로채지 않는다', () => {
  /* ⚠ 빈 이름은 «무엇에나» 걸린다 — indexOf('') 는 늘 0 이다.
     ⚠ 「천성 8월」로 견주면 이 자리에 못 닿는다: 긴 이름부터 보므로 「천성」이 먼저
       맞아 빈 이름까지 가지 않는다. 아무도 안 맞는 파일이어야 그 자리에 닿는다
       (2026-09-03 고장넣기에서 이 검사가 헛돈 것을 잡았다). */
  const list = [co('x', ''), co('a', '천성')];
  assert.equal(hit('미르텍 8월', list), null,
    '★ 이름 없는 업체가 못 알아본 파일을 다 받아 간다 — 그 서랍이 쓰레기통이 된다');
  assert.equal(hit('천성 8월', list), '천성', '멀쩡한 것은 그대로 맞아야 한다');
});

/* ── ⑤ 못 막는 자리를 «적어 둔다» ───────────────────────────── */

test('⚠ 「천성전자」가 「천성」으로 걸리는 것은 못 막는다 — 알고 두는 것이다', () => {
  /* 「화담원 아산점」이 화담원의 지점이라, «이름 뒤에 글자가 붙으면 다른 곳»으로
     볼 수가 없다(바로 위 검사가 그것을 요구한다). 말로 가릴 수 없는 자리다.
     그래서 이 함수는 «짐작»일 뿐이고, 사람이 고른 이름표가 이긴다(guessTag 주석).
     ★ 이 검사는 「고쳐졌다」고 착각하지 않으려고 둔다. 언젠가 가릴 길이 생기면
       이 검사를 바꾸는 것으로 시작한다. */
  assert.equal(hit('천성전자 8월.xlsx'), '천성',
    '이 답이 바뀌었다면 가릴 길을 찾은 것이다 — 그때 이 검사를 다시 쓸 것');
});

test('★ 사람이 고른 이름표가 짐작을 이긴다 — 짐작이 틀려도 되돌릴 수 있어야 한다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pu-paydata.html'), 'utf8');
  assert.match(src, /사람이 고른 이름표는 화면을 다시 그려도 남는다/,
    '★ 짐작이 사람이 고른 것을 덮으면, 틀린 짐작을 고칠 길이 없다');
});
