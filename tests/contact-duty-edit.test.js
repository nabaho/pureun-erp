/* 「맡는 일」을 «줄에서 바로» 고친다 (2026-08-26 대표 승인, 안 ㄱ)
 *
 * 그전까지는 기업정보함에서 «담을 때»만 정할 수 있어,
 * 잘못 정하면 그 줄을 지우고 다시 담아야 했다.
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
const SEL = bare(cutBlock(SRC, 'function ctDutySelect(idx, val, small){'));

test('★ 「맡는 일」이 고르는 칸이 되었다', () => {
  assert.ok(SEL.indexOf("h('select'") >= 0, '아직 읽기만 하는 표다');
  assert.ok(/setContact\(idx, 'duty', e\.target\.value\)/.test(SEL), '고른 것을 그 줄에 안 넣는다');
});

test('★★ 직책(role)을 건드리지 않는다 — 부장·과장이 지워지면 안 된다', () => {
  assert.ok(SEL.indexOf("'role'") < 0 && SEL.indexOf('.role') < 0, '직책 칸을 건드리고 있다');
});

test('★ 낱말은 한 곳(PC_DUTIES)에서만 온다 — 창과 줄이 갈리면 안 된다', () => {
  assert.ok(SEL.indexOf('PC_DUTIES') >= 0, '낱말을 여기서 따로 적고 있다');
  assert.strictEqual(B.split('var PC_DUTIES =').length - 1, 1, '낱말 목록이 둘로 갈렸다');
});

test('★ 비울 수 있다 — 「그냥 담당자」도 있어야 한다', () => {
  assert.ok(/h\('option', \{ value:'' \}/.test(SEL), '비우는 선택지가 없다');
});

test('★★ 가리킬 줄이 없으면 아무것도 그리지 않는다', () => {
  /* idx 가 -1 인데 그리면 setContact(-1, …) 이 «없는 줄»을 만들어 자료를 망친다. */
  assert.ok(/if\(idx == null \|\| idx < 0\) return null;/.test(SEL), '없는 줄을 가리킨 채 그린다');
  const guard = SEL.indexOf('idx < 0');
  const draw = SEL.indexOf("h('select'");
  assert.ok(guard >= 0 && draw > guard, '막는 것이 그리기 «뒤»에 있으면 이미 늦다');
});

test('★ 정해진 것과 안 정한 것이 «눈에» 다르다', () => {
  assert.ok(/var on = !!val;/.test(SEL), '정했는지 안 가린다');
  assert.ok(SEL.indexOf("on ? '#f0fdf4'") >= 0, '정한 것이 눈에 안 띈다');
});

test('★ 펼친 칸에서 고칠 수 있다', () => {
  assert.ok(B.indexOf('ctDutySelect(idx, ct.duty),') >= 0, '펼친 칸에 고르는 칸이 없다');
  assert.strictEqual(B.indexOf("'🏷 ' + ct.duty"), -1, '읽기만 하던 옛 표가 남아 있다');
});

test('★★ 접힌 줄에서도 고칠 수 있다 — 대표가 늘 보는 줄이 여기다', () => {
  assert.ok(B.indexOf('ctDutySelect(ctPrimaryIdx(), p.duty, true)') >= 0, '접힌 줄에 고르는 칸이 없다');
  assert.strictEqual(B.indexOf("'🏷 ' + p.duty"), -1, '읽기만 하던 옛 표가 남아 있다');
});

test('★★ 접힌 줄의 고르는 칸을 눌러도 «펼쳐지지» 않는다', () => {
  const i = B.indexOf('ctDutySelect(ctPrimaryIdx(), p.duty, true)');
  assert.ok(i >= 0, '자리를 못 찾았다');
  const near = B.slice(Math.max(0, i - 200), i);
  assert.ok(near.indexOf('e.stopPropagation()') >= 0,
    '고르려고 누를 때마다 줄이 펼쳐지면 못 고른다');
});

test('★ 주담당이 «몇 번째» 줄인지 찾는 손이 있다', () => {
  const fn = bare(cutBlock(SRC, 'function ctPrimaryIdx(){'));
  assert.ok(/\.isPrimary && !erpIsBlankContact\(/.test(fn), '주담당을 안 찾는다');
  assert.ok(/return -1;/.test(fn), '못 찾았을 때 -1 을 안 준다');
  assert.ok((fn.match(/for\s*\(/g) || []).length >= 2, '주담당이 없을 때 첫 사람으로 물러서지 않는다');
});

test('담을 때 정하는 길도 그대로 남아 있다 (둘 다 있어야 한다)', () => {
  assert.ok(/__duty: dutyOf\(r\.id\)/.test(B), '고르는 창에서 정하는 길이 사라졌다');
  assert.ok(/pcc\.duty = p\.__duty/.test(B), '담을 때 붙이는 길이 사라졌다');
});
