/* 빈 담당자 줄이 「주담당자」를 쥔 채 남던 것 (2026-08-26 대표 지적)
 *
 * 증상: 「기업담당자 (5)」인데 #1 이 «빈칸»이고 거기 「✓ 주담당자」가 붙어 있으며
 *      진짜 사람(김상호)은 #2 로 밀려 있었다.
 * 까닭: 계약창이 처음부터 만들어 두는 «적을 자리»(빈 줄)를
 *      합치는 손이 «주담당을 쥔 사람»으로 세었다.
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

const ctx = { console, String, Object, Array, window: {} };
vm.createContext(ctx);
['function erpIsBlankContact(c){', 'function erpTidyContacts(list, forcePrimary){', 'function erpTidyContactsIn(rec){',
 'function contactRole(c){', 'function _normPersonKey(', 'function mergeCompanyContacts(existing, incoming){']
  .forEach((h) => vm.runInContext(cutBlock(SRC, h), ctx));
const { erpIsBlankContact: isBlank, erpTidyContacts: tidy, erpTidyContactsIn: tidyIn,
        mergeCompanyContacts: merge } = ctx;

const P = (n, extra) => Object.assign({ id: 'x' + n, name: n, phone: '010-0000-000' + n.length }, extra || {});
const BLANK = (extra) => Object.assign({ id: 'blank', name: '', role: '', phone: '', fax: '', email: '' }, extra || {});

test('★ 빈 줄을 알아본다', () => {
  assert.strictEqual(isBlank(BLANK()), true);
  assert.strictEqual(isBlank(BLANK({ isPrimary: true })), true, '주담당 표가 붙어도 빈 줄은 빈 줄이다');
  assert.strictEqual(isBlank(P('김상호')), false);
  assert.strictEqual(isBlank({ name: '', phone: '', bizPhone: '041-557-9704' }), false, '회사 전화만 있어도 사람이다');
  assert.strictEqual(isBlank({ name: '', phone: '', email: 'a@b.c' }), false, '메일만 있어도 사람이다');
});

test('★★ 「동일인」 줄은 비어 보여도 지우지 않는다 (뜻이 있는 줄이다)', () => {
  assert.strictEqual(isBlank({ name: '', phone: '', sameAsCeo: true }), false);
  const out = tidy([{ name: '', phone: '', sameAsCeo: true }, P('이동철')]);
  assert.strictEqual(out.length, 2, '동일인 줄이 사라졌다');
});

test('★★ 대표가 본 그 경우 — 빈 줄이 주담당을 쥐고 사람이 밀려 있다', () => {
  /* 계약을 «열 때»의 규칙으로 본다 (forcePrimary=true) — 저장된 계약이 이 꼴이었다. */
  const out = tidy([BLANK({ isPrimary: true }), P('김상호'), P('이동철')], true);
  assert.strictEqual(out.length, 2, '빈 줄이 안 걷혔다');
  assert.strictEqual(out[0].name, '김상호', '진짜 사람이 첫 줄로 와야 한다');
  assert.strictEqual(out[0].isPrimary, true, '주담당이 사람에게 안 넘어갔다');
});

test('★ 아무도 없으면 빈 줄을 «남긴다» — 적을 자리가 없으면 손으로 못 넣는다', () => {
  const out = tidy([BLANK({ isPrimary: true })]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].isPrimary, true);
  assert.deepStrictEqual(Array.from(tidy([])), []);
  assert.deepStrictEqual(Array.from(tidy(null)), []);
});

test('★★ 합칠 때는 주담당을 «마음대로 세우지» 않는다 (업체관리 규칙)', () => {
  /* 규칙이 부딪히는 자리다 — 업체관리는 「대표 표시를 마음대로 주지 않는다」이고,
     계약창은 「주담당이 한 사람 있어야 한다」이다. 세우는 것은 «열 때»만 한다. */
  const out = tidy([P('김상호'), P('이동철')]);
  assert.strictEqual(out.filter((c) => c.isPrimary).length, 0, '합치면서 아무나 주담당으로 세웠다');
  const out2 = tidy([P('김상호'), P('이동철')], true);
  assert.strictEqual(out2[0].isPrimary, true, '열 때는 첫 사람을 세워야 한다');
});

test('★ 주담당은 «한 사람»뿐이다', () => {
  const out = tidy([P('김상호', { isPrimary: true }), P('이동철', { isPrimary: true }), P('박정미')]);
  assert.strictEqual(out.filter((c) => c.isPrimary).length, 1, '주담당이 둘이 됐다');
  assert.strictEqual(out[0].isPrimary, true, '앞사람이 주담당이어야 한다');
});

