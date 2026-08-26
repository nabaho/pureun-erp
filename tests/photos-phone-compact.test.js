const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('폰 첫 화면은 작업 상태를 한 줄로 요약한다', () => {
  assert.match(html, /id="phSummaryBtn" onclick="openPhSheet\(\)"/);
  assert.match(html, /id="phSummaryDoc"/);
  assert.match(html, /id="phSummaryOwner"/);
  assert.match(html, /id="phSummaryState"/);
  assert.match(html, /#phTop\{display:block/);
  assert.match(html, /#phSummaryBtn\{[^}]*grid-template-columns:[^}]*minmax\(0,1fr\)/);
  assert.equal((html.match(/id="docInput"/g) || []).length, 1);
});

test('요약을 누르면 사진 작업 시트에서 기존 기능과 상세 진행을 본다', () => {
  assert.match(html, /id="phSheetTitle">사진 작업</);
  assert.match(html, /id="phUpBtn" onclick="phUpload\(\)"/);
  assert.match(html, /id="phCollectBtn" onclick="startCollect\(\)"/);
  assert.match(html, /id="phNeedBtn" onclick="phGoNeed\(\)"/);
  assert.match(html, /id="phOwner"/);
  assert.match(html, /id="phCollectDock"/);
  assert.match(html, /id="phUpDock"/);
  assert.match(html, /function phUpload\(\) \{[\s\S]{0,520}?viewingOnlyOther\(\)[\s\S]{0,520}?const i = \$\('docInput'\)/,
    '모바일 올리기는 특정 다른 직원 화면을 막은 뒤 기존 파일 선택기를 열어야 합니다');
});

function fakeDom() {
  function el(id) {
    return {
      id, parentNode: null, firstChild: null,
      classList: { toggle() {}, add() {}, remove() {} }, focus() {},
      appendChild(c) { c.parentNode = this; },
      /* ⚠ 진짜 브라우저처럼 «남의 자식» 앞에는 못 끼운다 — NotFoundError 를 던진다.
         이걸 흉내 내지 않았더니, 기준 칸이 다른 칸 «안»으로 들어가 버린 것을
         못 잡았다(2026-08-26 에 #findBar 가 #gridBar 안으로 들어갔다). */
      insertBefore(c, ref) {
        if (ref && ref.parentNode !== this) {
          throw new Error('NotFoundError: ' + ref.id + ' 는 ' + this.id + ' 의 자식이 아닙니다');
        }
        c.parentNode = this;
      }
    };
  }
  const ids = ['phoneBar', 'side', 'chipRow', 'docBtn', 'row2', 'needBox', 'oldBox',
    /* gridBar 가 이제 윗줄 전부다 — 모으는 띠를 그 앞에 끼운다(2026-08-26) */
    'upWrap', 'autoNote', 'findBar', 'gridBar', 'q', 'phUpRow', 'phMenuBtn', 'phSheet',
    'ownerPick', 'phTop', 'phOwner', 'collectBar', 'phCollectDock', 'phUpDock',
    'viewPhotos'];
  const nodes = {};
  ids.forEach(id => { nodes[id] = el(id); });
  nodes.docBtn.parentNode = nodes.row2;
  nodes.needBox.parentNode = nodes.side;
  nodes.oldBox.parentNode = nodes.side;
  nodes.ownerPick.parentNode = nodes.side;
  nodes.upWrap.parentNode = nodes.side;
  nodes.autoNote.parentNode = nodes.side;        // 올리기를 되돌릴 때 기준이 되는 칸
  nodes.collectBar.parentNode = nodes.viewPhotos;
  nodes.gridBar.parentNode = nodes.viewPhotos;   // 윗줄 — 모으는 띠가 그 앞에 들어간다
  nodes.findBar.parentNode = nodes.gridBar;      // 찾기는 윗줄 «안»에 있다(2026-08-26)
  return nodes;
}

function runPlace(width, nodes) {
  nodes = nodes || fakeDom();
  const ctx = {
    window: { innerWidth: width, addEventListener() {} }, PHONE_MAX: 820,
    phoneFindOn: false, $: id => nodes[id] || null,
    renderPhNeedBtn() {}, renderPhSummary() {}, closePhSheet() {}
  };
  ctx.isPhone = () => ctx.window.innerWidth <= ctx.PHONE_MAX;
  vm.createContext(ctx);
  vm.runInContext(html.match(/function placeForWidth\(\)[\s\S]*?\n\}/)[0], ctx);
  ctx.placeForWidth();
  return { nodes, ctx };
}

test('폰에서는 사람·문서묶기·업로드 상세를 시트로 옮기고 PC에서 원위치한다', () => {
  const r = runPlace(390);
  assert.equal(r.nodes.ownerPick.parentNode.id, 'phOwner');
  assert.equal(r.nodes.upWrap.parentNode.id, 'phUpDock');
  assert.equal(r.nodes.collectBar.parentNode.id, 'phCollectDock');

  r.ctx.window.innerWidth = 1400;
  r.ctx.placeForWidth();
  assert.equal(r.nodes.ownerPick.parentNode.id, 'side');
  assert.equal(r.nodes.upWrap.parentNode.id, 'side');
  assert.equal(r.nodes.collectBar.parentNode.id, 'viewPhotos');
  assert.equal(r.nodes.docBtn.parentNode.id, 'row2');
});

test('요약 상태는 네 핵심 렌더 경로에서 함께 갱신된다', () => {
  for (const name of ['renderUp', 'renderCollectBar', 'renderPhNeedBtn', 'renderOwnerPick', 'pickOwner']) {
    const block = html.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    assert.ok(block, name + ' 함수를 찾지 못했습니다.');
    assert.match(block[0], /renderPhSummary\(\)/, name + '에서 요약 상태를 갱신해야 합니다.');
  }
  assert.match(html, /addEventListener\('resize', placeForWidth\)/);
});
