'use strict';
/* ══════ 회사 표를 «세로로» 맞춘다 (대표 지시 2026-08-30 「열 정리해라」) ══════
   대표님 화면: 상호가 줄마다 들쭉날쭉하고, 「2. 계약해지사업장」이 붙은 줄은
   두 줄로 접혀 줄 높이까지 달랐다.

   까닭은 어제 붙인 📁 폴더 딱지를 «상호 칸 안»에 넣은 것이었다.
     · 상호 뒤에 붙으니 이름 길이마다 딱지 자리가 다르다
     · 폴더 이름이 길면 칸을 넘겨 두 줄이 된다
     · 그래서 이름도, 폴더도, 줄 높이도 세로로 안 맞는다
   딱지를 «제 열»로 뺀다. 그러면 셋 다 저절로 맞는다.

   ★ 여기서 못 박는 것
     ① 폴더가 제 열에 있다 — 상호 칸에는 없다
     ② 그 열도 정렬·거르기가 된다 (다른 열과 같은 결)
     ③ 폴더 이름이 길어도 «한 줄»이다 — 넘치면 …로 자른다
     ④ 열 이름표(thead)와 폭(colgroup)과 값(td)의 개수가 «셋 다 같다» */
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

const CO = { key: 'n메디움', name: '메디움', bizno: '312-81-49225', folder: 'f2',
             cards: [], bizs: [], docs: 1, erp: { type: '자문' }, extra: {} };
const FOLDERS = { f1: { id: 'f1', name: '1. 업체관리' },
                  f2: { id: 'f2', name: '2. 계약해지사업장' } };

function render(co, folders) {
  const b = {
    state: { coSel: {}, coColFilter: {}, coFolder: '', coSort: { key: 'name', dir: 'asc' } },
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    coCares: () => true, coMissing: () => [], coConflictN: () => 0,
    coDisplayName: o => o.name || '', coTagsOf: () => [], coArrow: () => '',
    coOrphanBarHtml: () => '', coQuickFolderBtns: () => '', coSelAll: () => {},
    listNarrowed: () => false, fmtBizno: s => String(s || '')
  };
  if (folders) b._coFolders = folders;
  vm.createContext(b);
  vm.runInContext(fn('coListHtml'), b);
  b.__info = { rows: [co], total: 1, from: 1, page: 0, pages: 1 };
  return vm.runInContext('coListHtml(__info)', b);
}

/* ── ① 폴더가 제 열에 있다 ──────────────────────────────────────── */
test('★ 폴더 딱지가 상호 칸 «밖»에 있다', () => {
  const h = render(CO, FOLDERS);
  const nameCell = h.slice(h.indexOf('class="conm"'), h.indexOf('</td>', h.indexOf('class="conm"')));
  assert.ok(!/class="fd"/.test(nameCell),
    '★ 폴더가 상호 칸 안에 있다 — 이름 길이마다 자리가 달라 세로로 안 맞는다');
  assert.ok(/class="fd"/.test(h), '폴더 딱지가 아예 사라졌다');
});

test('폴더가 없는 회사는 그 칸이 빈다 — 줄이 밀리지 않는다', () => {
  const h = render(Object.assign({}, CO, { folder: '' }), FOLDERS);
  assert.ok(!/class="fd"/.test(h), '빈 딱지가 붙었다');
  const tds = (h.match(/<td/g) || []).length;
  const h2 = render(CO, FOLDERS);
  assert.equal(tds, (h2.match(/<td/g) || []).length,
    '★ 폴더가 없으면 칸 수가 달라진다 — 표가 통째로 밀린다');
});

/* ── ② 머리·폭·값의 개수가 셋 다 같다 ──────────────────────────── */
test('★ 열 이름표·폭·값의 개수가 «셋 다» 같다', () => {
  const h = render(CO, FOLDERS);
  const cols = (h.match(/<col\b/g) || []).length;
  const ths = (h.match(/<th\b/g) || []).length;
  const tds = (h.match(/<td\b/g) || []).length;
  assert.equal(ths, cols, '★ 머리(' + ths + ')와 폭(' + cols + ')이 다르다 — 칸이 밀린다');
  assert.equal(tds, cols, '★ 값(' + tds + ')과 폭(' + cols + ')이 다르다 — 칸이 밀린다');
});

/* ── ③ 그 열도 정렬·거르기가 된다 ─────────────────────────────── */
test('★ 폴더 열도 눌러서 정렬한다', () => {
  const h = render(CO, FOLDERS);
  assert.ok(/coSortBy\('folder'\)/.test(h),
    '★ 폴더로 정렬을 못 한다 — 폴더별로 모아 보려면 옆줄로 나가야 한다');
});

