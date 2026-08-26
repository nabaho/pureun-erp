/* 담당자를 «담을 때» 맡는 일까지 정한다 (2026-08-26 대표 승인, 안 ㄴ)
 *
 * 대표: 「사업장에서 자문을 담당하는 사람과 특별한 업무를 담당하는 사람이 다를 수 있다 —
 *       각각 선택하게 해야 한다」
 *
 * ⚠ 핵심 함정: contact.role 은 이미 «직책»(부장·과장)이다.
 *   맡는 일을 거기 담으면 언젠가 하나가 다른 하나를 지운다 — 그래서 duty 로 따로 둔다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
const B = bare(SRC);
const MODAL = bare(cutBlock(SRC, 'function PucardsContactMultiPickerModal(props){'));
const ADD = bare(cutBlock(SRC, 'function addContactsFromPucards(list){'));

/* ── 미리 켜 두는 규칙을 «돌려» 본다 ── */
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(cutBlock(SRC, 'function pcDutyFromKinds(kinds){'), ctx);
const D = ctx.pcDutyFromKinds;

test('★ 계약 종류가 «하나»면 그 일을 미리 켜 둔다', () => {
  assert.strictEqual(D(['company']), '자문');
  assert.strictEqual(D(['case']), '사건');
  assert.strictEqual(D(['consulting']), '컨설팅');
  assert.strictEqual(D(['fund']), '기금');
});

test('★★ 종류가 «여럿»이면 찍어서 켜지 않는다 — 조용히 틀리는 것이 가장 나쁘다', () => {
  assert.strictEqual(D(['company', 'case']), '');
  assert.strictEqual(D(['company', 'case', 'fund']), '');
});

test('종류가 없거나 모르는 것이면 비워 둔다', () => {
  assert.strictEqual(D([]), '');
  assert.strictEqual(D(null), '');
  assert.strictEqual(D(['알수없는것']), '');
  assert.strictEqual(D(['알수없는것', 'case']), '사건', '모르는 것은 세지 않는다');
});

/* ── 고르는 창 ── */
test('★ 사람마다 「맡는 일」을 고르는 칸이 있다', () => {
  /* ⚠ 「그 글자가 있다」로 겨누면 앞에 false && 를 붙여 꺼 버려도 통과한다.
     그리는 «조건»까지 함께 본다. */
  assert.ok(/!already && h\('select', \{ value:dutyOf\(r\.id\)/.test(MODAL),
    '고르는 칸이 없거나 꺼져 있다');
  assert.ok(MODAL.indexOf('PC_DUTIES.map(') >= 0, '고를 낱말을 안 깐다');
});

test('★ 체크 «안» 한 사람은 맡는 일을 못 고른다', () => {
  assert.ok(/disabled:!on/.test(MODAL), '안 담을 사람에게 일을 정해 봐야 뜻이 없다');
});

test('★★ 줄이 label 이 아니다 — label 안이면 고르려다 체크가 토글된다', () => {
  assert.ok(MODAL.indexOf("return h('label', { key:r.id") < 0, '아직 label 로 감싸고 있다');
  assert.ok(MODAL.indexOf("return h('div', { key:r.id") >= 0, '줄을 못 찾았다');
});

test('★ 대신 이름 칸을 눌러 체크한다 (체크할 길이 사라지면 안 된다)', () => {
  assert.ok(/onClick:function\(\)\{ if\(!already\) toggle\(r\.id\); \}/.test(MODAL),
    '이름 칸을 눌러도 안 담긴다');
  assert.ok(MODAL.indexOf("h('input', { type:'checkbox'") >= 0, '체크칸 자체가 사라졌다');
});

test('★ 담을 때 맡는 일을 «붙여» 넘긴다', () => {
  assert.ok(/__duty: dutyOf\(r\.id\)/.test(MODAL), '고른 일을 안 넘긴다 — 정해도 사라진다');
});

test('고르는 창이 무엇을 하는 곳인지 말해 준다', () => {
  assert.ok(SRC.indexOf('오른쪽에서 «맡는 일»을 정하세요') >= 0, '안내가 없다');
});

/* ── 담기 ── */
test('★★ 맡는 일은 «직책»과 다른 칸에 담는다', () => {
  assert.ok(/pcc\.duty = p\.__duty/.test(ADD), '맡는 일을 안 담는다');
  assert.ok(!/pcc\.role = p\.__duty/.test(ADD), '직책 칸을 덮어쓰고 있다 — 부장·과장이 지워진다');
});

test('직책은 여전히 role 에 들어간다 (두 칸이 섞이지 않았다)', () => {
  const fn = bare(cutBlock(SRC, 'function pcToContact(x, primary, pcId){'));
  assert.ok(/position:title, role:title/.test(fn), '직책 담는 자리가 바뀌었다');
  assert.ok(fn.indexOf('duty') < 0, '기본 담당자 만들 때 맡는 일을 찍어 넣고 있다');
});

/* ── 화면 ── */
test('★★ 담은 뒤 맡는 일이 «보인다» — 안 보이면 아무도 모르는 값이 된다', () => {
  assert.ok(B.indexOf("'🏷 ' + ct.duty") >= 0, '담당자 줄에 안 보여 준다');
});

test('맡는 일이 없으면 아무것도 안 붙인다 (빈 표가 줄줄이 생기지 않게)', () => {
  assert.ok(/ct\.duty \? h\('span'/.test(B), '없을 때도 붙이고 있다');
});

test('★ 창을 열 때 계약 종류를 넘겨 준다', () => {
  const i = B.indexOf('pcMultiOpen && h(PucardsContactMultiPickerModal, {');
  assert.ok(i >= 0, '창 부르는 자리를 못 찾았다');
  const near = B.slice(i, i + 500);
  assert.ok(near.indexOf('defaultDuty:') >= 0, '미리 켜 둘 값을 안 넘긴다');
  assert.ok(near.indexOf('pcDutyFromKinds(f.kinds)') >= 0, '계약 종류를 안 본다');
});

test('맡는 일 낱말은 한 곳에서만 정한다', () => {
  assert.strictEqual(B.split('var PC_DUTIES =').length - 1, 1, '낱말 목록이 둘로 갈렸다');
  ['자문', '사건', '컨설팅', '급여', '기금'].forEach((d) => {
    assert.ok(B.indexOf("var PC_DUTIES = ['자문','사건','컨설팅','급여','기금','상담','기타']") >= 0,
      d + ' 가 낱말 목록에서 빠졌다');
  });
});
