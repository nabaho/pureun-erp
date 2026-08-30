'use strict';
/* ══════ 회사 줄에 «어느 폴더에 있는지»를 보여 준다 (대표 보고 2026-08-30) ══════
   대표님: 「옮겼다고 하면 데이터가 사라져야되는데 왜 안 사라지나 문제가 뭔가」

   ■ 안 사라지는 것은 «맞다»
     지금 걸린 것은 「🏛 고유번호증」이고 보고 있는 폴더는 「전체」다. 폴더를 옮겨도
     고유번호증인 것은 그대로라 이 목록에 남는 것이 옳다.
     (폴더를 골라 보고 있을 때는 옮기면 그 자리에서 사라진다.)

   ■ 진짜 결함은 «옮겨진 것을 확인할 길이 화면에 없다»는 것
     회사 줄에 탭(🏷)은 나오는데 «폴더»는 아무 데도 안 나온다. 그래서 「옮겼습니다」
     알림만 뜨고 화면은 그대로라, 옮겨진 것인지 안 옮겨진 것인지 알 수가 없다.
     옆줄 폴더를 눌러 세어 보는 수밖에 없었다.

   ★ 여기서 못 박는 것
     ① 폴더에 담긴 회사는 줄에 그 폴더 이름이 보인다 — 옮기면 그 자리에서 바뀐다
     ② 폴더가 없으면 아무것도 안 붙는다 (빈 딱지는 읽을 값이 없다)
     ③ 폴더 이름에 작은따옴표·꺾쇠가 있어도 줄이 깨지지 않는다
     ④ 폴더 목록이 아직 안 실렸어도 표가 그려진다 — 늦게 오는 자료다 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}

const CO = { key: 'n메디움', name: '메디움', bizno: '', folder: 'f1',
             cards: [], bizs: [], docs: 0, erp: null, extra: {} };

/* coListHtml 을 진짜로 돌려 «만들어진 글»을 본다 — 소스를 글자로 보면
   내가 쓴 주석을 코드로 착각한다(2026-08-30 인수인계). */
function render(co, folders) {
  const b = {
    state: { coSel: {}, coColFilter: {}, coFolder: '', coSort: { key: 'name', dir: 'asc' } },
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    coCares: () => true,
    coMissing: () => [],
    coConflictN: () => 0,
    coDisplayName: o => o.name || '',
    coTagsOf: () => [],
    coArrow: () => '',
    coOrphanBarHtml: () => '',
    coSelAll: () => {},
    listNarrowed: () => false,
    coSelectAllMatching: () => {}
  };
  if (folders) b._coFolders = folders;
  vm.createContext(b);
  vm.runInContext(fn('coListHtml'), b);
  b.__info = { rows: [co], total: 1, from: 1, page: 0, pages: 1 };
  return vm.runInContext('coListHtml(__info)', b);
}

/* ── ① 폴더가 줄에 보인다 ────────────────────────────────────────── */
test('★ 폴더에 담긴 회사는 줄에 폴더 이름이 보인다', () => {
  const h = render(CO, { f1: { id: 'f1', name: '1. 업체관리' } });
  assert.ok(h.includes('1. 업체관리'),
    '★ 옮겨도 줄이 그대로라 옮겨진 것인지 알 길이 없다 — 옆줄을 눌러 세는 수밖에 없다');
});

test('폴더가 없으면 아무것도 안 붙는다', () => {
  const h = render(Object.assign({}, CO, { folder: '' }), { f1: { id: 'f1', name: '1. 업체관리' } });
  assert.ok(!h.includes('class="fd"'), '빈 딱지가 붙었다 — 읽을 값이 없다');
});

test('없어진 폴더에 담겨 있으면 아무것도 안 붙는다', () => {
  /* 폴더를 지우면 회사의 folder 값만 남는다 — 그 이름을 지어내면 안 된다 */
  const h = render(CO, { other: { id: 'other', name: '딴 폴더' } });
  assert.ok(!h.includes('class="fd"'), '없는 폴더 이름을 지어냈다');
});

/* ── ② 늦게 오는 자료여도 표가 그려진다 ──────────────────────────── */
test('★ 폴더 목록이 아직 안 실렸어도 표가 그려진다', () => {
  /* _coFolders 는 구독으로 «나중에» 온다(2026-08-30 기준 Store.db.ref(...).on).
     그 전에 표를 그리다 터지면 화면이 통째로 빈다. */
  assert.doesNotThrow(() => render(CO, null),
    '★ 폴더 목록이 없다고 표가 통째로 안 그려진다');
});

/* ── ③ 이름에 든 글자가 줄을 깨뜨리지 않는다 ─────────────────────── */
test("★ 폴더 이름의 작은따옴표·꺾쇠가 줄을 깨뜨리지 않는다", () => {
  const h = render(CO, { f1: { id: 'f1', name: `2. <b>계약'해지</b>` } });
  assert.ok(!h.includes('<b>계약'),
    '★ 폴더 이름의 꺾쇠가 그대로 나갔다 — 줄이 깨지거나 남의 글이 실행된다');
  assert.ok(h.includes('&lt;b&gt;') || h.includes('&#39;'), '이름을 다듬은 흔적이 없다');
});

/* ── ④ 옮기면 그 자리에서 바뀐다 ─────────────────────────────────── */
test('★ 옮긴 뒤 다시 그리면 새 폴더 이름이 나온다', () => {
  const before = render(CO, { f1: { id: 'f1', name: '1. 업체관리' } });
  assert.ok(before.includes('1. 업체관리'));
  const moved = Object.assign({}, CO, { folder: 'f2' });
  const after = render(moved, { f1: { id: 'f1', name: '1. 업체관리' },
                                f2: { id: 'f2', name: '2. 계약해지사업장' } });
  assert.ok(after.includes('2. 계약해지사업장'), '옮겼는데 줄이 안 바뀐다');
  assert.ok(!after.includes('1. 업체관리'), '옛 폴더가 그대로 남았다');
});