test('폴더 정렬 잣대가 «이름»으로 선다 — 열쇠로 서면 아무 뜻이 없다', () => {
  const at = SRC.indexOf('const CO_SORT');
  assert.ok(at >= 0, 'CO_SORT 를 찾지 못했다');
  const seg = SRC.slice(at, SRC.indexOf('};', at));
  assert.ok(/folder\s*:/.test(seg), '★ 폴더 잣대가 없다 — 눌러도 아무 일이 안 난다');
  assert.ok(/_coFolders/.test(seg.slice(seg.indexOf('folder'))),
    '★ 폴더 «열쇠»로 정렬한다 — f1·f2 순서라 사람 눈에는 뒤죽박죽이다');
});

/* ── ③-2 그 열이 «이름을 담을 만큼» 넓다 ───────────────────────────
   검수 2026-08-30: 폴더 열을 95px 로 두었더니 실제로 이렇게 보였다 —
     📁 1. 업체관리        (필요 92px · 준 것 68px)
     📁 2. 계약해지사업장   (필요 125px · 준 것 68px)
     📁 통합기술보호지원단  (필요 134px · 준 것 68px)
   화면에는 「📁 1. …」 「📁 2. …」 「📁 통합…」으로만 나왔다. 어느 폴더인지 알 수 없으니
   열을 만든 뜻이 없어진다 — 잘리라고 만든 칸이 아니다.
   같은 화면에서 표 오른쪽에는 791px 이 비어 있었다. 아낄 폭이 없어서가 아니었다. */
test('★ 폴더 열이 폴더 이름을 담을 만큼 넓다 — 「2. …」로 잘리면 만든 뜻이 없다', () => {
  const at = SRC.indexOf('<colgroup>', SRC.indexOf('function coListHtml('));
  const seg = SRC.slice(at, SRC.indexOf('</colgroup>', at));
  const w = (seg.match(/width:(\d+)px/g) || []).map(x => Number(x.match(/\d+/)[0]));
  /* [체크, #, 상호, 폴더, …] — 폴더는 넷째다 */
  const folderW = w[3];
  /* 검사고정-허용 161: 쓰이는 폴더 이름 중 가장 긴 「통합기술보호지원단」이 딱지째
     134px 이고(브라우저 실측), 칸의 여백·테두리가 27px 을 먹는다. 134 + 27 = 161 이
     «잘리지 않는 최소»다 — 이 값이 규칙이다(지금 폭이 얼마인가가 아니다).
     ⚠ 150px 로 두었다가 여백을 안 세어 그대로 잘렸다(검수 2026-08-30). */
  assert.ok(folderW >= 161,
    '★ 폴더 열이 ' + folderW + 'px 다 — 여백 27 을 빼면 「통합기술보호지원단」(134px)이 잘린다');
});

/* ── ④ 길어도 한 줄 ────────────────────────────────────────────── */
test('★ 폴더 이름이 길어도 «한 줄»이다', () => {
  const css = SRC.slice(SRC.indexOf('.corow .fd{'), SRC.indexOf('}', SRC.indexOf('.corow .fd{')));
  assert.ok(/nowrap/.test(css),
    '★ 「2. 계약해지사업장」이 두 줄로 접혀 줄 높이가 들쭉날쭉해진다');
  assert.ok(/ellipsis/.test(css), '넘치면 …로 잘라야 옆 칸을 안 밀어낸다');
});

test('긴 이름도 «누르면 그 폴더로» 가는 길은 그대로다', () => {
  const h = render(CO, FOLDERS);
  assert.ok(h.includes("pickCoFolder('" + 'f' + ":f2')"), '폴더로 가는 길이 사라졌다');
  /* ⚠ 표 «전체»에서 stopPropagation 을 찾으면 늘 통과한다 — 네모 칸(selcell)에 이미
     하나 있기 때문이다. 폴더 딱지에서 빼도 안 걸렸다(검수 2026-08-30).
     막아야 하는 것은 «이 딱지»이므로 그 onclick 안만 본다. */
  const fd = h.match(/<span class="fd"[\s\S]*?onclick="([^"]*)"/);
  assert.ok(fd, '폴더 딱지의 손잡이를 찾지 못했다');
  assert.ok(/stopPropagation/.test(fd[1]),
    '★ 폴더를 누르면 상세 패널까지 «함께» 열린다 — 줄 전체에 pickCo 가 걸려 있다');
});
