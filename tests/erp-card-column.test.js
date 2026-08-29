/* 카드 칸 + 폰 거르개의 «낱말 경계» (대표 지시 2026-08-29)
 *
 * 대표: 「하나은행에서 적요에 카드와 사용처를 각각 분리해달라,
 *       그래야 카드만 분리해서 볼 수 있다」
 *       「왜 입출금내역은 없나 30일간」
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const JAVA = fs.readFileSync(path.join(R,
  'android/hana-sms-bridge/app/src/main/java/kr/pureun/hanabridge/HanaMessageFilter.java'), 'utf8');

function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(cutBlock(ERP, 'function erpCardTail(row){'), ctx);
const tail = ctx.erpCardTail;

/* ── 카드 끝자리 읽기 ── */
test('★★ 카드 줄에서 «끝 네 자리»를 읽는다', () => {
  assert.strictEqual(tail({ src: 'card', note: '하나카드 승인 문자 · ****9950' }), '9950');
  assert.strictEqual(tail({ src: 'card', note: '하나카드 취소 문자 · ****9541' }), '9541');
});

test('★★ 은행 줄은 카드가 «아니다» — 섞이면 카드만 골라 볼 수가 없다', () => {
  assert.strictEqual(tail({ src: 'bank', note: '하나은행 문자 · ****9950' }), '',
    '★ 은행 줄까지 카드로 세면 「카드만 보기」가 거짓말이 된다');
  assert.strictEqual(tail({ src: 'bank', note: '하나은행 문자' }), '');
});

test('★ 끝자리가 없으면 빈 글자 — 없는 것을 지어내지 않는다', () => {
  assert.strictEqual(tail({ src: 'card', note: '하나카드 승인 문자' }), '');
  assert.strictEqual(tail({ src: 'card' }), '');
  assert.strictEqual(tail(null), '');
});

/* ── 화면이 그것을 실제로 쓰는가 ── */
test('★★ 출금 표에 «카드» 칸이 서고, 카드별로 거른다', () => {
  const bare = ERP.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(bare.indexOf("h('th',{style:Object.assign({},thS,{width:'64px'})},'카드')") >= 0,
    '★ 카드 칸이 없다 — 적요에 섞여 있으면 카드만 골라 볼 수가 없다');
  assert.ok(/expCardList\s*=\s*expList\.filter/.test(bare),
    '★ 카드로 거르지 않는다');
  assert.ok(bare.indexOf('expCardList.slice(0,ldShow)') >= 0,
    '★ 걸러 놓고 옛 목록을 그린다 — 골라도 그대로 다 나온다');
});

/* ── 폰 거르개: 낱말 속 「하나」에 걸리면 안 된다 ── */
test('★★ 낱말 «속»의 「하나」에는 안 걸린다 (우리하나·신한하나 …)', () => {
  const m = JAVA.match(/Pattern\s+HANA\s*=\s*Pattern\.compile\(([\s\S]*?)\);/);
  assert.ok(m, '폰 거르개 규칙을 못 찾았습니다');
  /* ⚠ 규칙을 «자바 원본에서» 읽는다 — 옮겨 적으면 폰과 검사가 또 갈라진다. */
  const src = m[1].split('+').map((s) => s.trim().replace(/^"|"$/g, '')).join('').replace(/\\\\/g, '\\');
  assert.ok(src.indexOf('/*') < 0,
    '★ 규칙 한가운데에 주석이 있다 — 글자로 읽어 가는 검사가 주석을 규칙으로 삼킨다');
  const re = new RegExp(src, 'i');
  assert.ok(re.test('하나 08/24 16:35 입금 512,073원'),
    '★ 은행 짧은 꼴을 못 알아본다 — 30일치에 입출금이 통째로 빠진다');
  assert.ok(!re.test('우리하나로 보냈습니다 08/24 16:35'),
    '★ 낱말 속 「하나」에 걸린다 — 남의 은행 문자까지 올라간다');
});
