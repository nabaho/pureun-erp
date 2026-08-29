/* ══════ 걸린 조건은 «늘 보이고 늘 풀린다» (대표 보고 2026-08-29) ══════
   대표님 화면: 「🚪 퇴사자」를 누르니 0건. 그 뒤 전체·자문·급여 어느 탭을 눌러도
   전부 0. 왼쪽 폴더는 6,287.

   까닭은 어제·오늘 넣은 거르개 둘(onlyLeft·onlyClosed)을 «거르개를 관리하는
   자리»에 한 곳도 등록하지 않은 것이었다 —
     · showAllInFolder() (조건 모두 풀기) 가 이 둘을 안 푼다  ← 못 빠져나온 까닭
     · render() 가 단추를 다시 안 칠한다 (눌러야만 켜진 티가 난다)
     · listNarrowed() 가 이 둘을 안 본다
     · narrowLabel() 이 이 둘을 말하지 않는다
   거르개를 새로 만들 때마다 이 네 자리를 따라 고쳐야 한다는 것 자체가 결함이므로,
   단추는 «상태만 뒤집고» 칠하기는 render() 한 곳이 맡게 바꿨다. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 중괄호를 세어 함수 하나를 통째로 떼어 온다 (고정 길이 자르기는 저장소 규칙 위반) */
