/* 담당자 — 주담당 한 줄로 접기(㉠) + 담을 때 묻기(㉡)  (2026-08-26 대표 승인)
 *
 * 대표: 「기존 주담당 1인 이름만 나오게 하고, 추가·변경할 경우 확인만 하게 해달라」
 *
 * ⚠ 접는 것이지 «지우는» 것이 아니다. 그리고 몇 명이 숨었는지 «수»를 밝혀야 한다 —
 *   말해 주지 않으면 사람이 사라진 줄 안다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

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

/* ─────────── ㉠ 접기 ─────────── */
test('★ 평소엔 접혀 있다', () => {
  assert.ok(/var cfd = useState\(true\); var ctFold = cfd\[0\]/.test(B),
    '펼친 채로 시작하면 대표가 말한 「1인만」이 안 된다');
});

test('★★ 아직 아무도 없으면 «접지 않는다» — 접으면 적을 자리가 안 보인다', () => {
  const fn = bare(cutBlock(SRC, 'function ctIsFolded(){'));
  assert.ok(/ctFold && ctRealList\(\)\.length >= 1/.test(fn),
    '담당자가 없어도 접고 있다');
});

test('★ 빈 줄은 «사람 수»에 안 센다', () => {
  const fn = bare(cutBlock(SRC, 'function ctRealList(){'));
  assert.ok(fn.indexOf('!erpIsBlankContact(c)') >= 0, '빈 줄을 사람으로 세면 수가 어긋난다');
});

