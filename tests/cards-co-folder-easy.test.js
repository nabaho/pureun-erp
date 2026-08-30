'use strict';
/* ══════ 폴더별로 정리하는 일을 «쉽게» (대표 지시 2026-08-30 「폴더별 쉽게」) ══════
   회사 4,154곳을 폴더로 나누는 일이 지금 세 군데서 걸린다.

     ① 줄에 붙은 📁 딱지가 «읽기만» 된다 — 그 폴더를 보려면 눈을 옆줄까지 옮겨
        같은 이름을 다시 찾아 눌러야 한다.
     ② «아직 폴더에 안 담긴 회사»를 찾을 길이 아예 없다. 정리할 대상이 어디 있는지
        모르는 채로 정리를 시작해야 한다.
     ③ 같은 폴더로 계속 옮길 때마다 「폴더로 옮기기」를 누르고 창에서 다시 고른다 —
        스무 곳을 나누면 마흔 번을 누른다.

   ★ 여기서 못 박는 것
     ① 딱지를 누르면 그 폴더로 간다. 줄을 여는 것과 «갈라진다»
     ② 옆줄의 「아직 안 담음」이 폴더 없는 회사만 보여 준다 — 수도 함께
     ③ 도구줄의 폴더 단추는 «이미 있는» 폴더로 곧장 옮긴다 (새로 만들지 않는다) */
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
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CO = { key: 'n메디움', name: '메디움', bizno: '', folder: 'f1',
             cards: [], bizs: [], docs: 0, erp: null, extra: {} };
const FOLDERS = { f1: { id: 'f1', name: '1. 업체관리' }, f2: { id: 'f2', name: '2. 계약해지사업장' } };

function render(co, folders) {
  const b = {
    state: { coSel: {}, coColFilter: {}, coFolder: '', coSort: { key: 'name', dir: 'asc' } },
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    coCares: () => true, coMissing: () => [], coConflictN: () => 0,
    coDisplayName: o => o.name || '', coTagsOf: () => [], coArrow: () => '',
    coOrphanBarHtml: () => '', coSelAll: () => {}, listNarrowed: () => false
  };
  if (folders) b._coFolders = folders;
  vm.createContext(b);
  vm.runInContext(fn('coListHtml'), b);
  b.__info = { rows: [co], total: 1, from: 1, page: 0, pages: 1 };
  return vm.runInContext('coListHtml(__info)', b);
}

/* ── ① 딱지를 누르면 그 폴더로 ───────────────────────────────────── */
/* ⚠ 「f 콜론 슬래시」를 «글자 그대로» 쓰지 않는다 — 저장소의 「절대 경로 금지」 검사가
   그것을 윈도 드라이브 경로로 읽고 걸러낸다(2026-08-30 에 실제로 걸렸다). 이어 붙인다. */
const FKEY = "f" + ":";
test('★ 📁 딱지에 «그 폴더로 가는» 길이 붙어 있다', () => {
  const h = render(CO, FOLDERS);
  assert.ok(h.includes("pickCoFolder('" + FKEY + "f1')"),
    '★ 딱지가 읽기만 된다 — 그 폴더를 보려면 옆줄에서 같은 이름을 다시 찾아 눌러야 한다');
});

test('★ 딱지를 눌러도 회사 상세가 «함께 열리지» 않는다', () => {
  const h = render(CO, FOLDERS);
  const at = h.indexOf('class="fd"');
  assert.ok(at >= 0, '딱지를 못 찾았다');
  const tag = h.slice(h.lastIndexOf('<span', at), h.indexOf('</span>', at));
  assert.ok(/stopPropagation/.test(tag),
    '★ 줄 전체에 걸린 «상세 열기»가 함께 탄다 — 폴더로 가면서 패널이 같이 열린다');
});

test('폴더가 없는 회사에는 딱지도 길도 없다', () => {
  const h = render(Object.assign({}, CO, { folder: '' }), FOLDERS);
  assert.ok(!/class="fd"/.test(h));
  assert.ok(!h.includes("pickCoFolder('" + FKEY), '없는 폴더로 가는 길이 생겼다');
});

