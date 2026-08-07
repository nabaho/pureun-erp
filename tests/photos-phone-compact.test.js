/* 사진첩 폰 화면 — 사진을 맨 위로 (대표 지시 2026-08-07)
   "사진을 보려면 아래로 계속 내려야 하는데, 사진이 우선으로 보이고 관리해야 하는데
    보기가 많이 불편하다."

   예전에는 사진 한 장 보려면 **단추 6개 + 분류 탭 2줄**을 지나야 했다.
   폰에서만 올리는 단추를 아래 줄로, 찾기·설정을 제목줄로 옮긴다. PC 는 그대로다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── 새로 만들지 않고 자리만 옮기는가 (가장 중요한 성질) ── */
test('★ 올리는 단추를 새로 만들지 않는다 — 있는 것을 옮긴다', () => {
  /* 새로 만들면 파일 고르기 배선(onchange·대기열·판독)이 두 벌이 되고,
     한쪽만 고치는 사고가 난다. id 는 딱 하나씩만 있어야 한다. */
  for (const id of ['pickBtn', 'docBtn', 'camBtn', 'needBox', 'oldBox']) {
    const n = (html.match(new RegExp('id="' + id + '"', 'g')) || []).length;
    assert.equal(n, 1, id + ' 이 ' + n + '개 있습니다 — 자리만 옮겨야 합니다.');
  }
  const m = html.match(/function placeForWidth\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'placeForWidth 가 없습니다.');
  assert.ok(/appendChild\(/.test(m[0]), 'DOM 을 옮겨야 배선이 따라옵니다.');
  assert.ok(!/createElement/.test(m[0]), '단추를 새로 만들면 안 됩니다.');
});

/* ── 실제로 옮기고 되돌리는가 ── */
function fakeDom() {
  function el(id) {
    return { id: id, parentNode: null, classList: { toggle(){}, add(){}, remove(){} },
             appendChild(c) { c.parentNode = this; },
             insertBefore(c) { c.parentNode = this; },
             firstChild: null, focus() {} };
  }
  const ids = ['phoneBar','side','chipRow','pickBtn','docBtn','camBtn','row2',
               'needBox','oldBox','upWrap','findBar','q','phUpRow','phMenuBtn','phSheet'];
  const nodes = {};
  ids.forEach(function (i) { nodes[i] = el(i); });
  /* 처음에는 PC 자리 — 대시보드와 row2 안 */
  nodes.pickBtn.parentNode = nodes.side;
  nodes.docBtn.parentNode = nodes.row2;
  nodes.camBtn.parentNode = nodes.row2;
  nodes.needBox.parentNode = nodes.side;
  nodes.oldBox.parentNode = nodes.side;
  return nodes;
}
function runPlace(width) {
  const nodes = fakeDom();
  const ctx = {
    window: { innerWidth: width, addEventListener() {} },
    PHONE_MAX: 820,
    phoneFindOn: false,
    $: (id) => nodes[id] || null
  };
  ctx.isPhone = function () { return ctx.window.innerWidth <= ctx.PHONE_MAX; };
  ctx.renderPhMenuBtn = function () {};
  ctx.closePhSheet = function () {};
  const m = html.match(/function placeForWidth\(\)[\s\S]*?\n\}/);
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  ctx.placeForWidth();
  return nodes;
}

/* ⚠ 2026-08-07 다시 겨눔 — 분류와 올리기를 **창 하나**로 합쳤다(대표 지시).
   그래서 아래 줄에는 카메라만 남고, 사진·서류는 창 안으로 들어간다. */
test('★ 폰이면 카메라만 아래 줄에 남는다', () => {
  const n = runPlace(390);
  assert.equal(n.camBtn.parentNode.id, 'phoneBar', '촬영은 한 번에 눌려야 합니다.');
});

test('★ 사진·서류 고르기는 창 안으로 들어간다', () => {
  const n = runPlace(390);
  assert.equal(n.pickBtn.parentNode.id, 'phUpRow');
  assert.equal(n.docBtn.parentNode.id, 'phUpRow');
});

test('★ PC 에서는 하나도 안 옮긴다', () => {
  const n = runPlace(1400);
  assert.equal(n.pickBtn.parentNode.id, 'side', 'PC 화면은 지금 그대로여야 합니다.');
  assert.equal(n.docBtn.parentNode.id, 'row2');
  assert.equal(n.camBtn.parentNode.id, 'row2');
});

