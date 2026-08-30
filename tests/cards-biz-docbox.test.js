'use strict';
/* 사업자 탭을 «등록증 서류함»으로 좁힌다 (대표 지시 2026-08-30, 안 ⓓ 1걸음)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     대표 물음 2026-08-30 — 「사업자와 기업상세를 합하는게 좋은지 … 현재 업무처리를
     이중으로 하는 느낌이 있다」.

     자료는 이미 한 벌이다(coListBuild 가 사업자번호를 열쇠로 등록증·명함·푸른이알피를
     모은다). 이중으로 «보이는» 까닭은 화면에 있었다 —
       사업자 탭이 상호·대표자·업태·종목·소재지·담당을 늘어놓아 «회사 명부»처럼 생겼다.
     그래서 회사 목록이 두 벌 있는 것처럼 읽혔다. 실제로는 «등록증 서류 보관함»이다.

   ■ 어떻게 고쳤나
     · 이름을 「등록증 서류함」으로 바꾼다 — 무엇을 담는 곳인지 이름에서 드러난다.
     · 회사형 칸(대표자·업태·종목·소재지)을 기본에서 감춘다. 그것은 «회사» 이야기라
       기업 상세에서 본다. 남는 것은 서류를 가리는 데 필요한 것뿐이다 —
       상호·사업자번호·서류이름·등록일.
     · 상호를 누르면 그 회사의 기업 상세로 간다 — 회사를 찾는 입구를 하나로 모은다.

   ★ 지우지 «않는다»
     감춘 칸은 「열 ▾」에서 다시 켤 수 있다. 한 번 켜면 그 뜻을 기억한다 —
     기본으로 도로 감추면 껐다 켰다가 되풀이되고, 그건 고장으로 읽힌다.

   ★ 여기서 못 박는 것
     ① 옆줄이 「등록증 서류함」이라 부른다 (회사 명부가 아니라는 것이 이름에 있다)
     ② 회사형 칸 넷이 기본으로 안 보인다
     ③ 서류를 가리는 칸(상호·사업자번호·서류이름·등록일)은 그대로 보인다
     ④ 감춘 칸이 «없어지지 않는다» — 「열 ▾」 목록에 그대로 있다
     ⑤ 사람이 켜 두면 기본이 그것을 못 덮는다
     ⑥ 감추는 판정이 «한 곳»에서 나온다 — 머리글과 CSS 가 갈라지면 칸이 밀린다
     ⑦ 상호를 누르면 기업 상세로 간다
     ⑧ 명함 갈래는 하나도 안 건드렸다
   실행: node --test tests/cards-biz-docbox.test.js */
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
/* 「const X = ...;」 한 덩어리를 떠 온다 (여러 줄 허용) */
function constBlock(name){
  const re = new RegExp('^const ' + name + ' = [\\s\\S]*?^\\};?$', 'm');
  const m = src.match(re) || src.match(new RegExp('^const ' + name + ' = .*?;$', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0].replace(/^const /, 'var ');
}

/* ── 감추기 판정만 떼어 돌린다 ── */
function loadHide(tab, saved){
  const ctx = { console, Object, Array, String,
    state: { tab: tab, hiddenCols: saved || {} } };
  vm.createContext(ctx);
  vm.runInContext(constBlock('COL_HIDDEN_DEFAULT') + '\n'
    + fnBody('colHiddenKeys') + '\n' + fnBody('colHidden'), ctx);
  return ctx;
}

const CO_LIKE = ['ceo', 'bizType', 'bizItem', 'address'];   /* 회사 이야기 — 기업 상세에서 본다 */
const DOC_LIKE = ['company', 'bizno', 'docName', 'date'];   /* 서류를 가리는 데 필요한 것 */

/* ══════ ① 이름 ══════ */

/* ⚠ 그냥 「등록증」을 찾으면 말풍선(title="사업자등록증")에 걸려 늘 통과한다 —
   보이는 이름을 「사업자」로 되돌려도 안 걸린다. 눈에 보이는 <em> 안만 본다. */
test('★ 옆줄이 「등록증 서류함」이라 부른다 — 회사 명부가 아니라는 것이 이름에 있다', () => {
  const side = code(fnBody('renderPCSide'));
  const btn = side.match(/switchTab\('biz'\)[\s\S]{0,220}?<\/button>/);
  assert.ok(btn, '사업자 갈래 단추를 못 찾았다');
  const em = btn[0].match(/<em>([^<]*)<\/em>/);
  assert.ok(em, '갈래 단추의 «보이는 이름»(<em>)을 못 찾았다');
  assert.match(em[1], /등록증/,
    '★ 「사업자」라고만 두면 회사 명부로 읽혀 기업 상세와 두 벌로 보인다');
});

/* ══════ ②③ 기본으로 보이는 칸 ══════ */

test('★ 회사형 칸 넷이 기본으로 안 보인다 — 그것은 기업 상세 이야기다', () => {
  const H = loadHide('biz', {});
  for (const k of CO_LIKE) {
    assert.equal(H.colHidden(k), true, `★ 「${k}」이 아직 보인다 — 회사 명부처럼 읽힌다`);
  }
});

test('서류를 가리는 칸은 그대로 보인다 — 감추면 어느 서류인지 알 수 없다', () => {
  const H = loadHide('biz', {});
  for (const k of DOC_LIKE) {
    assert.equal(H.colHidden(k), false, `「${k}」까지 감추면 서류함 구실을 못 한다`);
  }
});

/* ══════ ④ 없애지 않았다 ══════ */

test('★ 감춘 칸이 없어지지 않았다 — 「열 ▾」에서 다시 켤 수 있다', () => {
  const defs = src.match(/^const COL_DEFS = [\s\S]*?^\};$/m);
  assert.ok(defs, 'COL_DEFS 를 못 찾았다');
  const biz = defs[0].slice(defs[0].indexOf('biz:'));
  for (const k of CO_LIKE) {
    assert.match(biz, new RegExp("'" + k + "'"),
      `★ 「${k}」을 COL_DEFS 에서 지우면 다시 켤 길이 아예 없어진다 — 감추는 것과 다르다`);
  }
});

