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
   단추는 «상태만 뒤집고» 칠하기는 render() 한 곳이 맡게 바꿨다.

   ⚠ 뒷이야기(2026-08-30): 위 거르개 둘(onlyLeft·onlyClosed)은 «없앴다». 단추를 뺀 뒤로
     켤 길이 아예 없어서, 코드만 남고 아무도 못 쓰는 기능이 되어 있었기 때문이다.
     그러나 이 파일이 지키는 «규칙»은 그대로 산다 — 걸린 조건은 늘 보이고 늘 풀린다.
     남은 조건(정보부족·개인)으로 같은 것을 지킨다. 새 거르개를 만들 때도 마찬가지다. */
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
    onlyPrivate: false, q: 'x'
  }, extra || {});
  const painted = {};
  const els = { search: { value: '' }, pcSearch: { value: '' } };
  const box = {
    state, painted, els, rendered: 0,
    $: id => els[id] || null,
    render() { box.rendered++; },
    _syncSearchX() {},
    toast() {},
    /* 띠를 만드는 곳이 공용(condChipHtml)으로 갈리면서 esc 를 쓴다 (2026-08-30, 점검 A3).
       ⚠ 그냥 넘기는 대역을 쓰면 「꺾쇠를 안 내보낸다」가 늘 통과한다 — 진짜처럼 만든다. */
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
test('★ 도구줄에 거르개 단추가 다시 생기지 않았다', () => {
  const head = SRC.slice(SRC.indexOf('id="pcTools"'), SRC.indexOf('id="pcMgrFilter"'));
  ['incompleteBtn', 'leftBtn', 'closedBtn', 'privateBtn'].forEach(id => {
    assert.ok(head.indexOf('id="' + id + '"') < 0,
      '★ ' + id + ' 이 도구줄에 다시 생겼다 — 대표 지시로 뺀 것이다 '
      + '(분류는 폴더와 탭으로 한다)');
  });
});

test('clearCond 는 «푸는 쪽»만 한다 — 다시 눌러 켜지면 안 된다', () => {
  const box = ctx({ onlyPrivate: false });
  run(box, fn('clearCond'));
  run(box, "clearCond('onlyPrivate')");
  assert.equal(box.state.onlyPrivate, false, '✕ 가 조건을 «켰다»');
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

  /* ★ 반대쪽도 본다. 위만 있으면 «푸는 목록에서 하나 빼기»가 그냥 통과한다
     (2026-08-30 고장넣기에서 실제로 샜다) — 그런데 그쪽이 더 큰 사고다.
     딱지에 있는데 안 풀리는 조건은 «걸 수는 있고 풀 수는 없는» 조건이고,
     그것이 2026-08-29 오전의 「0건에서 못 빠져나온다」 그 자체였다. */
  [...labels.matchAll(/(only[A-Za-z]+)\s*:/g)].map(m => m[1]).forEach(k => {
    assert.ok(clears.includes(k),
      '★ ' + k + ' 은(는) 걸리는데 「조건 모두 풀기」가 안 푼다 — '
      + '풀 길 없는 조건은 자료를 잃은 것과 같다. showAllInFolder 에 함께 적을 것');
  });
});

/* ── ④ 조건 띠 — 걸린 것을 «글로» 보여 주고 ✕ 로 푼다 ───────────── */
test('조건 띠가 걸린 것만 보여 준다', () => {
  /* ⚠ 2026-08-30 대표 결정으로 퇴사자·계약종료 거르개를 걷었다. 남은 둘
     (정보부족·개인)로 같은 것을 지킨다 — 지키는 뜻은 그대로다. */
  const code = condLabel() + '\n' + fn('condChipHtml') + '\n' + fn('condChipsHtml');
  let box = ctx({});
  run(box, code);
  assert.equal(vm.runInContext('condChipsHtml()', box), '', '아무 조건도 없는데 띠가 떴다');

  box = ctx({ onlyIncomplete: true });
  run(box, code);
  const one = vm.runInContext('condChipsHtml()', box);
  assert.ok(one.includes('정보부족'), '걸린 조건 띠가 없다');
  assert.ok(!one.includes('개인'), '안 건 조건까지 띠에 나왔다');
  assert.ok(one.includes("clearCond('onlyIncomplete')"), '✕ 로 풀 길이 없다');

  box = ctx({ onlyIncomplete: true, onlyPrivate: true });
  run(box, code);
  const two = vm.runInContext('condChipsHtml()', box);
  assert.ok(two.includes('정보부족') && two.includes('개인'), '둘 다 걸었는데 하나만 보인다');
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
test('★ 딱지에 있는 조건은 listNarrowed 도 «좁혀졌다»고 본다', () => {
  /* 이것이 2026-08-29 의 진짜 결함이었다. 조건은 걸리는데 listNarrowed 가 모르니
     「조건 모두 풀기」 안내가 안 뜨고, 대표님이 0건에서 못 빠져나왔다.
     ★ 딱지 목록에서 읽어 견준다 — 사람이 두 곳을 따로 적다 어긋나는 것을 막는다. */
  const keys = [...condLabel().matchAll(/(only[A-Za-z]+)\s*:/g)].map(m => m[1]);
  assert.ok(keys.length >= 2, '딱지에서 조건을 못 읽었다 (' + keys.length + '개)');
  const nar = fn('listNarrowed');
  keys.forEach(k => {
    assert.ok(nar.includes(k),
      '★ ' + k + ' 이 listNarrowed 에 없다 — 걸어 놓고도 «좁혀지지 않았다»고 여겨 '
      + '「조건 모두 풀기」가 안 뜬다. 0건에서 빠져나올 길이 사라진다');
  });
});

test('★ 좁힘 설명이 한 조건을 «두 번» 말하지 않는다', () => {
  /* ⚠ 실제로 그랬다(2026-08-30, 점검 A2 때 드러났다). 정보부족·개인을 손으로 밀어
     넣는 두 줄이 남아 있는데 이름표 돌기가 또 넣어, 「정보부족 · 정보부족」이 됐다.
     새 조건을 딱지에 더할 때 손으로도 미는 실수가 되풀이되므로 여기서 못 박는다. */
  const box = ctx({ onlyIncomplete: true, onlyPrivate: true, group: 'all', vtab: '', q: '' });
  run(box, condLabel() + '\n' + fn('narrowLabel'));
  const lab = vm.runInContext('narrowLabel()', box);
  const bits = lab.split(' · ');
  assert.deepEqual(bits, [...new Set(bits)],
    '★ 같은 말이 두 번 나온다: ' + lab);
  assert.equal(bits.length, 2, '걸린 조건은 둘인데 ' + bits.length + '개를 말한다: ' + lab);
});