test('★ 접힘 줄은 «주담당»을 보여 준다 (없으면 첫 사람)', () => {
  const fn = bare(cutBlock(SRC, 'function ctPrimary(){'));
  assert.ok(/\.isPrimary && !erpIsBlankContact\(/.test(fn), '주담당을 안 찾는다');
  assert.ok((fn.match(/for\s*\(/g) || []).length >= 2, '주담당이 없을 때 첫 사람으로 물러서지 않는다');
});

test('★ 접힘 줄에 이름·직급·연락처·맡는 일이 보인다', () => {
  const i = B.indexOf('ctIsFolded() && (function(){');
  assert.ok(i >= 0, '접힘 줄을 못 찾았다');
  const g = B.slice(i, i + 2200);
  assert.ok(g.indexOf('p.name') >= 0, '이름이 없다');
  assert.ok(g.indexOf('contactRole(p)') >= 0, '직급이 없다');
  assert.ok(g.indexOf('p.phone || p.bizPhone') >= 0, '연락처가 없다');
  /* ⚠ 2026-08-26 다시 겨눔 — 읽기만 하던 표가 «고르는 칸»이 되었다(안 ㄱ).
     「글자가 있다」로 겨누면 앞에 false 를 붙여 꺼도 통과하니, 부르는 꼴 그대로 본다. */
  assert.ok(g.indexOf('ctDutySelect(ctPrimaryIdx(), p.duty, true)') >= 0,
    '맡는 일이 접힌 줄에 없다');
  assert.ok(g.indexOf('setCtFold(false)') >= 0, '펼칠 길이 없다');
});

test('★★ 접혀 있으면 «몇 명이 더 있는지» 수를 밝힌다', () => {
  assert.ok(B.indexOf("'▾ 다른 담당자 ' + (ctRealList().length - 1) + '명 더 보기'") >= 0,
    '수를 안 밝히면 사람이 사라진 줄 안다');
  assert.ok(B.indexOf("'▴ 접기 — 주담당만 보기'") >= 0, '다시 접을 길이 없다');
});

test('★★ 접는 것이지 «지우는» 것이 아니다 — 목록은 그대로 있다', () => {
  assert.ok(B.indexOf('!ctIsFolded() && (f.company.contacts || []).map(function(ct, idx){') >= 0,
    '펼쳤을 때 원래 칸들이 그대로 나와야 한다');
  const i = B.indexOf('ctIsFolded() && (function(){');
  const g = B.slice(i, i + 2200);
  assert.ok(g.indexOf('removeContact(') < 0 && g.indexOf('contacts: []') < 0,
    '접힘 줄이 담당자를 건드리고 있다');
});

test('접힘 줄에도 담당자가 하나뿐이면 「펼쳐서 고치기」로 말한다', () => {
  assert.ok(B.indexOf("'▾ 펼쳐서 고치기'") >= 0, '한 명일 때 「0명 더 보기」라고 하면 안 된다');
});

/* ─────────── ㉡ 담을 때 묻기 ─────────── */
test('★ 이미 담당자가 있으면 «묻는다»', () => {
  const fn = bare(cutBlock(SRC, 'async function addContactsFromPucards(list){'));
  assert.ok(/if\(have\.length\)\{/.test(fn), '있는지 안 보고 그냥 붙인다');
  assert.ok(fn.indexOf('await popConfirm(') >= 0, '묻지 않는다');
});

test('★ 길이 셋이다 — 더하기 / 바꾸기 / 그만두기', () => {
  const fn = cutBlock(SRC, 'async function addContactsFromPucards(list){');
  assert.ok(fn.indexOf("okText:'더하기'") >= 0, '더하기가 없다');
  assert.ok(fn.indexOf("thirdText:'바꾸기'") >= 0, '바꾸기가 없다');
  assert.ok(fn.indexOf("cancelText:'그만두기'") >= 0, '그만두기가 없다');
});

test('★★ 「바꾸기」는 되돌릴 수 없다 — 지워질 사람 «이름»을 먼저 밝힌다', () => {
  const fn = cutBlock(SRC, 'async function addContactsFromPucards(list){');
  assert.ok(fn.indexOf('지워질 사람') >= 0, '누가 지워지는지 안 알려 준다');
  assert.ok(/var names = have\.map\(function\(c\)\{ return c\.name/.test(fn), '이름을 안 모은다');
});

test('★ 그만두기를 고르면 아무 일도 안 한다', () => {
  const fn = bare(cutBlock(SRC, 'async function addContactsFromPucards(list){'));
  assert.ok(/if\(ans === false\) return;/.test(fn), '그만둬도 담고 있다');
});

test('★★ 「바꾸기」만 빈 자리에서 시작한다 (더하기가 지우면 안 된다)', () => {
  const fn = bare(cutBlock(SRC, 'async function addContactsFromPucards(list){'));
  assert.ok(/var cs = \(mode === 'replace'\) \? \[\] : \(prev\.company\.contacts \|\| \[\]\)\.slice\(\)/.test(fn),
    '더하기인데도 있는 사람을 지우거나, 바꾸기인데 안 지운다');
  assert.ok(/mode = \(ans === 'third'\) \? 'replace' : 'add'/.test(fn), '세 번째 손을 안 가린다');
});

test('★ 담고 나면 펼쳐 보여 준다', () => {
  const fn = bare(cutBlock(SRC, 'async function addContactsFromPucards(list){'));
  assert.ok(fn.indexOf('setCtFold(false)') >= 0, '담아 놓고 접힌 채면 뭐가 들어왔는지 모른다');
});

test('★★ 접기 신호를 «상태 갱신 안»에서 부르지 않는다 (갱신은 두 번 불릴 수 있다)', () => {
  const fn = cutBlock(SRC, 'async function addContactsFromPucards(list){');
  const setF = fn.indexOf('setF(function(prev){');
  const fold = fn.indexOf('setCtFold(false)');
  const end = fn.lastIndexOf('});');
  assert.ok(setF >= 0 && fold >= 0, '자리를 못 찾았다');
  assert.ok(fold > end, '상태 갱신 안쪽에서 부르고 있다');
});

/* ─────────── 물음창 세 번째 손 ─────────── */
test('★ 물음창이 세 번째 손을 낼 수 있다', () => {
  const fn = bare(cutBlock(SRC, 'window.popConfirm = function(msg, onYes, opts){'));
  assert.ok(fn.indexOf('opts.thirdText') >= 0, '세 번째 손이 없다');
  assert.ok(/if\(third\) third\.onclick = function\(\)\{ close\('third'\); \}/.test(fn), '눌러도 아무 일이 없다');
  assert.ok(/_resolver\(typeof result === 'string' \? result : !!result\)/.test(fn),
    '세 번째 손을 골라도 true·false 로 뭉개진다');
});

test('★★ 세 번째 손을 안 준 곳은 «그대로»다 (다른 물음창을 깨면 안 된다)', () => {
  const fn = bare(cutBlock(SRC, 'window.popConfirm = function(msg, onYes, opts){'));
  assert.ok(/var third = null;/.test(fn), '기본이 없음이어야 한다');
  assert.ok(fn.indexOf('if(opts.thirdText){') >= 0, 'thirdText 를 준 곳에만 만들어야 한다');
  assert.ok(fn.indexOf('opts.thirdText = ') < 0, '부르는 쪽이 안 준 값을 스스로 채우고 있다');
  /* ⚠ 2026-08-26 다시 겨눔 — 갈래를 넷 이상 낼 수 있게 되면서(choices) 이 줄의 «모양»이 바뀌었다.
     지켜야 할 규칙은 「아무것도 안 준 곳에는 취소·확인 둘만 나온다」이지 줄의 생김새가 아니다. */
  assert.ok(/btns\.appendChild\(cancel\);/.test(fn), '취소가 늘 있어야 한다');
  assert.ok(/if\(third\) btns\.appendChild\(third\);/.test(fn), '세 번째 손을 준 곳에만 붙여야 한다');
  assert.ok(/btns\.appendChild\(ok\);/.test(fn), '확인이 사라졌다');
});