/* ══════ ⑤ 사람이 켠 것이 이긴다 ══════ */

test('★ 사람이 켜 두면 기본이 그것을 못 덮는다 — 껐다 켜졌다 하면 고장으로 읽힌다', () => {
  const H = loadHide('biz', { biz: { ceo: false } });
  assert.equal(H.colHidden('ceo'), false,
    '★ 「열 ▾」에서 켰는데 다시 그릴 때 도로 감추면 아무도 그 단추를 안 믿는다');
});

test('사람이 감춘 칸은 그대로 감춰진다', () => {
  const H = loadHide('biz', { biz: { bizno: true } });
  assert.equal(H.colHidden('bizno'), true);
});

/* ══════ ⑥ 한 곳에서 ══════ */

test('★ 표를 그릴 때도 «같은 판정»을 쓴다 — 머리글과 CSS 가 갈라지면 칸이 밀린다', () => {
  const r = code(fnBody('renderPCTable'));
  assert.match(r, /colHiddenKeys\(\)/,
    '★ state.hiddenCols 를 직접 뒤지면 기본 감춤이 CSS 에만 안 먹어 «머리글은 있고 값은 없는» 칸이 생긴다');
  assert.doesNotMatch(r, /state\.hiddenCols\[state\.tab\]/,
    '★ 판정이 두 벌이 되면 한쪽만 고쳐지는 날이 온다');
});

/* ══════ ⑥-2 감춘 칸은 폭 배분에서도 빠진다 ══════
   표는 table-layout:fixed 라 <col> 폭이 «자리 순서대로» 먹힌다. 감춘 칸이 그 자리를
   비켜 주지 않으면 뒤 칸들이 «앞 칸의 폭»을 하나씩 물려받는다 —
   실제로 재 보니 사업자번호가 대표자 몫(9%)을 먹어 「783-85-02…」로 잘리고,
   쓰이지 못한 폭이 표 오른쪽에 272px 빈 띠로 남았다(2026-08-30 실측).
   ⚠ 이건 원래 있던 버그다. 「열 ▾」로 아무 칸이나 감추면 지금도 그렇게 된다 —
     기본으로 넷을 감추게 되었으니 이제는 모두가 겪는다. */
test('★ 감춘 칸은 colgroup 에서도 빠진다 — 안 빼면 폭이 한 칸씩 밀린다', () => {
  const r = code(fnBody('renderPCTable'));
  const line = r.match(/const colg = [^\n]*/);
  assert.ok(line, 'colgroup 을 만드는 자리를 못 찾았다');
  assert.match(line[0], /filter\([^)]*hidden/i,
    '★ 감춘 칸의 <col> 이 남아 있으면 사업자번호가 대표자 몫 폭을 먹고 잘린다');
});

/* ══════ ⑦ 상호 → 기업 상세 ══════ */

test('★ 상호를 누르면 기업 상세로 간다 — 회사를 찾는 입구를 하나로 모은다', () => {
  const r = code(fnBody('renderPCTable'));
  const td = r.match(/company:\s*it =>[\s\S]*?<\/td>`,/g);
  assert.ok(td && td.length, '상호 칸을 그리는 함수를 못 찾았다');
  const bizTd = td[td.length - 1];   /* 명함 것이 먼저, 사업자 것이 나중 */
  assert.match(bizTd, /openCoFromItem/,
    '★ 등록증에서 그 회사로 가는 길이 없으면 상호를 보고 다시 찾아 들어가야 한다');
});

test('그 길이 실제로 기업 상세를 연다 — 이름만 있고 하는 일이 없으면 안 된다', () => {
  const f = code(fnBody('openCoFromItem'));
  assert.match(f, /openCoPage\(\)/, '기업 상세 화면을 열어야 한다');
  assert.match(f, /pickCo\(/, '그 회사를 짚어 줘야 한다 — 4,154곳에서 다시 찾게 하면 뜻이 없다');
  assert.match(f, /coKeyOf\(/,
    '회사를 가르는 열쇠는 목록을 세울 때와 «같은 함수»여야 한다 — 따로 만들면 엉뚱한 곳이 열린다');
});

/* ══════ ⑧ 명함은 안 건드린다 ══════ */

test('★ 명함 갈래는 하나도 안 건드렸다', () => {
  const H = loadHide('card', {});
  for (const k of ['name', 'company', 'title', 'mobile', 'email', 'date']) {
    assert.equal(H.colHidden(k), false, `★ 명함의 「${k}」이 사라졌다 — 이 고침과 상관없는 화면이다`);
  }
});