function fn(name) {
  const at = SRC.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  let i = SRC.indexOf('{', at), d = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (d === 0) return SRC.slice(at, j + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}

function ctx(extra) {
  const state = Object.assign({
    tab: 'card', group: 'all', owner: 'all', vtab: '', erpFilter: '', erpMgr: '',
    region: '', colFilter: {}, groups: {}, views: {}, page: 1, view: 'grid', sel: { a: 1 },
    onlyPhone: false, onlyEmail: false, onlyDup: false, onlyIncomplete: false,
    onlyPrivate: false, onlyLeft: false, onlyClosed: false, q: 'x'
  }, extra || {});
  const painted = {};
  const els = {
    search: { value: '' }, pcSearch: { value: '' },
    leftBtn: { classList: { toggle: (c, on) => { painted.leftBtn = !!on; } } },
    closedBtn: { classList: { toggle: (c, on) => { painted.closedBtn = !!on; } } }
  };
  const box = {
    state, painted, els, rendered: 0,
    $: id => els[id] || null,
    render() { box.rendered++; },
    _syncSearchX() {},
    toast() {}
  };
  vm.createContext(box);
  return box;
}

function run(box, code) { vm.runInContext(code, box); }

/* 딱지 이름표는 한 곳(COND_LABEL)에만 있다. vm 에서는 최상위 const 가 «칸의 값이
   되지 않으므로» var 로 바꿔 실어 준다 — 예전에 이걸 몰라 여러 번 헛돌았다. */
function condLabel() {
  const at = SRC.indexOf('const COND_LABEL');
  assert.ok(at >= 0, 'COND_LABEL 을 찾지 못했다');
  /* ⚠ 「한 줄」로 자르지 않는다. 조건이 늘면서 두 줄이 되자, 둘째 줄에 적힌 조건이
     검사 눈에 «없는 것»이 되어 애먼 자리에서 실패했다(2026-08-29). 선언의 끝(};)까지 읽는다. */
  const end = SRC.indexOf('};', at);
  assert.ok(end > at, 'COND_LABEL 의 끝(};)을 찾지 못했다');
  return SRC.slice(at, end + 2).replace(/^const /, 'var ');
}

/* ── ① 조건 모두 풀기가 «둘 다» 푼다 ───────────────────────────────── */
test('showAllInFolder 가 퇴사자·계약종료도 푼다', () => {
  const box = ctx({ onlyLeft: true, onlyClosed: true, onlyIncomplete: true });
  run(box, fn('showAllInFolder'));
  run(box, 'showAllInFolder()');
  assert.equal(box.state.onlyLeft, false, '퇴사자가 안 풀렸다 — 대표님이 0건에서 못 빠져나온다');
  assert.equal(box.state.onlyClosed, false, '계약종료가 안 풀렸다');
  assert.equal(box.state.onlyIncomplete, false);
});

/* ── ② 도구줄에 거르개 단추가 «없다» (대표 지시 2026-08-29) ──────────
   "명함 사업자에 캡쳐내용 모두 빼라 이부분은 검색할 필요 없다.
    폴더로 분류하거나 탭으로 분류하면 된다."
   조건 자체는 살아 있다(저장한 탭이 쥐고 있다). 단추만 없앤 것이다.
   ⚠ 조건을 «켜는» 단추를 다시 만들 때는 classList 를 직접 만지지 말고 toggleCond 를
     쓸 것 — 그것이 2026-08-29 오전에 겉모습과 상태가 어긋났던 까닭이다. 그 규칙은
     아래 toggleCond 검사가 그대로 지킨다. */
test('★ 도구줄에 거르개 단추가 다시 생기지 않았다', () => {
  const head = SRC.slice(SRC.indexOf('id="pcTools"'), SRC.indexOf('id="pcMgrFilter"'));
  ['incompleteBtn', 'leftBtn', 'closedBtn', 'privateBtn'].forEach(id => {
    assert.ok(head.indexOf('id="' + id + '"') < 0,
      '★ ' + id + ' 이 도구줄에 다시 생겼다 — 대표 지시로 뺀 것이다 '
      + '(분류는 폴더와 탭으로 한다)');
  });
});

test('toggleCond 는 뒤집고 첫 쪽으로 보내고 다시 그린다', () => {
  const box = ctx({ onlyLeft: false, page: 7 });
  run(box, fn('toggleCond'));
  run(box, "toggleCond('onlyLeft')");
  assert.equal(box.state.onlyLeft, true);
  assert.equal(box.state.page, 0, '첫 쪽으로 안 갔다 — 3쪽에서 걸면 빈 화면이 된다');
  assert.equal(box.rendered, 1, '다시 안 그렸다');
  run(box, "toggleCond('onlyLeft')");
  assert.equal(box.state.onlyLeft, false, '두 번 누르면 풀려야 한다');
});

test('clearCond 는 «푸는 쪽»만 한다 — 다시 눌러 켜지면 안 된다', () => {
  const box = ctx({ onlyClosed: false });
  run(box, fn('clearCond'));
  run(box, "clearCond('onlyClosed')");
  assert.equal(box.state.onlyClosed, false, '✕ 가 조건을 «켰다»');
});

/* ── ③ 걸 수 있는 조건은 «하나도 빠짐없이» 딱지에 있다 ─────────────
   단추가 있을 때는 「켜진 단추」가 표시 노릇을 했다. 단추를 뺀 뒤로는 이 딱지가
   «유일한» 표시다 — 여기 빠진 조건은 화면을 조용히 걸러 놓고 아무 말도 안 한다.
   그것이 2026-08-29 오전의 「0건에서 못 빠져나온다」였다.
   ★ 「조건 모두 풀기」(showAllInFolder)가 푸는 것을 «걸 수 있는 조건»의 목록으로 삼는다 —
     사람이 두 곳을 따로 적다 어긋나는 것을 막으려고, 한쪽에서 읽어 다른 쪽을 견준다. */
test('★ showAllInFolder 가 푸는 조건이 모두 딱지에 있다', () => {
  const clears = [...fn('showAllInFolder').matchAll(/state\.(only[A-Za-z]+)\s*=\s*false/g)]
    .map(m => m[1]);
  assert.ok(clears.length >= 4, '푸는 조건을 못 찾았다 (' + clears.length + '개)');
  const labels = condLabel();
  /* onlyPhone·onlyEmail·onlyDup 은 도구줄에 단추가 없던 «옛 폰 전용» 거르개다.
     지금 화면에서 걸 길이 없으므로 딱지를 안 요구한다 — 걸 길이 생기면 그때 넣는다. */
  const 폰전용 = ['onlyPhone', 'onlyEmail', 'onlyDup'];
  clears.filter(k => !폰전용.includes(k)).forEach(k => {
    assert.ok(labels.includes(k + ':'),
      '★ ' + k + ' 은(는) 걸 수 있는데 딱지(COND_LABEL)에 없다 — '
      + '걸려도 아무 말이 없고, 왜 몇 건만 나오는지 알 길이 없다');
  });
});

/* ── ④ 조건 띠 — 걸린 것을 «글로» 보여 주고 ✕ 로 푼다 ───────────── */
test('조건 띠가 걸린 것만 보여 준다', () => {
  const code = condLabel() + '\n' + fn('condChipsHtml');
  let box = ctx({});
  run(box, code);
  assert.equal(vm.runInContext('condChipsHtml()', box), '', '아무 조건도 없는데 띠가 떴다');

  box = ctx({ onlyLeft: true });
  run(box, code);
  const one = vm.runInContext('condChipsHtml()', box);
  assert.ok(one.includes('퇴사자'), '퇴사자 띠가 없다');
  assert.ok(!one.includes('계약종료'), '안 건 조건까지 띠에 나왔다');
  assert.ok(one.includes("clearCond('onlyLeft')"), '✕ 로 풀 길이 없다');

  box = ctx({ onlyLeft: true, onlyClosed: true });
  run(box, code);
  const two = vm.runInContext('condChipsHtml()', box);
  assert.ok(two.includes('퇴사자') && two.includes('계약종료'), '둘 다 걸었는데 하나만 보인다');
});

test('조건 띠를 담당 띠와 «함께» 내보낸다', () => {
  const r = fn('renderPCTable');
  assert.ok(/condChipsHtml\(\)/.test(r), '조건 띠를 안 그린다');
  const at = r.indexOf("$('pcFilters')");
  assert.ok(at >= 0, 'pcFilters 자리를 못 찾았다');
  const seg = r.slice(at, at + 600);
  assert.ok(/condChipsHtml\(\)/.test(seg),
    '조건 띠가 pcFilters 밖에서 만들어진다 — 담당 띠가 걸리면 조건 띠가 사라진다');
});

/* ── ⑤ 좁혀진 상태 판단·설명에도 든다 ─────────────────────────────── */
test('listNarrowed 가 퇴사자·계약종료를 «좁혀진 것»으로 본다', () => {
  const code = fn('listNarrowed');
  [['onlyLeft'], ['onlyClosed']].forEach(([k]) => {
    const box = ctx({ [k]: true });
    run(box, code);
    assert.equal(vm.runInContext('listNarrowed()', box), true,
      k + ' 을 걸었는데 안 좁혀진 것으로 본다 — 「→ N건 모두」 단추가 안 뜬다');
  });
  const box = ctx({});
  run(box, code);
  assert.equal(vm.runInContext('listNarrowed()', box), false, '아무 조건도 없는데 좁혀졌다고 한다');
});

test('narrowLabel 이 퇴사자·계약종료를 말한다', () => {
  const code = condLabel() + '\n' + fn('narrowLabel');
  let box = ctx({ onlyLeft: true });
  run(box, code);
  assert.ok(vm.runInContext('narrowLabel()', box).includes('퇴사자'),
    '무엇을 골랐는지 안 말한다 — 모르고 지우게 된다');
  box = ctx({ onlyClosed: true });
  run(box, code);
  assert.ok(vm.runInContext('narrowLabel()', box).includes('계약종료'));
});
