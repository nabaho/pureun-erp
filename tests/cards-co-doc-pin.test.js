/* 기업 상세 3단계 — 끌어다 놓기 + 짝 기억 (대표 지시 2026-08-26)

   ★ 근거가 «셋»이고 차례가 있다. 앞엣것이 이기고, 무엇으로 붙었는지 딱지에 적는다.
     ① 지정 — 사람이 끌어다 놓았다 (가장 확실)
     ② 기억 — 같은 이름을 전에 이 회사에서 그 사업에 붙였다
     ③ 이름 — 서류 제목에 사업 이름이 들어 있다 (2단계)
   ★ 3단계부터 서버에 «쓴다» — 기억해야 하기 때문이다. 쓰는 자리는 둘뿐이고
     둘 다 coInfo 안이다(docPin · docRule). 명함·등록증은 건드리지 않는다.
   ⚠ 기억은 틀릴 수 있다(이듬해 다른 컨설팅의 자문계약서). 그래서 「기억」이라 적고
     한 번에 뗄 수 있게 둔다 — 조용히 붙이면 그 잘못을 아무도 못 찾는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
function load() {
  const ctx = { console, Object, Array, String, Number, Set };
  vm.createContext(ctx);
  const code = slice('const CASE_TOK_STOP = new Set([', '/* 사업 한 줄 아래에 붙은 서류들')
    .replace(/^const /, 'var ').replace(/\nconst /g, '\nvar ');
  new vm.Script(code).runInContext(ctx);
  return ctx;
}

const CASES = [
  { kind: 'consulting', name: '일터혁신 상생컨설팅', no: 'C-1', year: '2026' },
  { kind: 'other', name: '통합기술보호지원단', no: 'O-7', year: '2026' },
  { kind: 'case', name: '부당해고 구제신청', no: '', year: '2025' },
];
const doc = (k, name) => ({ _k: k, name: name });

/* ── 사업 열쇠 ── */

test('번호가 있으면 번호로 열쇠를 짓는다', () => {
  const { caseKeyOf } = load();
  assert.strictEqual(caseKeyOf(CASES[0]), 'consulting~C-1');
});

test('번호가 없으면 갈래+이름+해로 짓는다', () => {
  const { caseKeyOf } = load();
  assert.strictEqual(caseKeyOf(CASES[2]), 'case~부당해고구제신청~2025');
});