test('★ 폰에서 PC 로 넓히면 제자리로 돌아온다 (화면을 돌릴 때)', () => {
  const nodes = fakeDom();
  const ctx = {
    window: { innerWidth: 390, addEventListener() {} },
    PHONE_MAX: 820, phoneFindOn: false, $: (id) => nodes[id] || null
  };
  ctx.isPhone = function () { return ctx.window.innerWidth <= ctx.PHONE_MAX; };
  ctx.renderPhMenuBtn = function () {};
  ctx.closePhSheet = function () {};
  vm.createContext(ctx);
  vm.runInContext(html.match(/function placeForWidth\(\)[\s\S]*?\n\}/)[0], ctx);
  ctx.placeForWidth();
  assert.equal(nodes.pickBtn.parentNode.id, 'phUpRow');
  ctx.window.innerWidth = 1400;          // 가로로 돌리거나 창을 넓혔다
  ctx.placeForWidth();
  assert.equal(nodes.pickBtn.parentNode.id, 'side', '넓혔는데 창 안에 남으면 안 됩니다.');
  assert.equal(nodes.docBtn.parentNode.id, 'row2');
  assert.equal(nodes.camBtn.parentNode.id, 'row2');
});

test('창 크기가 바뀌면 다시 맞춘다', () => {
  assert.ok(/addEventListener\('resize', placeForWidth\)/.test(html),
    '화면을 돌리면 폰↔PC 가 오갑니다.');
});

