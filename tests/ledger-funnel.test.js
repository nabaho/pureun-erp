/* 거래내역 깔때기 + 사용액 창 옮기기 (2026-08-18 대표 지시)
   "깔대기 해줘. 필터링해서 정리하면 쉽게 확인할 수 있다고 안내하기.
    캡쳐3 팝업창도 마우스로 움직일수 있게" */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const E = bare(fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8'));
const RAW_E = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const P = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const PB = bare(P);

/* ── 깔때기 ── */

test('상태 칩이 «눌러서» 걸러진다', () => {
  /* 전에는 글자일 뿐이라 「확인 필요 6건」이 83줄 사이에 흩어져 있었다. */
  assert.strictEqual(/setLdStF\(on \? '' : f\[0\]\)/.test(E), true, '칩을 눌러도 안 걸러진다');
  assert.strictEqual(/onClick:function\(\)\{ setLdStF/.test(E), true);
});

test('네 갈래 모두 걸 수 있다', () => {
  const i = E.indexOf('var FN = [');
  const blk = E.slice(i, i + 900);
  ['ready', 'check', 'none', 'done'].forEach(function (k) {
    assert.strictEqual(blk.indexOf("'" + k + "'") >= 0, true, k + ' 갈래를 못 건다');
  });
});

test('★ 세는 것은 «거르기 전» 목록으로 센다', () => {
  /* 거른 뒤에 세면 「확정 가능 56」이 걸러진 수로 줄어 몇 건 남았는지 알 수 없다.
     그래서 거르기는 stCnt·readyRows 계산 «뒤» 에 와야 한다. */
  const cnt = E.indexOf('stCnt[st.state] = (stCnt[st.state]');
  const filt = E.indexOf('if(ldStF) incList = incList.filter(');   // ★ «깔때기» 거르개만 (범위 거르개는 세기 전이 맞다)
  assert.ok(cnt > 0 && filt > 0, '두 자리를 못 찾았다');
  assert.ok(filt > cnt, '거르기가 세기보다 앞에 있다 — 숫자가 흔들린다');
  const ready = E.indexOf('readyRows.push(');
  assert.ok(filt > ready, '거르기가 확정 대상 계산보다 앞에 있다 — 걸러진 것만 확정된다');
});

test('거름이 걸린 것을 «화면이 말한다» — 몇 건 중 몇 건인지', () => {
  /* 걸어 둔 걸 잊고 「왜 안 보이지」 하는 사고를 막는다. */
  assert.strictEqual(/건만 보임 \(전체 '\+ldStFAll\+'\)/.test(E), true, '몇 건만 보이는지 안 말한다');
  assert.strictEqual(/거름 풀기/.test(E), true, '푸는 길이 없다');
  /* 그 단추가 «실제로 나오는지» 도 본다 — 글자만 있고 조건이 false 면 죽은 코드다*/
  const i = E.indexOf('거름 풀기');
  const before = E.slice(Math.max(0, i - 420), i);
  assert.strictEqual(/ldStF && h\('button'/.test(before), true, '푸는 단추가 안 나온다(죽은 코드)');
});

test('걸러 볼 수 있다고 «안내한다»', () => {
  /* 모르면 있는 기능도 없는 기능이다. */
  assert.strictEqual(/칩을 누르면 그 갈래만 모아 봅니다/.test(E), true, '안내가 없다');
  assert.strictEqual(/한 갈래씩 정리하면 훨씬 빠릅니다/.test(E), true, '왜 좋은지 안 말한다');
  // 거름이 이미 걸려 있을 때는 안내를 다시 하지 않는다(잔소리)
  const i = E.indexOf('칩을 누르면 그 갈래만');
  assert.strictEqual(/!ldStF &&/.test(E.slice(Math.max(0, i - 260), i)), true, '걸린 뒤에도 안내가 남는다');
});

/* ── 사용액 창 옮기기 ── */

test('사용액 창 머리가 손잡이다', () => {
  const i = P.indexOf('#billModal .hd{');
  const line = P.slice(i, P.indexOf('\n', i));
  assert.strictEqual(/cursor:grab/.test(line), true, '잡을 수 있다는 표시가 없다');
  assert.strictEqual(/user-select:none/.test(line), true, '끌 때 글자가 선택된다');
  assert.strictEqual(/touch-action:none/.test(line), true, '폰에서 화면이 함께 밀린다');
});

test('머리를 끌면 창이 움직인다', () => {
  assert.strictEqual(/function billDragInit/.test(PB), true, '드래그 장치가 없다');
  const i = PB.indexOf('function billDragInit');
  const fn = PB.slice(i, i + 1300);
  assert.strictEqual(/mousedown/.test(fn) && /mousemove/.test(fn) && /mouseup/.test(fn), true, '마우스를 안 듣는다');
  assert.strictEqual(/touchstart/.test(fn), true, '폰에서 못 옮긴다');
  assert.strictEqual(/translate\(/.test(PB), true, '자리를 옮기지 않는다');
});

test('✕ 를 누를 때는 창이 안 끌린다', () => {
  const i = PB.indexOf('function billDragInit');
  const fn = PB.slice(i, i + 1300);
  assert.strictEqual(/closest\('button'\)/.test(fn), true, '닫기 단추를 눌러도 끌린다');
});

test('★ 닫을 때 «옮긴 자리를 되돌린다»', () => {
  /* 안 되돌리면 다음에 열 때 화면 밖에 열려 「사용액이 안 열린다」가 된다.
     옮겨 둔 것을 사람은 기억하지 못한다. */
  assert.strictEqual(/function billCloseModal\(\)\{[^}]*billDragReset\(\)/.test(PB), true,
    '닫을 때 자리를 안 되돌린다');
  assert.strictEqual(/function billDragReset\(\)\{[^}]*_bdX = 0[^}]*_bdY = 0/.test(PB), true,
    '되돌리기가 실제로 자리를 0 으로 안 만든다');
});

test('팔레트 밖 색을 새로 들이지 않았다', () => {
  /* 깔때기 칩은 이미 쓰던 색만 쓴다 — 새 색을 들이면 팔레트 검사가 막는다. */
  const i = RAW_E.indexOf('var FN = [');
  const blk = RAW_E.slice(i, i + 900);
  const cols = blk.match(/#[0-9a-f]{6}/gi) || [];
  const OK = ['#f0fdf4', '#166534', '#bbf7d0', '#fffbeb', '#d97706', '#fde68a',
    '#fef2f2', '#dc2626', '#fecaca', '#f8fafc', '#94a3b8', '#e2e8f0', '#fff'];
  cols.forEach(function (c) {
    assert.strictEqual(OK.indexOf(c.toLowerCase()) >= 0, true, '새 색이 들어왔다: ' + c);
  });
});
