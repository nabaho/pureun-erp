'use strict';
// 서랍 정리 — node --test tests/drawer-tidy.test.js
//
// 대표 지시 2026-09-05: "화면이 너무 정신없다. 좀 간략하게 정리해 줄수 있나? 찾는데 헤깔린다."
//
// 화면을 보니 상자가 일곱인데 그 가운데 넷이 「아직 없음」이면서 자리는 다 차지했다.
// 그리고 «업무를 여는 까닭»인 기록 칸은 그 일곱을 다 지나 맨 아래에 있었다.
//
// 이 검사가 지키는 것
//   ① 비어 있는 상자는 제목 한 줄로 접힌다 — 없애지는 않는다
//   ② 내용이 있으면 «절대» 접지 않는다 (있는 것을 감추면 더 못 찾는다)
//   ③ 편 것은 그 업무를 보는 동안만 — 업무를 바꾸면 되돌아간다
//   ④ 기록 칸과 기록 목록이 맨 위다
//   ⑤ 「이 건 담당자」 빈 줄을 안 깐다 (적는 길은 그대로)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;; j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}
function code(t){
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function box(){
  const b = {
    console, String,
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    renderDrawer(){ b._drew = (b._drew || 0) + 1; }
  };
  vm.createContext(b);
  vm.runInContext('var _dFold={};\n' + grab('dFoldToggle') + '\n' + grab('dFoldHead') + '\n' + grab('dFold'), b);
  return b;
}

const FULL = '<div class="dbox"><div class="bh">✅ 진행 단계<span class="r">아직 없음</span></div>'
           + '<div class="bb"><button>✅ 단계 깔기</button></div></div>';

/* ══════════════════════════════════════════════
   ① 비면 접는다 — 없애지 않는다
   ══════════════════════════════════════════════ */
test('★ 비어 있으면 제목 한 줄만 남는다', () => {
  const b = box();
  const h = b.dFold('st', b.dFoldHead('✅', '진행 단계', '아직 없음'), FULL, true);
  assert.match(h, /class="dbox dfold"/);
  assert.match(h, /진행 단계/);
  assert.match(h, /아직 없음/);
  assert.ok(h.indexOf('단계 깔기') < 0, '접혔는데 속이 보인다');
});

test('★★ 내용이 있으면 «손도 안 댄다» — 있는 것을 감추면 더 못 찾는다', () => {
  const b = box();
  assert.equal(b.dFold('st', b.dFoldHead('✅', '진행 단계', '2 / 5 완료'), FULL, false), FULL);
});

test('★ 눌러서 펴면 상자가 통째로 나오고, 되접을 길도 있다', () => {
  const b = box();
  b.dFoldToggle('st');
  const h = b.dFold('st', b.dFoldHead('✅', '진행 단계', '아직 없음'), FULL, true);
  assert.match(h, /단계 깔기/, '폈는데 속이 안 보인다');
  assert.match(h, /class="dfoldx"[^>]*>접기/);
  assert.ok(h.indexOf('dfold"') < 0, '펴 놓고도 접힌 줄을 그린다');
});

test('누르면 화면을 다시 그린다 — 눌렀는데 그대로면 고장으로 보인다', () => {
  const b = box();
  b.dFoldToggle('st');
  assert.equal(b._drew, 1);
});

test('상자가 «아예 없으면» 접힌 줄도 안 만든다 (해당 없는 업무)', () => {
  const b = box();
  assert.equal(b.dFold('org', b.dFoldHead('🏛', '상대기관', '등록 없음'), '', true), '');
});

test('제목 줄에 「눌러서 폅니다」를 적어 둔다 — 눌러 보고 알면 늦다', () => {
  const b = box();
  assert.match(b.dFold('st', b.dFoldHead('✅', '진행 단계', '아직 없음'), FULL, true),
               /title="눌러서 폅니다"/);
});

test('제목·오른쪽 글에 태그가 섞여 들어가지 않는다', () => {
  const b = box();
  assert.match(b.dFoldHead('✅', '<b>이상</b>', '<i>것</i>'), /&lt;b&gt;이상&lt;\/b&gt;/);
});

/* ══════════════════════════════════════════════
   ② 어떤 상자가 접히나
   ══════════════════════════════════════════════ */
const RD = code(grab('renderDrawer'));

test('★ 말로 기록 — 녹음 중이 아니면 접는다', () => {
  assert.match(RD, /dFold\('vo',dFoldHead\('🎤','말로 기록','말하면 AI 가 정리합니다'\),\s*dVoiceHTML\(id,it\), VO\.id!==id\)/);
});

test('★ 진행 단계 — 단계가 없으면 접는다', () => {
  assert.match(RD, /dFold\('st',dFoldHead\('✅','진행 단계','아직 없음'\),\s*dStepsHTML\(id,it\), !stepsOf\(id\)\.length\)/);
});

test('★ 관련 지식 — 붙은 카드가 없으면 접는다', () => {
  assert.match(RD, /dFold\('kb',dFoldHead\('📚','관련 지식','아직 없음'\)/);
  assert.match(RD, /'<\/div><\/div>', !rel\.length\);/);
});

test('★ 상대기관 — 푸른이알피 관할 칸이 비었으면 접는다', () => {
  const O = code(grab('dOrgHTML'));
  assert.match(O, /dFold\('org',dFoldHead\('🏛','상대기관','등록 없음'\)/);
  /* 값이 있으면 그리는 쪽은 접기를 안 거친다 */
  const tail = O.slice(O.indexOf("'읽기 전용'"));
  assert.ok(tail.indexOf('dFold(') < 0, '값이 있는데도 접기를 거친다');
});

test('★★ 담당(주담당·부담당)은 접지 않는다 — 늘 봐야 하는 것이다', () => {
  const P = code(grab('dPeopleHTML'));
  const i = P.indexOf('👥 담당');
  assert.ok(i > 0);
  assert.ok(P.slice(i - 200, i).indexOf('dFold(') < 0);
});

test('다음 할 일도 접지 않는다', () => {
  const i = RD.indexOf('☐ 다음 할 일');
  assert.ok(i > 0 && RD.slice(i - 200, i).indexOf('dFold(') < 0);
});

/* ══════════════════════════════════════════════
   ③ 편 것은 그 업무를 보는 동안만
   ══════════════════════════════════════════════ */
test('★★ 업무를 바꾸면 펴 둔 것이 되돌아간다', () => {
  assert.match(code(grab('openDrawer')), /if\(S\.drawerId!==id\) _dFold=\{\};/);
});

test('같은 업무를 다시 그릴 때는 안 되돌린다 — 펴 놓고 기록 한 줄 적으면 도로 접힌다', () => {
  const O = code(grab('openDrawer'));
  assert.ok(O.indexOf('_dFold={};') > 0 && O.indexOf('S.drawerId!==id') > 0);
  assert.ok(code(grab('renderDrawer')).indexOf('_dFold={}') < 0, '다시 그릴 때마다 접힌다');
});

/* ══════════════════════════════════════════════
   ④ 기록이 맨 위
   ══════════════════════════════════════════════ */
test('★★ 기록 칸이 상자들보다 «먼저» 그려진다', () => {
  const iLog = RD.indexOf('dLogBoxHTML(id,logs)');
  const iVo = RD.indexOf("dFold('vo'");
  const iPeople = RD.indexOf('dPeopleHTML(id,it)');
  assert.ok(iLog > 0, '기록 상자를 안 그린다');
  assert.ok(iLog < iVo && iLog < iPeople, '기록 칸이 아직 상자 아래에 있다');
});

test('★ 다음 할 일보다는 뒤다 — 오늘 할 일이 맨 위여야 한다', () => {
  assert.ok(RD.indexOf('☐ 다음 할 일') < RD.indexOf('dLogBoxHTML(id,logs)'));
});

test('★★ 적는 칸과 적힌 것이 한 덩이로 움직였다 — 둘이 갈리면 헛갈린다', () => {
  const B = grab('dLogBoxHTML');
  assert.match(B, /id="dlog"/);
  assert.match(B, /id="feed"/);
  assert.match(B, /drawerAdd\(/);
  assert.match(B, /wksep/, '주 구분선이 빠졌다');
});

test('★ 옛 자리에는 남아 있지 않다 — 두 번 그리면 Enter 가 어느 칸으로 갈지 모른다', () => {
  assert.equal(W.split('id="dlog"').length - 1, 1);
  assert.equal(W.split('id="feed"').length - 1, 1);
});

test('맨 아래 단추 줄(수정·담당 변경·종료)은 그대로 맨 아래다', () => {
  assert.ok(RD.indexOf('dLogBoxHTML(id,logs)') < RD.indexOf('class="dfoot"'));
  assert.match(RD, /✓ 업무 종료/);
});

test('아직 안 읽었으면 「불러오는 중」이 그대로 나온다', () => {
  assert.match(grab('dLogBoxHTML'), /if\(!logs\)\{ h\+=loadingHTML\('이력 불러오는 중…'\); \}/);
});

/* ══════════════════════════════════════════════
   ⑤ 「이 건 담당자」 빈 줄
   ══════════════════════════════════════════════ */
test('★★ 적힌 것이 없으면 빈 줄을 안 깐다', () => {
  const b = { itemContacts: () => [], items: {}, S: {} };
  vm.createContext(b);
  vm.runInContext(grab('_ctRowCount'), b);
  assert.equal(b._ctRowCount('W1'), 0);
});

test('★ [＋ 담당자 추가]를 누르면 한 줄이 생긴다 — 적을 길이 막히면 안 된다', () => {
  const b = { itemContacts: () => [], items: {}, S: { _ctAdd: { W1: 1 } } };
  vm.createContext(b);
  vm.runInContext(grab('_ctRowCount'), b);
  assert.equal(b._ctRowCount('W1'), 1);
  /* 누르는 쪽 셈도 0 → 1 로 맞는다 */
  assert.match(code(grab('contactAdd')), /S\._ctAdd\[id\]=\(shown\+1\)-itemContacts\(items\[id\]\|\|\{\}\)\.length;/);
});

test('★ 이미 적힌 담당자는 그 수만큼 그대로 그린다', () => {
  const b = { itemContacts: () => [{ name: '강명신' }, { name: '이철' }], items: {}, S: {} };
  vm.createContext(b);
  vm.runInContext(grab('_ctRowCount'), b);
  assert.equal(b._ctRowCount('W1'), 2);
});

test('★★ 줄이 하나도 없을 때 저장이 담당자를 지우지 않는다 — 그 문은 이미 잠겨 있다', () => {
  assert.match(grab('_ctSave'), /if\(!\$\('ct-nm-0'\)\) return Promise\.resolve\(false\);/);
});

/* ══════════════════════════════════════════════
   ⑥ 화면에 안내문을 깔지 않는다
   ══════════════════════════════════════════════ */
test('접힌 줄에는 설명글이 없다 — 제목과 「아직 없음」뿐', () => {
  const b = box();
  const h = b.dFold('kb', b.dFoldHead('📚', '관련 지식', '아직 없음'), FULL, true);
  assert.ok(h.length < 200, '접었는데 길다: ' + h.length + '자');
});

test('접힌 줄의 모양이 CSS 에 있다', () => {
  const CSS = W.slice(W.indexOf('<style>'), W.indexOf('</style>'));
  assert.match(CSS, /\.dfold\{cursor:pointer\}/);
  assert.match(CSS, /\.dfoldx\{/);
  assert.match(CSS, /\.dfold \.fa\{/);
});
