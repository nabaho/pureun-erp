'use strict';
/* 열 감추기 — 「열 ▾」로 감춘 칸이 «폭까지» 제대로 비켜 주는가
   ═══════════════════════════════════════════════════════════════════════════
   ■ 이 파일의 내력
     2026-08-30 에 사업자 탭을 「등록증 서류함」으로 좁히면서(대표 물음 「이중으로 하는
     느낌」) 회사형 칸 넷을 «기본으로» 감춘 적이 있다. 그때 tests/cards-biz-docbox.test.js
     로 그 좁히기를 못 박았는데, 같은 날 대표 지시 「다시 되돌려 달라. 현재는 분리시킬
     이유가 없다」로 **되돌렸다.**

     되돌리면서 «분리와 상관없는» 고침 둘은 남겼다. 이 파일이 그 둘을 지킨다 —
       ① 감춤 판정이 «한 곳»에서 나온다 (머리글과 CSS 가 갈라지면 칸이 밀린다)
       ② 감춘 칸은 colgroup 에서도 빠진다 (안 빼면 폭이 한 칸씩 밀린다)
     ②는 «원래 있던 버그»다. 표가 table-layout:fixed 라 <col> 폭이 자리 순서대로
     먹히는데 감춘 칸이 자리를 안 비켜, 보이는 칸들이 앞 칸의 폭을 하나씩 물려받았다.
     실측하니 사업자번호가 대표자 몫(9%)을 먹어 「783-85-02…」로 잘리고, 쓰이지 못한
     폭이 표 오른쪽에 272px 빈 띠로 남았다. 「열 ▾」로 아무 칸이나 감추면 늘 그랬다.

   ★ 여기서 못 박는 것
     ① 기본으로 감추는 칸은 «지금 없다» (사업자 탭을 말없이 다시 좁히지 않는다)
     ② 옆줄 갈래 이름은 「사업자」다 (「등록증 서류함」으로 되돌아가지 않는다)
     ③ 사람이 「열 ▾」에서 정한 뜻이 이긴다 — 켠 것도, 감춘 것도 기억한다
     ④ 감춤 판정은 한 곳에서만 나온다
     ⑤ 감춘 칸은 colgroup 에서도 빠진다
     ⑥ 열 목록(COL_DEFS)은 온전하다 — 감추기와 지우기는 다르다
   실행: node --test tests/cards-col-hide.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 주석을 걷어 낸 소스 — 잘 쓴 주석이 검사를 통과시키는 일을 막는다 */