test('이미 정해진 주담당을 빼앗지 않는다', () => {
  const out = tidy([P('김상호'), P('이동철', { isPrimary: true })]);
  assert.strictEqual(out[1].isPrimary, true, '이동철이 주담당이었는데 바뀌었다');
  assert.strictEqual(!!out[0].isPrimary, false);
});

test('★★ 합칠 때 — 빈 줄이 있어도 들여온 사람이 주담당을 받는다', () => {
  const r = merge([BLANK({ isPrimary: true })],
    [{ name: '김상호', phone: '010-1200-0007', role: '위원장' },
     { name: '이동철', phone: '041-557-9700', role: '관리부장' }]);
  assert.strictEqual(r.added, 2);
  assert.strictEqual(r.contacts.length, 2, '빈 줄이 남아 있다');
  assert.strictEqual(r.contacts[0].name, '김상호');
  assert.strictEqual(r.contacts[0].isPrimary, true, '아무도 주담당이 아니다 — 빈 줄이 쥐고 있었다');
});

test('★ 이미 사람이 주담당이면 들여온 사람이 빼앗지 않는다', () => {
  const r = merge([P('박정미', { isPrimary: true })], [{ name: '김상호', phone: '010-1200-0007' }]);
  assert.strictEqual(r.contacts[0].name, '박정미');
  assert.strictEqual(r.contacts[0].isPrimary, true, '있던 주담당을 빼앗았다');
  assert.strictEqual(!!r.contacts[1].isPrimary, false);
});

test('★ 아무도 안 들여왔으면 빈 줄을 건드리지 않는다', () => {
  const r = merge([BLANK({ isPrimary: true })], [{ name: '', phone: '' }]);
  assert.strictEqual(r.added, 0);
  assert.strictEqual(r.contacts.length, 1, '적을 자리가 사라졌다');
});

test('★★ 손으로 만든 빈 줄은, 아무도 안 들여왔으면 사라지지 않는다', () => {
  /* 「+ 담당자 추가」로 줄을 만들어 두고 이름을 아직 안 적었는데,
     그때 다른 일로 합치기가 돌아 그 줄이 사라지면 «적던 자리»를 잃는다. */
  const r = merge([P('김상호', { isPrimary: true }), BLANK()], []);
  assert.strictEqual(r.added, 0);
  assert.strictEqual(r.contacts.length, 2, '적으려고 만든 빈 줄이 사라졌다');
});

test('★ 합칠 때 「맡는 일」을 잃지 않는다', () => {
  const r = merge([], [{ name: '김상호', phone: '010-1200-0007', duty: '자문' }]);
  assert.strictEqual(r.contacts[0].duty, '자문', '맡는 일이 합치면서 사라진다');
});

test('★ 이미 저장된 계약도 열 때 정리된다', () => {
  const rec = { id: 'c1', company: { name: '천안청화공사', contacts: [BLANK({ isPrimary: true }), P('김상호')] } };
  const out = tidyIn(rec);
  assert.strictEqual(out.company.contacts.length, 1);
  assert.strictEqual(out.company.contacts[0].name, '김상호');
  assert.strictEqual(out.company.contacts[0].isPrimary, true,
    '주담당이 아무도 없다 — 빈 줄이 쥐고 있던 것을 사람에게 넘겨야 한다');
  assert.notStrictEqual(out, rec, '원본을 그대로 돌려주면 안 고쳐진다');
  assert.strictEqual(rec.company.contacts.length, 2, '원본을 건드렸다');
});

test('고칠 것이 없으면 원본을 그대로 돌려준다 (쓸데없이 다시 그리지 않게)', () => {
  const rec = { id: 'c1', company: { contacts: [P('김상호', { isPrimary: true })] } };
  assert.strictEqual(tidyIn(rec), rec);
  assert.strictEqual(tidyIn(null), null);
  assert.strictEqual(tidyIn({ id: 'x' }).id, 'x', '담당자 칸이 없어도 죽지 않는다');
});

test('★ 계약창이 열 때 그 정리를 «부른다»', () => {
  const B = bare(SRC);
  assert.ok(B.indexOf('var init = (props.cur ? erpTidyContactsIn(props.cur) : null) || {') >= 0,
    '열 때 정리를 안 부르면 이미 저장된 빈 줄이 그대로 보인다');
});

test('★ 합치는 손이 빈 줄을 «사람으로 세지» 않는다', () => {
  const fn = bare(cutBlock(SRC, 'function mergeCompanyContacts(existing, incoming){'));
  assert.ok(/hasPrimary = out\.some\(function\(c\)\{ return !!\(c && c\.isPrimary\) && !erpIsBlankContact\(c\); \}\)/.test(fn),
    '빈 줄을 주담당을 쥔 사람으로 세고 있다');
});
