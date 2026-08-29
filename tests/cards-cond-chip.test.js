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
  return SRC.slice(at, SRC.indexOf('\n', at)).replace(/^const /, 'var ');
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

/* ── ② 단추는 상태만 뒤집는다 — 칠하기는 render 가 한다 ──────────── */
test('도구 단추가 classList 를 직접 만지지 않는다', () => {
  const head = SRC.slice(SRC.indexOf('id="pcTools"'), SRC.indexOf('id="pcMgrFilter"'));
  ['leftBtn', 'closedBtn'].forEach(id => {
    const at = head.indexOf('id="' + id + '"');
    assert.ok(at >= 0, id + ' 단추가 없다');
    const line = head.slice(at, head.indexOf('</button>', at));
    assert.ok(!/classList/.test(line),
      id + ' 이 classList 를 직접 만진다 — 상태와 겉모습이 어긋난다');
    assert.ok(/toggleCond\(/.test(line), id + ' 이 toggleCond 를 안 쓴다');
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

/* ── ③ render 가 단추를 상태대로 다시 칠한다 ──────────────────────── */
test('paintCondBtns 가 상태 그대로 칠한다', () => {
  const box = ctx({ onlyLeft: true, onlyClosed: false });
  run(box, fn('paintCondBtns'));
  run(box, 'paintCondBtns()');
  assert.equal(box.painted.leftBtn, true, '켜진 조건인데 단추가 꺼져 보인다');
  assert.equal(box.painted.closedBtn, false, '안 켠 조건인데 단추가 켜져 보인다');
});

test('표를 그릴 때마다 paintCondBtns 를 부른다', () => {
  const r = fn('renderPCTable');
  assert.ok(/paintCondBtns\(\)/.test(r),
    '단추를 다시 안 칠한다 — 저장된 탭으로 돌아오면 겉모습이 거짓말을 한다');
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
