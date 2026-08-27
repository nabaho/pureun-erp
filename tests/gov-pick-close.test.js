/* 사진첩 고르기 — 창닫기 (대표 지시 2026-08-26)
   "창닫기 표시 있으면 좋겠다"
   "창닫기 눌렀을 경우 직전창으로 돌아가야 한다."

   ★ 「직전 창」은 수정 창이다. 고르기 창은 그 «위»에 뜬다(mbEdit 은 열린 채).
     그래서 닫기는 고르기 창 하나만 닫아야 한다 — 다 닫으면 적던 메모가 날아간다.
   ⚠ Esc 가 열린 창을 전부 닫고 있었다(closeAllOverlays). 그것이 이 지시가
     깨져 있던 자리다. 되돌아가지 않게 이 파일이 못 박는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const GOV = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');

/* 순수 로직만 떠서 돌린다. ⚠ 길이를 못 박아 자르지 않는다 — 표식 사이를 벤다. */
function slice(fromMark, toMark) {
  const a = GOV.indexOf(fromMark);
  const b = GOV.indexOf(toMark);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return GOV.slice(a, b);
}
function run(code, seed) {
  const ctx = Object.assign({}, seed || {});
  vm.createContext(ctx);
  new vm.Script(code).runInContext(ctx);
  return ctx;
}

const CLOSE_ASK = () => run(slice('function pkCloseAsk(', 'function pkTryClose('));
/* ⚠ 끝 표식으로 옆 함수 이름을 쓰면, 그 함수 «이름만» 바뀌어도 깨진다.
   실제로 깨졌다 — openPanelIds 가 openOverlayList 로 바뀌었다.
   여기서 필요한 것은 topOverlay 하나이니 괄호 짝을 세어 그것만 떠 온다. */
const TOP = () => run(pick('function topOverlay('));
function pick(mark){
  const a = GOV.indexOf(mark);
  assert.ok(a > 0, '표식을 못 찾았다: ' + mark);
  let d = 0, j = a;
  for(;;j++){ if(GOV[j] === '{') d++; else if(GOV[j] === '}'){ d--; if(!d){ j++; break; } } }
  return GOV.slice(a, j);
}

/* ── 담은 것이 있으면 한 번 물어본다 ── */

test('담은 사진이 있으면 몇 장인지 짚어서 물어본다', () => {
  const { pkCloseAsk } = CLOSE_ASK();
  assert.strictEqual(pkCloseAsk(3), '담은 3장을 안 넣고 닫습니다. 그래도 닫을까요?');
});

test('담은 것이 없으면 묻지 않는다 — 쓸데없이 한 걸음 늘리지 않는다', () => {
  const { pkCloseAsk } = CLOSE_ASK();
  assert.strictEqual(pkCloseAsk(0), '');
  assert.strictEqual(pkCloseAsk(undefined), '');
  assert.strictEqual(pkCloseAsk(null), '');
});

test('한 장이어도 물어본다 — 한 장이 날아가도 날아간 것이다', () => {
  const { pkCloseAsk } = CLOSE_ASK();
  assert.match(pkCloseAsk(1), /담은 1장/);
});

test('「아니오」면 창이 안 닫힌다', () => {
  const code = slice('function pkCloseAsk(', 'function closePickAll(');
  let closed = false;
  const ctx = run(code, {
    PK: { sel: [1, 2, 3] },
    confirm: () => false,
    closePickAll: () => { closed = true; },
  });
  assert.strictEqual(ctx.pkTryClose(), false);
  assert.strictEqual(closed, false, '아니오 를 눌렀는데 닫히면 안 된다');
});

test('「예」면 고르기 창만 닫는다 — 수정 창은 그대로 남는다', () => {
  const code = slice('function pkCloseAsk(', 'function closePickAll(');
  let closed = false;
  const ctx = run(code, {
    PK: { sel: [1] },
    confirm: () => true,
    closePickAll: () => { closed = true; },
  });
  assert.strictEqual(ctx.pkTryClose(), true);
  assert.strictEqual(closed, true);
});

test('담은 것이 없으면 묻지 않고 바로 닫는다', () => {
  const code = slice('function pkCloseAsk(', 'function closePickAll(');
  let asked = 0, closed = false;
  const ctx = run(code, {
    PK: { sel: [] },
    confirm: () => { asked++; return true; },
    closePickAll: () => { closed = true; },
  });
  assert.strictEqual(ctx.pkTryClose(), true);
  assert.strictEqual(asked, 0, '담은 게 없는데 물어보면 안 된다');
  assert.strictEqual(closed, true);
});

/* ── 직전 창으로 돌아간다 ── */

