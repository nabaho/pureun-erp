/* 왜 확인이 필요한가 — 대표 보고 2026-08-10
   "확인필요 3장 클릭했는데 어떻게 하라는 건가. 상황에 대한 판단이 안 선다"

   걸리는 이유가 여섯 가지인데 화면에는 ⚠ 표 하나뿐이었다. 한 장씩 열어 봐야
   무엇을 해야 하는지 알 수 있었다.

   ⚠ 여기서 가장 중요한 것: **needsCheck 와 checkWhy 의 판정 순서가 같아야 한다.**
      어긋나면 「걸린 이유」와 「적힌 이유」가 달라져 엉뚱한 일을 하게 된다.
      그래서 모양이 아니라 **두 함수를 같은 자료로 함께 돌려** 견준다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 두 함수와 그들이 쓰는 것만 떼어 내 돌린다 */
function load() {
  const grab = (re, what) => {
    const m = html.match(re);
    assert.ok(m, what + ' 를 찾지 못했습니다.');
    return m[0];
  };
  const src = [
    'const CARD_KINDS = { card: 1, bizreg: 1 };',
    'const CO_KINDS = { bizreg: 1, sme: 1 };',
    grab(/function readAnyField\([\s\S]*?\n\}/, 'readAnyField'),
    /* ⚠ 2026-08-11 — 업체관리 판정을 coFilledOk 한 곳으로 모았다(filled 가 실시간DB
       에서 사라져 화면이 멎던 사고). **진짜 함수를 함께 넣는다** — 가짜로 두면
       그 판정이 틀려도 아래 「할 일과 이유가 어긋나지 않는다」가 못 잡는다. */
    grab(/function coFilledOk\(read\)[\s\S]*?\n\}/, 'coFilledOk'),
    grab(/function checkWhy\(it\)[\s\S]*?\n\}/, 'checkWhy'),
    grab(/function needsCheck\(it\)[\s\S]*?\n\}/, 'needsCheck')
  ].join('\n');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

const it = (read) => ({ meta: { read } });

/* ── 이유마다 말이 붙는가 ── */
const CASES = [
  ['급여서류', { kind: 'payslip', fields: {} }, /지워/],
  ['판독 실패', { kind: 'card', error: 'AI 응답 없음', fields: {} }, /다시 판독/],
  ['본문이 빈 사진', { kind: 'card', error: '사진 본문을 불러오지 못했습니다', fields: {} }, /비었습니다/],
  ['종류를 못 가림', { kind: 'other', fields: { name: '홍길동' } }, /분류 지정/],
  ['검증에 걸림', { kind: 'bizreg', auto: false, fields: { bizNo: '123' } }, /미덥지/],
  ['명함첩에 아직 안 감', { kind: 'card', auto: true, fields: {} }, /명함첩/],
  ['업체관리에 못 넣음', { kind: 'sme', auto: true, fields: {} }, /업체관리/]
];

for (const [name, read, want] of CASES) {
  test('★ ' + name + ' — 무엇을 해야 하는지 적는다', () => {
    const c = load();
    const photo = it(read);
    assert.equal(vm.runInContext('needsCheck', c)(photo), true, name + ' 이 할 일로 안 잡힙니다.');
    const why = vm.runInContext('checkWhy', c)(photo);
    assert.match(why, want, name + ' 의 설명이 다릅니다: ' + why);
  });
}

/* ── 순서가 어긋나지 않는가 (이 검사가 핵심) ── */
test('★ 할 일이면 반드시 이유가 있고, 할 일이 아니면 이유가 없다', () => {
  const c = load();
  const need = vm.runInContext('needsCheck', c);
  const why = vm.runInContext('checkWhy', c);
  /* 있을 법한 조합을 두루 만들어 둘을 함께 돌린다 */
  const kinds = ['card', 'bizreg', 'sme', 'payslip', 'meeting', 'other'];
  const cases = [];
  for (const kind of kinds) {
    for (const auto of [true, false]) {
      for (const ack of [true, false]) {
        for (const err of ['', '판독 실패']) {
          for (const f of [{}, { name: '홍길동' }]) {
            for (const filed of [null, { id: 'x' }]) {
              cases.push({ kind, auto, ack, error: err, fields: f, filed: filed });
            }
          }
        }
      }
    }
  }
  let checked = 0;
  for (const read of cases) {
    const photo = it(read);
    const n = need(photo), w = why(photo);
    assert.equal(!!w, !!n,
      '어긋났습니다 — 할 일=' + n + ' 인데 이유="' + w + '" (' + JSON.stringify(read) + ')');
    checked++;
  }
  assert.ok(checked > 100, '충분히 훑지 못했습니다: ' + checked);
});

test('읽은 것이 없으면 할 일도 이유도 없다', () => {
  const c = load();
  assert.equal(vm.runInContext('needsCheck', c)({ meta: {} }), false);
  assert.equal(vm.runInContext('checkWhy', c)({ meta: {} }), '');
});

/* ── 화면에 실제로 나오는가 ── */
test('★ 「확인 필요」만 볼 때 칸에 이유가 적힌다', () => {
  assert.ok(/needOnly \? '<span class="wn why">' \+ esc\(checkWhy\(it\)\)/.test(html),
    '평소에는 ⚠ 만, 확인 필요를 볼 때는 이유를 적어야 합니다.');
  assert.ok(/#grid \.cell \.wn\.why\{/.test(html), '이유 줄을 담을 자리가 없습니다.');
});