test('★ 실시간DB 가 못 쓰는 글자를 뺀다 — 안 빼면 그 자리에서 쓰기가 막힌다', () => {
  const { caseKeyOf } = load();
  const k = caseKeyOf({ kind: 'consulting', name: 'A.B#C$D[E]F/G', no: '' });
  assert.ok(!/[.#$/[\]]/.test(k), '금지 글자가 남았다: ' + k);
});

test('없는 기록에 안 넘어진다', () => {
  const { caseKeyOf } = load();
  assert.strictEqual(caseKeyOf(null), '');
  assert.strictEqual(typeof caseKeyOf({}), 'string');
});

test('★ 이 함수는 «홀로» 돌아간다 — 바깥 함수에 매이지 않았다', () => {
  /* ⚠ 주석을 먼저 뗀다 — 「_canon 을 부르지 않는다」는 설명이 주석에 그대로 있어,
       그냥 세면 «설명»을 «부르는 것»으로 읽는다(이 저장소에서 반복되는 함정). */
  const body = slice('function caseKeyOf(row){', 'function docNameKey(name){')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/_canon|_norm\(/.test(body),
    '바깥 함수를 부르면 시험할 때마다 그것까지 실어야 하고, 한쪽만 고쳐진다');
});

/* ── 이름 열쇠 (기억) ── */

test('띄어쓰기·괄호를 지워 같은 이름으로 본다', () => {
  const { docNameKey } = load();
  assert.strictEqual(docNameKey('자문 계약서'), docNameKey('자문계약서'));
  assert.strictEqual(docNameKey('자문계약서(갱신)'), '자문계약서갱신');
});

test('실시간DB 금지 글자를 뺀다', () => {
  const { docNameKey } = load();
  assert.ok(!/[.#$/[\]]/.test(docNameKey('A.B#C$D/E[F]')));
});

/* ── 근거 차례 ── */

test('★ 지정이 이름 대조를 이긴다 — 사람이 고른 것이 가장 세다', () => {
  const { docCasePlan, caseKeyOf } = load();
  /* 이름으로는 0번에 붙을 서류를 사람이 1번에 놓았다 */
  const pins = {}; pins['d1'] = caseKeyOf(CASES[1]);
  const p = docCasePlan([doc('d1', '일터혁신 참여신청서')], CASES, pins, {});
  assert.strictEqual((p.byCase[1] || []).length, 1, '사람이 고른 자리에 가야 한다');
  assert.strictEqual(p.byCase[1][0].why, '지정');
  assert.ok(!p.byCase[0], '이름 대조가 이기면 안 된다');
});

test('★ 기억이 이름 대조를 이긴다', () => {
  const { docCasePlan, caseKeyOf, docNameKey } = load();
  const rules = {}; rules[docNameKey('일터혁신 참여신청서')] = caseKeyOf(CASES[1]);
  const p = docCasePlan([doc('d1', '일터혁신 참여신청서')], CASES, {}, rules);
  assert.strictEqual(p.byCase[1][0].why, '기억');
});

test('★ 지정이 기억을 이긴다', () => {
  const { docCasePlan, caseKeyOf, docNameKey } = load();
  const pins = {}; pins['d1'] = caseKeyOf(CASES[2]);
  const rules = {}; rules[docNameKey('자문계약서')] = caseKeyOf(CASES[1]);
  const p = docCasePlan([doc('d1', '자문계약서')], CASES, pins, rules);
  assert.strictEqual(p.byCase[2][0].why, '지정');
});

test('★ 기억으로 «사업 이름이 없는» 계약서도 붙는다 — 3단계가 푸는 그 문제다', () => {
  const { docCasePlan, caseKeyOf, docNameKey } = load();
  /* 2단계에서는 「자문계약서」가 안 붙었다 */
  assert.strictEqual(docCasePlan([doc('d1', '자문계약서')], CASES, {}, {}).left.length, 1);
  /* 한 번 붙여 두면 그 뒤로는 저절로 */
  const rules = {}; rules[docNameKey('자문계약서')] = caseKeyOf(CASES[0]);
  const p = docCasePlan([doc('d2', '자문 계약서')], CASES, {}, rules);
  assert.strictEqual(p.byCase[0][0].why, '기억', '띄어쓰기가 달라도 같은 이름으로 본다');
});

test('이름 대조는 그대로 셋째 차례로 남는다', () => {
  const { docCasePlan } = load();
  const p = docCasePlan([doc('d1', '통합기술보호지원단 신청기업 정보')], CASES, {}, {});
  assert.strictEqual(p.byCase[1][0].why, '이름');
  assert.strictEqual(p.byCase[1][0].word, '통합기술보호지원단');
});

/* ── 없는 사업을 가리키면 ── */

test('★ 지정·기억이 «없는 사업»을 가리키면 무시한다 — 서류를 조용히 잃지 않는다', () => {
  const { docCasePlan } = load();
  const pins = { d1: 'consulting~지워진사업' };
  const rules = { 자문계약서: 'other~없는것' };
  const p = docCasePlan([doc('d1', '자문계약서')], CASES, pins, rules);
  assert.strictEqual(Object.keys(p.byCase).length, 0, '없는 사업에 붙이면 안 된다');
  assert.strictEqual(p.left.length, 1, '「안 붙은 서류」로 남아야 한다');
});

test('지정·기억을 안 넘겨도 2단계처럼 돈다 — 옛 부름꼴을 깨지 않는다', () => {
  const { docCasePlan } = load();
  const p = docCasePlan([doc('d1', '일터혁신 참여신청서')], CASES);
  assert.strictEqual(p.byCase[0][0].why, '이름');
});

/* ── 쓸 자리 ── */

test('★ 붙일 때 «두 자리»를 한 번에 쓴다 — 이 서류 하나와 같은 이름의 다음 것들', () => {
  const { docAttachPlan } = load();
  const u = docAttachPlan('3128149225', 'd1', '자문계약서', 'consulting~C-1');
  assert.strictEqual(u['coInfo/3128149225/docPin/d1'], 'consulting~C-1');
  assert.strictEqual(u['coInfo/3128149225/docRule/자문계약서'], 'consulting~C-1');
  assert.strictEqual(Object.keys(u).length, 2, '두 자리뿐이어야 한다');
});

test('★ 명함·등록증(items)은 건드리지 않는다', () => {
  const { docAttachPlan, docDetachPlan } = load();
  const u = docAttachPlan('co', 'd1', '자문계약서', 'c~1');
  const v = docDetachPlan('co', 'd1', '자문계약서');
  [u, v].forEach(x => Object.keys(x).forEach(k => {
    assert.ok(k.indexOf('items/') < 0, '명함을 건드리면 안 된다: ' + k);
    assert.ok(k.indexOf('coInfo/') === 0, 'coInfo 밖에 쓰면 안 된다: ' + k);
  }));
});

test('★ 뗄 때 지정과 기억을 «둘 다» 지운다 — 하나만 지우면 다시 붙는다', () => {
  const { docDetachPlan } = load();
  const u = docDetachPlan('co', 'd1', '자문계약서');
  assert.strictEqual(u['coInfo/co/docPin/d1'], null);
  assert.strictEqual(u['coInfo/co/docRule/자문계약서'], null);
});

test('열쇠가 모자라면 아무것도 쓰지 않는다', () => {
  const { docAttachPlan, docDetachPlan } = load();
  assert.strictEqual(docAttachPlan('', 'd', 'n', 'c'), null);
  assert.strictEqual(docAttachPlan('co', '', 'n', 'c'), null);
  assert.strictEqual(docAttachPlan('co', 'd', 'n', ''), null);
  assert.strictEqual(docDetachPlan('', 'd', 'n'), null);
});

test('이름이 비면 «기억»은 남기지 않는다 — 빈 열쇠는 실시간DB 가 거절한다', () => {
  const { docAttachPlan } = load();
  const u = docAttachPlan('co', 'd1', '', 'c~1');
  assert.strictEqual(Object.keys(u).length, 1);
  assert.strictEqual(u['coInfo/co/docPin/d1'], 'c~1');
});

/* ── 화면 ── */

test('★ 서류의 «열쇠»를 실어 보낸다 — 없으면 어느 서류인지 못 짚는다', () => {
  const body = slice('const docMap = (o.extra && o.extra.docs) || {};', 'const plan = docCasePlan');
  assert.match(body, /Object\.keys\(docMap\)/, 'Object.values 만 쓰면 열쇠를 잃는다');
  assert.match(body, /_k:k/, '열쇠를 실어야 한다');
});

test('지정·기억을 넘겨 준다', () => {
  const body = slice('const plan = docCasePlan(docsAll, all,', 'coLeftDocsPaint');
  assert.match(body, /o\.extra && o\.extra\.docPin/);
  assert.match(body, /o\.extra && o\.extra\.docRule/);
});

test('★ 사업 줄이 «받는 자리»가 된다', () => {
  const body = slice('function coHistPaint(){', 'box.innerHTML = `<div class="pdsec"');
  assert.match(body, /ondrop="coDocDrop\(event,'\$\{esc\(caseKeyOf\(r\)\)\}'\)"/);
  assert.match(body, /ondragover="coDocDragOver\(event\)"/);
});

test('안 붙은 서류를 끌 수 있다', () => {
  const body = slice('function coDocsListHtml(docs, title, hint){', '/* 사진첩에서 그 서류를 연다.');
  assert.match(body, /draggable="\$\{d\._k\?'true':'false'\}"/, '열쇠 없는 옛 기록은 못 끈다');
  assert.match(body, /ondragstart="coDocDragStart\(event,'\$\{esc\(d\._k\|\|''\)\}'\)"/);
});

test('끌어다 놓으라고 «적어» 둔다 — 안 적으면 아무도 안 해 본다', () => {
  assert.match(HTML, /위의 사업 위로 «끌어다 놓으면» 붙고, 같은 이름은 다음부터 저절로 붙습니다/);
});

test('★ 지정·기억으로 붙은 것만 뗄 수 있다 — 이름 대조는 규칙이라 뗄 것이 없다', () => {
  const body = slice('function coCaseDocsHtml(hits){', '/* ══════ 3단계 — 끌어다 놓기');
  assert.match(body, /why === '지정' \|\| why === '기억'/);
  assert.match(body, /coDocDetach\(/);
});

test('근거마다 사람 말로 까닭을 적는다', () => {
  const body = slice('const CO_WHY_TIP = {', 'function coCaseDocsHtml(hits){');
  ['지정', '기억', '이름'].forEach(w => {
    assert.ok(body.indexOf("'" + w + "'") >= 0, w + ' 의 까닭이 없다');
  });
  assert.match(body, /틀렸으면 ✕ 로 떼세요/, '기억이 틀릴 수 있다고 말해야 한다');
});

/* ── 쓰는 길의 안전장치 ── */

test('★ 보던 회사가 바뀌면 붙이지 않는다 — 남의 회사에 붙으면 되돌리기 어렵다', () => {
  const body = slice('async function coDocDrop(e, caseKey){', '/* ✕ — 이 사업에서 뗀다.');
  assert.match(body, /if\(g\.coKey !== o\.key\) return toast/);
});

test('한 번의 update 로 쓴다', () => {
  const body = slice('async function coDocDrop(e, caseKey){', '/* ✕ — 이 사업에서 뗀다.');
  assert.strictEqual(body.split('.update(').length - 1, 1, '두 번 나눠 쓰면 하나만 남는다');
});

test('화면을 억지로 고치지 않는다 — 구독이 새 값을 준다', () => {
  const body = slice('async function coDocDrop(e, caseKey){', '/* ✕ — 이 사업에서 뗀다.');
  assert.ok(!/coHistPaint\(\)|renderCoAny\(\)/.test(body),
    '두 곳에서 고치면 어긋난다 — coInfo 구독이 다시 그린다');
});

test('클라우드가 아니면 조용히 넘기지 않고 말해 준다', () => {
  const drop = slice('async function coDocDrop(e, caseKey){', '/* ✕ — 이 사업에서 뗀다.');
  const off = slice('async function coDocDetach(docKey){', 'function coHistPaint(){');
  [drop, off].forEach(b => assert.match(b, /Store\.mode!=='firebase'/));
});

test('쓰다 실패하면 말해 준다 — 조용히 안 붙으면 고장으로 읽힌다', () => {
  const drop = slice('async function coDocDrop(e, caseKey){', '/* ✕ — 이 사업에서 뗀다.');
  assert.match(drop, /catch\(err\)\{ toast\('❌/);
});

test('남의 끌기(폴더·명함)에 반응하지 않는다', () => {
  const body = slice('function coDocDragOver(e){', 'function coDocDragLeave(e){');
  assert.match(body, /if\(!_coDocDrag\) return;/,
    '같은 줄이 여러 끌기를 받는다 — 내 것일 때만 받아야 한다');
});