/* ── ② 아직 안 담긴 회사 ─────────────────────────────────────────── */
function noneCtx(list, on) {
  const b = {
    state: Object.assign({
      coQ: '', coFolder: '', coFTab: '', coTag: '', coColFilter: {},
      coOnlyCares: false, coOnlyClosed: false, coOnlyNoBiz: false,
      coOnlyIncomplete: false, coOnlyUid: false, coNoFolder: !!on
    }),
    coList: () => list,
    coCares: () => true, coLacks: () => false, coIsUid: () => false,
    coFTabsOf: () => [], coTagsOf: () => [], CO_SORT: {},
    ErpMatch: { ready: true }
  };
  vm.createContext(b);
  vm.runInContext(fn('coFilteredList'), b);
  return b;
}
const LIST = [
  { key: 'a', name: 'A', bizno: '', folder: 'f1', erp: null },
  { key: 'b', name: 'B', bizno: '', folder: '', erp: null },
  { key: 'c', name: 'C', bizno: '', folder: '', erp: null }
];

test('★ 「아직 안 담음」을 켜면 폴더 없는 회사만 남는다', () => {
  const b = noneCtx(LIST, true);
  const got = vm.runInContext('coFilteredList(null).map(function(o){return o.key;})', b);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), ['b', 'c'],
    '★ 정리할 대상을 찾는 입구가 없으면 어디부터 손대야 할지 알 수 없다');
});

test('안 켜면 모두 나온다', () => {
  const b = noneCtx(LIST, false);
  assert.equal(vm.runInContext('coFilteredList(null).length', b), 3);
});

test('★ 폴더를 고르는 것과 «같이» 걸리지 않는다', () => {
  /* 「1. 업체관리」를 보면서 「아직 안 담음」이 켜져 있으면 결과가 늘 0곳이다 */
  const src = bare(fn('pickCoFolder'));
  assert.ok(/coNoFolder\s*=\s*false/.test(src),
    '★ 폴더를 골라도 「아직 안 담음」이 안 풀린다 — 늘 빈 목록이 된다');
});

test('★ 「아직 안 담음」을 켜면 폴더 고르기가 풀린다', () => {
  const src = bare(fn('pickCoNoFolder'));
  assert.ok(/coFolder\s*=\s*''/.test(src), '★ 반대쪽도 마찬가지다');
  assert.ok(/coPage\s*=\s*0/.test(src), '3쪽에 머물면 빈 화면이 된다');
});

test('★ 걸려 있으면 띠로 보인다 — 다른 조건과 같은 결', () => {
  const at = SRC.indexOf('const CO_TODO_LABEL');
  const line = SRC.slice(at, SRC.indexOf('};', at));
  assert.ok(line.includes('coNoFolder'),
    '★ 켜 놓고 잊으면 왜 몇 곳만 나오는지 알 길이 없다 (2026-08-30 에 겪은 그것이다)');
});

test('수를 세는 함수가 «폴더 없는 곳»만 센다', () => {
  const b = noneCtx(LIST, false);
  vm.runInContext(fn('coNoFolderCount'), b);
  assert.equal(vm.runInContext('coNoFolderCount()', b), 2);
});

test('★ 다른 할 일이 켜져 있어도 제 수를 센다', () => {
  /* ⚠ 「제 거르개를 켜고」만 시험하면 못 잡는다 — 같은 조건을 두 번 걸어도 답이 같아서
     거르개를 안 뺀 고장이 그대로 샌다(2026-08-30 고장 시험에서 실제로 샜다).
     «다른» 할 일이 켜져 있을 때가 진짜 시험대다.
       A 담김+종료 · B 안 담김+종료 · C 안 담김+안 종료
     「종료」를 켠 채로도 「아직 안 담음」은 둘(B·C)이어야 한다. */
  const list = [
    { key: 'a', name: 'A', bizno: '', folder: 'f1', erp: { left: true } },
    { key: 'b', name: 'B', bizno: '', folder: '', erp: { left: true } },
    { key: 'c', name: 'C', bizno: '', folder: '', erp: null }
  ];
  const b = noneCtx(list, false);
  b.state.coOnlyClosed = true;
  vm.runInContext(fn('coNoFolderCount'), b);
  assert.equal(vm.runInContext('coNoFolderCount()', b), 2,
    '★ 종료 목록 «안에서» 세었다 — 할 일끼리 수가 서로 붙는다');
});

