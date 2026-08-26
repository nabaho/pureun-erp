/* 업체 「예전 이름」 — 담고 찾는 층 (2026-08-26 대표 승인: 「예전 이름 기억」, 쓰는 곳 1~4 전부)
 *
 * 사업장 이름이 바뀌면 예전 이름으로 들어온 입금·계약이 짝을 못 찾는다.
 * ⚠ 잘못 기억하면 «매달 조용히» 틀린다 — 그래서 막는 규칙 셋이 이 검사의 핵심이다.
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
function cutRange(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, '못 찾음: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b >= 0, '못 찾음: ' + to);
  return src.slice(a, b + to.length);
}

const ctx = { console, String, Object, Array, window: {} };
vm.createContext(ctx);
vm.runInContext(cutRange(SRC, 'var PC_CORP_TOKENS =', '\n'), ctx);
vm.runInContext(cutBlock(SRC, 'function pcNormCo('), ctx);
['function erpPrevList(co){', 'function erpCoKey(s){', 'function erpPrevIndex(companies){',
 'function erpFindCoByAnyName(name, companies){', 'function erpPrevNameConflict(companies, coId, cand){']
  .forEach((h) => vm.runInContext(cutBlock(SRC, h), ctx));
const { erpPrevList: prevs, erpCoKey: key, erpPrevIndex: pidx,
        erpFindCoByAnyName: find, erpPrevNameConflict: bad } = ctx;

const CO = (id, name, prevNames, extra) =>
  Object.assign({ id: id, name: name, prevNames: prevNames || [] }, extra || {});

test('★ 예전 이름 목록을 다듬는다 (빈칸·겹침·공백)', () => {
  const co = CO('c1', '천안청화공사', ['  ◯◯산업 ', '', '◯◯산업', '천안청화', null]);
  assert.deepStrictEqual(Array.from(prevs(co)), ['◯◯산업', '천안청화']);
  assert.deepStrictEqual(Array.from(prevs({})), []);
  assert.deepStrictEqual(Array.from(prevs(null)), []);
  assert.deepStrictEqual(Array.from(prevs({ prevNames: '문자열' })), [], '배열이 아니면 무시한다');
});

test('★ 이름 비교는 계약창 묶기와 «같은» 규칙을 쓴다 (법인 표기·기호를 뗀다)', () => {
  assert.strictEqual(key('(주)천안청화공사'), key('천안청화공사'));
  assert.strictEqual(key('합자회사 천안청화공사'), key('(자)천안청화공사'));
  assert.notStrictEqual(key('가나상사'), key('나가상사'));
});

test('★★ 예전 이름으로 업체를 찾고, «무엇을 보고 찾았는지» 알려 준다', () => {
  const list = [CO('c1', '천안청화공사', ['◯◯산업']), CO('c2', '가나상사')];
  const a = find('천안청화공사', list);
  assert.strictEqual(a.co.id, 'c1'); assert.strictEqual(a.via, 'name');
  const b = find('◯◯산업', list);
  assert.strictEqual(b.co.id, 'c1', '예전 이름으로 못 찾는다');
  assert.strictEqual(b.via, 'prev', '무엇을 보고 찾았는지 안 알려 준다 — 말없이 붙으면 안 된다');
  assert.strictEqual(b.matched, '◯◯산업');
  assert.strictEqual(find('없는회사', list), null);
  assert.strictEqual(find('', list), null);
});

test('★★ «현재» 이름이 예전 이름보다 먼저다', () => {
  /* 어떤 업체의 예전 이름이 다른 업체의 현재 이름과 같아지는 일은 막지만(아래),
     이미 그렇게 들어 있는 옛 자료가 있을 수 있다 — 그때도 «현재» 이름이 이긴다. */
  const list = [CO('c1', '나중회사', ['가나상사']), CO('c2', '가나상사')];
  const r = find('가나상사', list);
  assert.strictEqual(r.co.id, 'c2', '예전 이름이 현재 이름을 이겼다');
  assert.strictEqual(r.via, 'name');
});

test('예전 이름 색인 — 같은 예전 이름이 둘이면 먼저 나온 쪽', () => {
  const list = [CO('c1', 'A회사', ['옛이름']), CO('c2', 'B회사', ['옛이름'])];
  assert.strictEqual(pidx(list)[key('옛이름')].id, 'c1');
  assert.strictEqual(Object.keys(pidx([])).length, 0);
});

test('지워진 업체는 예전 이름으로도 안 찾는다', () => {
  const list = [CO('c1', '없앤회사', ['옛이름'], { _deleted: true })];
  assert.strictEqual(find('옛이름', list), null);
  assert.strictEqual(Object.keys(pidx(list)).length, 0);
});

/* ── 막는 규칙 셋 — 이 검사가 이 파일의 핵심이다 ── */
test('★★ ① 다른 업체의 «현재» 이름은 예전 이름이 될 수 없다 (두 회사가 섞인다)', () => {
  const list = [CO('c1', '천안청화공사'), CO('c2', '가나상사')];
  const why = bad(list, 'c1', '가나상사');
  assert.ok(why, '막지 않는다 — 두 회사가 섞인다');
  assert.ok(why.indexOf('가나상사') >= 0 && why.indexOf('현재') >= 0, '까닭에 어느 회사인지 없다: ' + why);
});