test('closePickAll 은 고르기 창 하나만 닫는다 — 수정 창을 건드리지 않는다', () => {
  const body = slice('function closePickAll(){', 'function pkPaintChrome(');
  assert.ok(body.includes("closeModal('mbPickAll')"), '고르기 창을 닫아야 한다');
  assert.ok(!/mbEdit|closeAll|\.mb\.open/.test(body),
    '수정 창까지 닫으면 적던 내용이 날아간다');
});

test('✕ 는 「← 수정으로」와 같은 길을 탄다', () => {
  /* 둘이 다른 길로 갈라지면 한쪽만 고쳐진다 */
  assert.ok(GOV.includes('onclick="pkTryClose()"'), '✕ 가 있어야 한다');
  assert.ok(GOV.includes('.pka-x{'), '✕ 모양이 있어야 한다');
  const bar = GOV.slice(GOV.indexOf('<div class="pka-bar1">'), GOV.indexOf('<div class="pka-bar2"'));
  assert.ok(bar.includes('pka-x'), '머리줄 안에 있어야 한다');
  assert.ok(bar.indexOf('pkaQ') < bar.indexOf('pka-x'), '찾기 칸보다 오른쪽이어야 한다');
});

test('✕ 에 「수정 창으로 돌아갑니다」라고 적어 둔다', () => {
  assert.match(GOV, /title="닫기 \(Esc\) — 수정 창으로 돌아갑니다"/);
});

/* ── Esc 는 창 하나만 닫는다 ── */

test('겹친 창 중 층이 높은 것이 맨 위다', () => {
  const { topOverlay } = TOP();
  assert.strictEqual(topOverlay([{ id: 'mbEdit', z: 500 }, { id: 'mbPickAll', z: 560 }]), 'mbPickAll');
  assert.strictEqual(topOverlay([{ id: 'mbPickAll', z: 560 }, { id: 'mbEdit', z: 500 }]), 'mbPickAll');
});

test('층이 같으면 나중에 그린 것이 위다', () => {
  const { topOverlay } = TOP();
  assert.strictEqual(topOverlay([{ id: 'a', z: 500 }, { id: 'b', z: 500 }]), 'b');
});

test('열린 창이 없으면 빈손', () => {
  const { topOverlay } = TOP();
  assert.strictEqual(topOverlay([]), '');
  assert.strictEqual(topOverlay(null), '');
});

test('Esc 가 열린 창을 «전부» 닫지 않는다 — 이 지시가 깨져 있던 자리다', () => {
  const at = GOV.indexOf("if(e.key==='Escape')");
  assert.ok(at > 0, 'Esc 처리를 못 찾았다');
  const near = GOV.slice(at, at + 400);
  assert.ok(near.includes('closeTopOverlay()'), '맨 위 하나만 닫아야 한다');
  assert.ok(!near.includes('closeAllOverlays'), '전부 닫기로 되돌리면 안 된다');
});

test('전부 닫는 함수는 아예 없앴다 — 남겨 두면 언젠가 다시 불린다', () => {
  assert.ok(!/function closeAllOverlays\(/.test(GOV));
});

test('Esc 로 고르기 창을 닫을 때도 담은 것을 물어본다', () => {
  const body = slice('function closeTopOverlay(){', 'function closePanels(){');
  assert.ok(body.includes("if(id === 'mbPickAll'){ pkTryClose(); return true; }"),
    'Esc 로 닫을 때만 안 물어보면 그 길로 사진이 날아간다');
});

test('창이 열려 있으면 옆 패널을 건드리지 않는다', () => {
  const body = slice('function closeTopOverlay(){', 'function closePanels(){');
  const idAt = body.indexOf('if(id){ closeModal(id); return true; }');
  const panelAt = body.indexOf('closePanels()');
  assert.ok(idAt > 0 && panelAt > idAt, 'Esc 한 번은 창 하나여야 한다');
});

test('옆 패널 셋을 다 닫는다 — 하나만 닫고 끝내지 않는다', () => {
  const body = slice('function closePanels(){', 'function initShortcuts(');
  ['#notifPanel', '#shortcutPanel', '#statsPanel'].forEach(sel => {
    assert.ok(body.includes(sel), sel + ' 을 빠뜨렸다');
  });
});

test('로그인 창은 Esc 로 안 닫힌다 — 닫으면 아무것도 못 한다', () => {
  const body = slice('function openOverlayList(){', '/* Esc 한 번 = 창 하나');
  assert.ok(body.includes("o.id !== 'mbLogin'"), '로그인 창은 빼야 한다');
});

test('층을 못 읽어도 안 넘어진다 — 0 으로 보고 이어 간다', () => {
  const body = slice('function openOverlayList(){', '/* Esc 한 번 = 창 하나');
  assert.match(body, /\(z \|\| 0\)/, 'NaN 이 들어가면 맨 위를 못 고른다');
});