function code(s){
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
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
function constBlock(name){
  const m = src.match(new RegExp('^const ' + name + ' = .*?;$', 'm'))
         || src.match(new RegExp('^const ' + name + ' = [\\s\\S]*?^\\};?$', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0].replace(/^const /, 'var ');
}
function loadHide(tab, saved){
  const ctx = { console, Object, Array, String,
    state: { tab: tab, hiddenCols: saved || {} } };
  vm.createContext(ctx);
  vm.runInContext(constBlock('COL_HIDDEN_DEFAULT') + '\n'
    + fnBody('colHiddenKeys') + '\n' + fnBody('colHidden'), ctx);
  return ctx;
}

const BIZ_COLS = ['company', 'ceo', 'bizno', 'docName', 'bizType', 'bizItem', 'address', 'date'];

/* ══════ ① 기본으로 감추는 칸은 없다 ══════ */

test('★ 사업자 탭의 칸이 하나도 기본으로 감춰지지 않는다 — 대표 지시로 되돌린 것이다', () => {
  const H = loadHide('biz', {});
  for (const k of BIZ_COLS) {
    assert.equal(H.colHidden(k), false,
      `★ 「${k}」이 말없이 감춰졌다 — 2026-08-30 「분리시킬 이유가 없다」로 되돌린 자리다`);
  }
});

test('명함 탭도 마찬가지다', () => {
  const H = loadHide('card', {});
  for (const k of ['name', 'company', 'title', 'mobile', 'email', 'date']) {
    assert.equal(H.colHidden(k), false, `명함의 「${k}」이 감춰졌다`);
  }
});

/* ══════ ② 옆줄 이름 ══════
   ⚠ 그냥 「사업자」를 찾으면 말풍선(title="사업자등록증")에 걸려 늘 통과한다.
     눈에 보이는 <em> 안만 본다. */
test('★ 옆줄 갈래 이름은 「사업자」다 — 「등록증 서류함」으로 되돌아가지 않았다', () => {
  const side = code(fnBody('renderPCSide'));
  const btn = side.match(/switchTab\('biz'\)[\s\S]{0,220}?<\/button>/);
  assert.ok(btn, '사업자 갈래 단추를 못 찾았다');
  const em = btn[0].match(/<em>([^<]*)<\/em>/);
  assert.ok(em, '갈래 단추의 «보이는 이름»(<em>)을 못 찾았다');
  assert.equal(em[1].trim(), '사업자',
    '★ 대표 지시로 「사업자」로 되돌린 이름이다 — 다시 바꾸려면 먼저 물어볼 것');
});

/* ══════ ③ 사람이 정한 뜻이 이긴다 ══════ */

test('사람이 감춘 칸은 감춰진다', () => {
  assert.equal(loadHide('biz', { biz: { ceo: true } }).colHidden('ceo'), true);
});

test('★ 사람이 켠 칸은 무엇도 도로 감추지 못한다 — 켜도 안 켜지면 고장으로 읽힌다', () => {
  assert.equal(loadHide('biz', { biz: { ceo: false } }).colHidden('ceo'), false);
});

test('★ 「열 ▾」가 «켰다»도 적어 둔다 — 지우기로 적으면 기본이 되살아난다', () => {
  const f = code(fnBody('setColVisible'));
  assert.doesNotMatch(f, /delete\s+state\.hiddenCols/,
    '★ 켠 것을 «지우기»로 적으면, 기본 감춤이 다시 생기는 날 켜도 안 켜지는 단추가 된다');
});

/* ══════ ④⑤ 판정은 한 곳 · 감춘 칸은 폭도 비킨다 ══════ */

test('★ 표를 그릴 때도 «같은 판정»을 쓴다 — 머리글과 CSS 가 갈라지면 칸이 밀린다', () => {
  const r = code(fnBody('renderPCTable'));
  assert.match(r, /colHiddenKeys\(\)/, '★ 판정이 두 벌이 되면 한쪽만 고쳐지는 날이 온다');
  assert.doesNotMatch(r, /state\.hiddenCols\[state\.tab\]/,
    '★ state.hiddenCols 를 직접 뒤지면 판정이 갈라진다');
});

test('★ 감춘 칸은 colgroup 에서도 빠진다 — 안 빼면 폭이 한 칸씩 밀린다', () => {
  const r = code(fnBody('renderPCTable'));
  const line = r.match(/const colg = [^\n]*/);
  assert.ok(line, 'colgroup 을 만드는 자리를 못 찾았다');
  assert.match(line[0], /filter\([^)]*hidden/i,
    '★ 감춘 칸의 <col> 이 남으면 사업자번호가 대표자 몫 폭을 먹고 「783-85-02…」로 잘린다');
});

/* ══════ ⑥ 감추기와 지우기는 다르다 ══════ */

test('★ 열 목록이 온전하다 — 감추는 것과 지우는 것은 다르다', () => {
  const defs = src.match(/^const COL_DEFS = [\s\S]*?^\};$/m);
  assert.ok(defs, 'COL_DEFS 를 못 찾았다');
  const biz = defs[0].slice(defs[0].indexOf('biz:'));
  for (const k of BIZ_COLS) {
    assert.match(biz, new RegExp("'" + k + "'"),
      `★ 「${k}」을 COL_DEFS 에서 지우면 「열 ▾」에서 켤 길이 아예 없어진다`);
  }
});