test('★★ ② 같은 예전 이름을 두 업체가 가질 수 없다 (어느 쪽인지 알 수 없어진다)', () => {
  const list = [CO('c1', '천안청화공사', ['◯◯산업']), CO('c2', '가나상사')];
  const why = bad(list, 'c2', '◯◯산업');
  assert.ok(why, '막지 않는다');
  assert.ok(why.indexOf('천안청화공사') >= 0, '누가 이미 쓰는지 안 알려 준다: ' + why);
});

test('★★ ③ 자기 이름은 예전 이름이 아니다', () => {
  const list = [CO('c1', '천안청화공사')];
  assert.ok(bad(list, 'c1', '천안청화공사'), '자기 이름을 넣게 둔다');
  assert.ok(bad(list, 'c1', '(주)천안청화공사'), '법인 표기만 다른 자기 이름을 넣게 둔다');
});

test('★ 이미 넣어 둔 것을 또 넣으면 알려 준다', () => {
  const list = [CO('c1', '천안청화공사', ['◯◯산업'])];
  assert.ok(bad(list, 'c1', '◯◯산업'));
});

test('★ 넣어도 되는 이름은 «빈 문자열»을 돌려준다', () => {
  const list = [CO('c1', '천안청화공사'), CO('c2', '가나상사')];
  assert.strictEqual(bad(list, 'c1', '◯◯산업'), '');
});

test('빈 이름·이상한 값에도 죽지 않는다', () => {
  assert.ok(bad([], 'c1', ''), '빈 이름을 넣게 둔다');
  assert.ok(bad([], 'c1', '   '), '공백만 있는 이름을 넣게 둔다');
  /* 업체 목록이 없으면 «부딪힐 것»도 없다 — 빈 문자열(넣어도 된다)이 맞다.
     여기서 볼 것은 값이 아니라 «죽지 않는다»는 것이다. */
  assert.strictEqual(bad(null, 'c1', '뭔가'), '');
  assert.strictEqual(bad(undefined, undefined, '뭔가'), '');
});

/* ── 쓰는 곳 (대표 지시: 1~4 전부) ── */
test('★ ④ 업체관리 검색이 예전 이름으로도 찾는다', () => {
  const B = bare(SRC);
  assert.ok(/erpPrevList\(co\)\.some\(function\(p\)\{ return p\.toLowerCase\(\)\.indexOf\(qq\) >= 0; \}\)/.test(B),
    '업체관리 검색에서 예전 이름을 안 본다');
});

test('★ ③ 계약창 의뢰인 목록이 예전 이름으로도 나온다', () => {
  const fn = bare(cutBlock(SRC, 'function searchPastCompanies(q){'));
  assert.ok(/erpPrevList\(c\)\.some\(function\(p\)\{ return p\.toLowerCase\(\)\.indexOf\(q\) >= 0; \}\)/.test(fn),
    '계약창에서 예전 이름을 안 본다');
});

test('★★ 계약창 줄에는 «현재» 이름만 띄운다 (두 이름이 같이 있으면 한 회사가 두 줄이 된다)', () => {
  const fn = bare(cutBlock(SRC, 'function searchPastCompanies(q){'));
  assert.ok(/add\(c\.name, c\.bizNo/.test(fn), '줄에 현재 이름을 안 쓴다');
  assert.ok(!/add\(p,/.test(fn), '예전 이름을 따로 한 줄로 띄우고 있다');
});

test('★★ 이미 걸러 낸 줄을 «두 번» 걸러 내지 않는다', () => {
  /* 부르는 쪽이 예전 이름까지 보고 걸렀는데 add() 가 이름으로 다시 걸러 내면
     예전 이름으로 찾은 업체가 조용히 사라진다. */
  const fn = bare(cutBlock(SRC, 'function searchPastCompanies(q){'));
  assert.ok(/function add\(label, bizNo, date, source, sourceBg, sourceColor, preHit\)\{/.test(fn),
    'preHit 갈래가 없다');
  assert.ok(/if\(!preHit && label\.toLowerCase\(\)\.indexOf\(q\)<0/.test(fn), '다시 걸러 내고 있다');
  assert.ok(/'업체', '#bbf7d0', '#166534', true\)/.test(fn), '업체 갈래가 preHit 를 안 넘긴다');
});

test('★ 업체 편집에 「예전 이름」 칸이 있고, ✕로 지울 수 있다', () => {
  const B = bare(SRC);
  assert.ok(B.indexOf("h('label', null, '예전 이름')") >= 0, '넣는 칸이 없다');
  assert.ok(B.indexOf('prevNames: next') >= 0, '지울 길이 없다');
  assert.ok(/prevNames: erpPrevList\(prev\)\.concat\(\[v\]\)/.test(B), '넣는 길이 없다');
});

test('★★ 넣을 때 막는 규칙을 «화면에서도» 쓴다 (규칙이 두 곳으로 갈리면 안 된다)', () => {
  const B = bare(SRC);
  assert.ok(/var why = erpPrevNameConflict\(dbGet\('companies', \[\]\) \|\| \[\], f\.id, v\)/.test(B),
    '화면이 막는 규칙을 안 쓴다');
  assert.ok(/if\(why\)\{ showToast\('🚫 ' \+ why\); return; \}/.test(B), '막았는데 까닭을 안 알려 준다');
});
