'use strict';
// 세금계산서 끌어놓기 · 업체관리 유형 칩 — node --test tests/erp-invoice-drop-cotype.test.js
//
// 왜: ① 「화면 아무 곳에나 끌어다 놓아도 됩니다」라고 써 놓고, 받는 처리는 «칸»에만 걸려 있었다.
//        목록이 짧으면 그 아래 빈 곳은 칸 밖이라 브라우저가 엑셀을 그냥 열어버린다.
//     ② 유형(자문·급여·노조·기금) 세그먼트를 표 머리 깔때기로 옮기면서
//        각각 몇 곳인지 보이지 않게 됐다. 거르는 상태는 그대로 쓰고 건수만 되살린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const FI = app.slice(app.indexOf('function FinanceInvoice(){'), app.indexOf('function InvoiceDetailModal'));
const CM = app.slice(app.indexOf('function CompanyManagement(){'), app.indexOf('function CompanyDetail'));

/* ── ① 세금계산서 끌어놓기 ── */
test('안내문이 빈말이 아니다 — 문서 전체에서 받는다', () => {
  assert.match(FI, /화면 아무 곳에나 끌어다 놓아도 됩니다/, '안내문은 그대로 있어야 한다');
  ["document.addEventListener('dragenter'",
   "document.addEventListener('dragover'",
   "document.addEventListener('dragleave'",
   "document.addEventListener('drop'"].forEach(function(s){
    assert.ok(FI.indexOf(s) >= 0, s + ' 가 있어야 한다');
  });
});

test('화면을 떠나면 청취기를 걷는다 (안 걷으면 다른 화면에서도 받는다)', () => {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(k){
    assert.ok(FI.indexOf("document.removeEventListener('" + k + "'") >= 0, k + ' 걷기');
  });
});

test('칸에 걸린 옛 처리는 지웠다 (두 곳에 걸리면 두 번 올린다)', () => {
  assert.ok(FI.indexOf('onDrop:') < 0, '칸 단위 onDrop 이 남아 있으면 문서 청취기와 함께 두 번 돈다');
  assert.ok(FI.indexOf('onDragOver:') < 0);
  assert.ok(FI.indexOf('onDragLeave:') < 0);
});

test('브라우저가 파일을 열지 못하게 막는다', () => {
  // dragover 에서 preventDefault 를 빼면 놓아도 브라우저가 엑셀을 새 탭에 연다
  const over = FI.slice(FI.indexOf('function over(ev){'), FI.indexOf('function enter(ev){'));
  assert.match(over, /invDragHasFile\(ev\)/);
  assert.match(over, /ev\.preventDefault\(\)/);
});

test('파일이 아닌 것(글자·칸 옮기기)은 받지 않는다', () => {
  const eff = FI.slice(FI.indexOf('var depth = 0;'), FI.indexOf("document.addEventListener('dragenter'"));
  assert.equal((eff.match(/invDragHasFile\(ev\)/g) || []).length, 3, 'over·enter·drop 셋 다 걸러야 한다');
});

test('자식 칸으로 옮겨갈 때 표시가 깜빡이지 않는다', () => {
  // dragleave 는 자식으로 들어갈 때도 뜬다 — 깊이를 세어 창 밖으로 나갈 때만 끈다
  assert.match(FI, /function leave\(\)\{ if\(--depth <= 0\)\{ depth = 0; setInvDrag\(false\); \} \}/);
  assert.match(FI, /function enter\(ev\)\{[^}]*depth\+\+/);
});