/* ── 폰에서 무엇이 사라지나 ── */
test('★ 폰에서 첫 화면을 먹던 것들이 빠진다', () => {
  const m = html.match(/@media \(max-width:820px\)\{[\s\S]*?\n\}\r?\n#chipRow/);
  assert.ok(m, '폰 전용 꾸밈 덩어리를 찾지 못했습니다.');
  const css = m[0];
  assert.ok(/\.dochint,\.maxhint,#dropHint,\.row2\{display:none!important\}/.test(css),
    '안내 문구가 첫 화면을 먹습니다.');
  assert.ok(/#trashBtn\{display:none\}/.test(css), '휴지통은 설정 안으로 갑니다.');
  assert.ok(/#setBtn\{display:none\}/.test(css), '설정은 제목줄 아이콘으로 갑니다.');
  assert.ok(/#kinds\{flex-wrap:nowrap/.test(css), '분류 탭이 두 줄이 되면 안 됩니다.');
});

test('★ 아래 줄에 가려 마지막 사진이 잘리지 않는다', () => {
  assert.ok(/#main\{padding-bottom:\d+px\}/.test(html),
    '떠 있는 줄 뒤에 여백이 없으면 마지막 줄 사진을 못 누릅니다.');
});

test('아래 줄의 빈 자리는 클릭이 뚫린다', () => {
  const m = html.match(/#phoneBar\{display:flex[^}]*\}/);
  assert.ok(m && /pointer-events:none/.test(m[0]),
    '안 보이는 판이 사진을 덮으면 사진을 못 누릅니다.');
  assert.ok(/#phoneBar > \*\{pointer-events:auto\}/.test(html), '단추 자체는 눌려야 합니다.');
});

/* ══ 분류 + 올리기 창 (대표 지시 2026-08-07: 캡쳐 둘을 합쳐 팝업으로) ══ */
test('★ 폰에서는 분류 탭 줄이 화면에서 사라진다', () => {
  const m = html.match(/@media \(max-width:820px\)\{[\s\S]*?\n\}\r?\n#chipRow/);
  assert.ok(m, '폰 전용 꾸밈 덩어리를 찾지 못했습니다.');
  assert.ok(/#kinds,#chipRow\{display:none!important\}/.test(m[0]),
    '탭 줄이 남아 있으면 합친 뜻이 없습니다.');
  assert.ok(/#phMenuBtn\{display:flex\}/.test(m[0]));
});

test('★ 아래 단추에 지금 보는 분류와 장수를 적는다', () => {
  const m = html.match(/function renderPhMenuBtn\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderPhMenuBtn 이 없습니다.');
  for (const cond of ['oldOnly', 'needOnly', "kindTab !== 'all'"]) {
    assert.ok(m[0].includes(cond), cond + ' 일 때의 글귀가 없습니다 — 무엇을 보는지 알 수 없습니다.');
  }
  assert.ok(/class="cnt"/.test(m[0]), '장수가 붙어야 합니다.');
  assert.ok(/renderPhMenuBtn\(\);/.test(html.match(/renderBackBar\(\);[\s\S]{0,120}/)[0]),
    '격자를 다시 그릴 때 단추 글귀도 따라와야 합니다.');
});

test('★ 창 안에 분류·할 일·올리기가 모두 있다', () => {
  const m = html.match(/function renderPhSheet\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderPhSheet 이 없습니다.');
  assert.ok(/kindOrder\(\)/.test(m[0]), '분류 목록이 없습니다.');
  assert.ok(/tabCounts\(\)/.test(m[0]), '장수가 없습니다.');
  assert.ok(/phPickNeed/.test(m[0]) && /phPickOld/.test(m[0]),
    '확인 필요·지난 것이 빠지면 갈 길이 없어집니다.');
  assert.ok(/openAddKind/.test(m[0]), '＋ 분류 추가가 빠졌습니다.');
  assert.ok(/id="phUpRow"/.test(html), '사진·서류 고르기가 들어갈 자리가 없습니다.');
});

test('할 일 줄은 있을 때만 뜬다', () => {
  const m = html.match(/function renderPhSheet\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(need\)/.test(m[0]) && /if \(old\)/.test(m[0]),
    '0장인 줄이 늘 떠 있으면 목록만 길어집니다.');
});

test('★ 고르면 바로 닫힌다', () => {
  for (const f of ['phPick', 'phPickNeed', 'phPickOld']) {
    const m = html.match(new RegExp('function ' + f + '\\([^)]*\\) \\{[^\\n]*'));
    assert.ok(m, f + ' 가 없습니다.');
    assert.ok(/closePhSheet\(\)/.test(m[0]),
      f + ' 뒤에 창이 남으면 사진을 보려고 또 닫아야 합니다.');
  }
});

test('두 걸러보기가 겹치지 않게 푼다', () => {
  const m = html.match(/function phPick\([^)]*\) \{[^\n]*/);
  assert.ok(/needOnly = false; oldOnly = false;/.test(m[0]),
    '분류를 골랐는데 걸러보기가 남아 있으면 사진이 안 보입니다.');
});

test('★ 바깥·손잡이·Esc 로 닫힌다', () => {
  assert.ok(/class="dim" onclick="closePhSheet\(\)"/.test(html), '바깥을 눌러 닫을 수 있어야 합니다.');
  assert.ok(/class="grab" onclick="closePhSheet\(\)"/.test(html), '손잡이로도 닫을 수 있어야 합니다.');
  const esc = (html.match(/document\.addEventListener\('keydown', function \(e\) \{[\s\S]*?\n\}\);/g) || [])
    .find(function (b) { return /goBack\(\)/.test(b); });
  assert.ok(esc && /phSheetOpen\(\)[\s\S]{0,60}closePhSheet\(\)/.test(esc),
    'Esc 는 창을 먼저 닫아야 합니다 — 안 그러면 창이 열린 채 화면이 뒤로 갑니다.');
});

test('넓히면 창이 닫힌다', () => {
  const m = html.match(/function placeForWidth\(\)[\s\S]*?\n\}/);
  assert.ok(/closePhSheet\(\)/.test(m[0]),
    'PC 로 넓혔는데 폰용 창이 떠 있으면 화면을 덮습니다.');
});

/* ── 제목줄 ── */
test('★ 폰 제목줄에 찾기·설정만 둔다', () => {
  assert.ok(/id="findIc"[^>]*onclick="togglePhoneFind\(\)"/.test(html));
  assert.ok(/id="setIc"[^>]*onclick="showView\('settings'\)"/.test(html));
  assert.ok(/^\.topic\{display:none\}/m.test(html), 'PC 에서는 이 아이콘이 안 보여야 합니다.');
});

test('찾기는 눌렀을 때만 칸이 열린다', () => {
  const m = html.match(/function togglePhoneFind\(\)[\s\S]*?\n\}/);
  assert.ok(m && /phoneFindOn = !phoneFindOn/.test(m[0]));
  const pl = html.match(/function placeForWidth\(\)[\s\S]*?\n\}/);
  assert.ok(/classList\.toggle\('hidden', phone && !phoneFindOn\)/.test(pl[0]),
    'PC 에서는 찾기 줄이 늘 보여야 합니다.');
});

/* ── 휴지통 ── */
test('★ 폰에서도 휴지통에 갈 길이 있다 (설정 안)', () => {
  assert.ok(/id="phSetTrash"[^>]*onclick="showView\('trash'\)"/.test(html),
    '대시보드에서 숨기기만 하면 휴지통에 못 갑니다.');
  assert.ok(/#phSetTrash\{display:none/.test(html), 'PC 에서는 안 보여야 합니다(원래 단추가 있습니다).');
  assert.ok(/#phSetTrash\{display:flex\}/.test(html), '폰에서는 보여야 합니다.');
});

test('휴지통 장수를 두 곳에 같이 적는다', () => {
  assert.ok(/phTrashCount'\)/.test(html),
    '설정 안 휴지통에 장수가 안 붙으면 열어 봐야 압니다.');
});
