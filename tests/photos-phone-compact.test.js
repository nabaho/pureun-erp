const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('휴대폰 상단에는 사진 올리기 하나만 있고 중복 사진 고르기는 없다', () => {
  assert.match(html, /id="phUpBtn" onclick="phUpload\(\)"/);
  assert.doesNotMatch(html, /id="pickBtn"/);
  assert.doesNotMatch(html, /id="pickInput"/);
  assert.equal((html.match(/id="docInput"/g) || []).length, 1);
  assert.match(html, /function phUpload\(\)[^\n]*docInput/);
});

test('휴대폰 상단 올리기와 사람 선택은 작은 두 칸으로 정리된다', () => {
  const css = html.match(/@media \(max-width:820px\)\{[\s\S]*?\n\}\r?\n#chipRow/)[0];
  assert.match(css, /#phTop\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(118px,42%\)/);
  assert.match(css, /#phTop #phUpBtn[\s\S]*min-height:42px/);
  assert.match(css, /#ownerPick[\s\S]*min-width:0/);
});

function fakeDom() {
  function el(id) {
    return { id, parentNode: null, firstChild: null,
      classList: { toggle(){}, add(){}, remove(){} }, focus(){},
      appendChild(c) { c.parentNode = this; },
      insertBefore(c) { c.parentNode = this; } };
  }
  const ids = ['phoneBar','side','chipRow','docBtn','row2','needBox','oldBox','upWrap',
    'findBar','q','phUpRow','phMenuBtn','phSheet','ownerPick','phTop','phOwner'];
  const nodes = {};
  ids.forEach(id => { nodes[id] = el(id); });
  nodes.docBtn.parentNode = nodes.row2;
  nodes.needBox.parentNode = nodes.side;
  nodes.oldBox.parentNode = nodes.side;
  nodes.ownerPick.parentNode = nodes.side;
  return nodes;
}

function runPlace(width, nodes) {
  nodes = nodes || fakeDom();
  const ctx = {
    window: { innerWidth: width, addEventListener() {} }, PHONE_MAX: 820,
    phoneFindOn: false, $: id => nodes[id] || null,
    renderPhMenuBtn(){}, renderPhNeedBtn(){}, closePhSheet(){}
  };
  ctx.isPhone = () => ctx.window.innerWidth <= ctx.PHONE_MAX;
  vm.createContext(ctx);
  vm.runInContext(html.match(/function placeForWidth\(\)[\s\S]*?\n\}/)[0], ctx);
  ctx.placeForWidth();
  return { nodes, ctx };
}

test('휴대폰에서는 사람 선택을 상단으로 옮기고 PC에서는 원래 자리로 돌린다', () => {
  const r = runPlace(390);
  assert.equal(r.nodes.ownerPick.parentNode.id, 'phTop');
  r.ctx.window.innerWidth = 1400;
  r.ctx.placeForWidth();
  assert.equal(r.nodes.ownerPick.parentNode.id, 'side');
  assert.equal(r.nodes.docBtn.parentNode.id, 'row2');
});

test('화면 회전 때 배치를 다시 맞춘다', () => {
  assert.match(html, /addEventListener\('resize', placeForWidth\)/);
});