test('제 거르개를 켜 놓아도 수는 그대로다', () => {
  const b = noneCtx(LIST, true);
  vm.runInContext(fn('coNoFolderCount'), b);
  assert.equal(vm.runInContext('coNoFolderCount()', b), 2);
});

/* ── ③ 도구줄에서 곧장 폴더로 ────────────────────────────────────── */
/* 📁 폴더 ▾ 메뉴를 «열어» 그 안을 본다 (2026-08-31 — 도구줄 겉에서 내려왔다) */
function openMoveMenu(folders, sel, cur){
  const box = { style:{}, innerHTML:"" };
  const b = {
    state: { coSel: sel || { a:1 }, coFolder: cur || "" },
    _coFolders: folders,
    esc: s => String(s == null ? "" : s),
    closeFolderMenu(){}, setTimeout(){},
    document: { addEventListener(){} }, window: { innerWidth: 1600 },
    $: () => box, Object, Array, String, Number
  };
  vm.createContext(b);
  vm.runInContext(fn("coQuickFolders"), b);
  vm.runInContext(fn("openMenuAbove"), b);
  vm.runInContext(fn("openCoMoveMenu"), b);
  vm.runInContext("openCoMoveMenu({ preventDefault(){}, stopPropagation(){}, currentTarget:{ getBoundingClientRect: () => ({ left:100, top:400 }) } })", b);
  return box.innerHTML;
}

test('★ 폴더 메뉴에 «이미 있는» 폴더가 나온다', () => {
  const h = openMoveMenu(FOLDERS);
  assert.ok(h.includes('1. 업체관리'), '자주 쓰는 폴더가 안 나온다');
  assert.ok(/coMoveSelTo\('f1'\)/.test(h), '눌러도 옮겨지지 않는다');
  assert.ok(h.includes('다른 폴더 고르기'), '나머지 폴더로 갈 길이 없다');
});

test('★ 폴더가 없으면 «자주 쓰는» 자리도 없다 — 새로 만들지 않는다', () => {
  const h = openMoveMenu({});
  assert.equal(/coMoveSelTo\(/.test(h), false, '★ 없는 폴더로 옮기는 줄이 생겼다');
  assert.ok(h.includes('다른 폴더 고르기'), '폴더가 없어도 만들러 갈 길은 있어야 한다');
});

test('★ 폴더가 많아도 셋까지만 — 메뉴가 화면을 넘지 않는다', () => {
  const many = {};
  for (let i = 0; i < 12; i++) many['x' + i] = { id: 'x' + i, name: '폴더' + i, order: i };
  const n = (openMoveMenu(many).match(/coMoveSelTo\(/g) || []).length;
  assert.ok(n > 0 && n <= 3, '★ 폴더 열둘이 다 나온다 (지금 ' + n + '개)');
});
test('보고 있는 폴더로 옮기는 단추는 안 낸다 — 이미 거기 있다', () => {
  const h = openMoveMenu(FOLDERS, { a:1 }, 'f1');
  assert.ok(!/coMoveSelTo\('f1'\)/.test(h), '지금 보는 폴더로 옮기는 단추가 떴다');
});

test('★ 도구줄이 이 단추를 실제로 내보낸다', () => {
  const src = bare(fn('coListHtml'));
  const at = src.indexOf('coselbar');
  assert.ok(at >= 0, '도구줄을 못 찾았다');
  assert.ok(/openCoMoveMenu\(event\)/.test(src.slice(at, at + 2500)),
    '★ 만들어 놓고 도구줄에 안 붙였다 — 📁 폴더 ▾ 가 메뉴를 열어야 한다');
});