test('청취기가 낡은 함수를 쥐지 않는다', () => {
  // useEffect 를 [] 로 한 번만 거니, 그때의 handleInvoiceUpload 를 그대로 쥐면 옛 상태로 저장한다
  assert.match(FI, /var invDropRef = useRef\(null\);/);
  assert.match(FI, /invDropRef\.current = function\(fs\)\{/, '그릴 때마다 새로 담아야 한다');
  assert.match(FI, /if\(invDropRef\.current\) invDropRef\.current\(fs\);/);
});

test('상세 창이 열려 있거나 올리는 중이면 받지 않는다', () => {
  const _s = FI.indexOf('invDropRef.current = function(fs){');
  assert.ok(_s >= 0, '끌어놓기 손을 못 찾았다');
  /* ⚠ 끝은 반드시 «시작점 뒤»에서 찾는다 — 앞에서 찾으면 다른 useEffect 에 걸려
     빈 덩어리를 잘라 오고, 그러면 이 검사는 «아무것도 안 보고» 통과한다. */
  const g = FI.slice(_s, FI.indexOf('  }, []);', _s));
  assert.ok(g.length > 50, '덩어리를 제대로 못 잘랐다 (' + g.length + '자)');
  assert.match(g, /if\(detailModal\) return;/);
  assert.match(g, /uploadState\.status === 'parsing' \|\| uploadState\.status === 'saving'/);
});

test('목록이 짧아도 화면 아래 빈 곳이 받는 칸 안이다', () => {
  /* ⚠ 「150px」 을 글자 그대로 박지 않는다 — 화면 배치가 바뀌면 이 숫자도 바뀌는데,
     그때 깨지는 것은 «기능이 망가져서» 가 아니다. 지킬 것은 «화면 높이만큼 받는 칸이
     있는가» 이지 몇 픽셀을 빼는가가 아니다. */
  const mins = FI.match(/minHeight:'calc\(100vh[^']*\)'/g) || [];
  assert.ok(mins.length >= 1, '받는 칸이 화면 높이를 따라가야 한다');
  // 끌고 있을 때와 아닐 때 «둘 다» 높이를 줘야 한다 (끌기 전부터 칸이 넓어야 놓을 수 있다)
  assert.equal(mins.length, 2, '끌 때·안 끌 때 둘 다 (지금 ' + mins.length + '개)');
});

test('갈고리는 이른 return 뒤에 걸리지 않는다', () => {
  const tops = FI.match(/\n  return[^;]{0,40}/g) || [];
  assert.equal(tops.length, 1, '컴포넌트 몸통의 return 은 하나여야 갈고리 순서가 안 흔들린다');
});

/* ── ② 업체관리 유형 칩 ── */
test('자문·급여·노조·기금 칩이 도구줄에 있다', () => {
  assert.match(CM, /function typeChips\(\)\{/);
  assert.equal((CM.match(/\n *typeChips\(\),/g) || []).length, 2, 'PC·모바일 두 곳 다');
});

test('칩과 표 머리 깔때기가 같은 상태를 쓴다 (따로 놀면 안 된다)', () => {
  const tc = CM.slice(CM.indexOf('function typeChips(){'), CM.indexOf('var moS = useState(false);'));
  assert.match(tc, /var items = cItems\('type'\);/, '건수도 깔때기와 같은 셈법으로');
  assert.match(tc, /var sel = cGet\('type'\);/);
  assert.match(tc, /cSet\('type',/);
  assert.ok(tc.indexOf('useState') < 0, '따로 상태를 두면 깔때기와 어긋난다');
});

test('켜진 칩을 다시 누르면 전체로 돌아온다', () => {
  const tc = CM.slice(CM.indexOf('function typeChips(){'), CM.indexOf('var moS = useState(false);'));
  assert.match(tc, /cSet\('type', \(t\.v === 'all' \|\| on\) \? \[\] : \[t\.v\]\);/);
});

test('거르고 나서 옛 쪽수에 머무르지 않는다', () => {
  const tc = CM.slice(CM.indexOf('function typeChips(){'), CM.indexOf('var moS = useState(false);'));
  assert.match(tc, /if\(pg\.setPage\) pg\.setPage\(1\);/);
});

test('깔때기로 둘 이상 고르면 어느 칩도 켜지지 않는다', () => {
  const tc = CM.slice(CM.indexOf('function typeChips(){'), CM.indexOf('var moS = useState(false);'));
  assert.match(tc, /sel\.length === 1 && sel\[0\] === t\.v/, '한 개일 때만 켠다 — 아니면 거짓말이 된다');
});

test('전체 칩에는 건수를 붙이지 않는다', () => {
  // 유형이 비어 있는 업체는 어느 유형에도 안 세지므로, 합계를 「전체」로 내보이면 행 수와 어긋난다
  const tc = CM.slice(CM.indexOf('function typeChips(){'), CM.indexOf('var moS = useState(false);'));
  assert.match(tc, /var cnt = t\.v === 'all' \? null :/);
  assert.match(tc, /\(cnt === null \? '' : ' ' \+ cnt\)/);
});

test('COMPANY_TYPE_FILTERS 가 다시 쓰인다 (죽은 코드였다)', () => {
  assert.match(CM, /COMPANY_TYPE_FILTERS\.map\(/);
  const opts = app.slice(app.indexOf('var COMPANY_TYPE_FILTERS = ['), app.indexOf('function CompanyManagement(){'));
  ['자문', '급여', '노조', '기금'].forEach(function(t){
    assert.ok(opts.indexOf("v:'" + t + "'") >= 0, t + ' 은 typeCode 와 같은 글자여야 한다');
  });
});
