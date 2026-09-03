'use strict';
/* 경력관리 — 휴지통(30일) · 삭제 확인 쪽지 (대표 지시 2026-09-03)
   「삭제시 휴지통 만들어서 30일 보관 필요하다」 / 「삭제 버튼 바로 옆에 팝업 나오게」

   ■ 무슨 일이 있었나
   삭제는 곧바로 «영구»였다. 레코드를 빼고 첨부 원본까지 그 자리에서 지웠고,
   선택 삭제는 확인창에 「되돌릴 수 없습니다」라고 스스로 적어 두었다.
   2026-09-03 대표가 시험하시는 동안 **5건이 사라졌고 되살릴 곳이 없었다**(127→122건).

   ■ 이 검사가 지키는 «규칙» 두 가지
   ① 지우는 자리는 첨부 원본을 «그 자리에서» 지우지 않는다.
      담을 때 원본을 지우면 휴지통이 껍데기가 된다 — 되살려도 원본이 없다.
      원본은 완전삭제·30일 비우기 때만 지운다.
   ② 되살리기는 «덮어쓰지 않는다». 같은 번호가 이미 쓰이고 있으면 새 번호로 넣는다.
      덮어쓰면 되살리기가 «지우는 일»이 된다.

   ■ 일부러 «안» 담는 자리도 지킨다
   신분증(id_docs)은 담지 않는다 — 잠긴 칸의 주민번호가 잠기지 않은 휴지통에
   30일 남는 것은 지우려던 뜻과 정반대다. 「여기도 휴지통으로」 하고 고치는 것을 막는다.

   ⚠ 이 파일은 주석에 deleteFile 같은 «글자»를 담는다. 소스를 글자로 볼 때는
     반드시 주석을 먼저 걷는다 — 안 걷으면 자기 주석 때문에 깨진다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const bare = stripComments(fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8'));

/* 지우는 자리 — 이름과 그 안에서 담아야 할 보관함 */
const 지우는자리 = [
  ['function delRec(', '경력·실적 한 건'],
  ['function careerDelSelected(', '선택 삭제(여러 건)'],
  ['function careerDelAll(', '전체 삭제'],
  ['function dupDel(', '겹침 정리'],
  ['function delDoc(', '서류함'],
  ['function delPersonalDoc(', '개인 서류'],
  ['function delAccount(', '계좌'],
  ['function delGalleryPhoto(', '사진'],
  ['function delStamp(', '도장'],
  ['function cvDelForm(', '이력서 양식'],
];

test('보관 기간이 30일이다', () => {
  assert.match(bare, /TRASH_DAYS\s*=\s*30/,
    '대표 지시는 30일이다.                                    검사고정-허용');
});

지우는자리.forEach(([decl, 이름]) => {
  test('「' + 이름 + '」 삭제는 휴지통에 담는다', () => {
    const fn = cutFn(bare, decl);
    assert.ok(fn, decl + ' 를 찾지 못했다');
    assert.ok(/kcTrashPut\s*\(/.test(fn),
      이름 + ' 이 휴지통에 담지 않는다 — 지우면 되살릴 곳이 없다');
  });
  test('「' + 이름 + '」 삭제는 첨부 원본을 그 자리에서 지우지 않는다', () => {
    const fn = cutFn(bare, decl);
    assert.ok(!/\bdeleteFile\s*\(/.test(fn),
      이름 + ' 이 원본을 곧바로 지운다 — 휴지통이 껍데기가 되어 되살려도 원본이 없다.\n' +
      '    원본은 완전삭제(kcTrashPurge)와 30일 비우기(kcTrashSweep) 때만 지운다.');
  });
  test('「' + 이름 + '」 삭제는 브라우저 확인창을 안 쓴다 (쪽지가 단추 옆에 뜬다)', () => {
    const fn = cutFn(bare, decl);
    assert.ok(!/\bconfirm\s*\(/.test(fn),
      이름 + ' 이 confirm 을 쓴다 — 확인창이 «화면 맨 위»에 떠서 단추와 멀다\n' +
      '    (대표 지시: 「삭제클릭시 버튼이 너무 멀리 있다」).');
    assert.ok(/kcAskDelete\s*\(/.test(fn), 이름 + ' 이 쪽지를 안 띄운다');
  });
});

test('쪽지는 «눌린 단추»를 넘겨받는다 — window.event 로 알아내지 않는다', () => {
  const fn = cutFn(bare, 'function kcAskDelete(');
  assert.ok(fn, 'kcAskDelete 가 없다');
  assert.ok(!/window\.event/.test(bare),
    'window.event 로 단추를 알아내면 브라우저마다 다르고 조용히 엉뚱한 자리에 뜬다 —\n' +
    '    부르는 자리에서 this 를 넘길 것');
  assert.ok(/getBoundingClientRect\s*\(\s*\)/.test(fn),
    '단추 자리를 «실제로 재지» 않으면 «바로 옆»에 띄울 수 없다\n' +
    '    (이름만 있는 것으로는 안 된다 — 안 부르고 0 을 쓰던 판이 검사를 통과했다)');
  /* 잰 자리를 실제로 «쪽지 좌표에» 써야 한다 */
  assert.ok(/style\.top\s*=/.test(fn) && /style\.left\s*=/.test(fn),
    '쪽지의 자리(left·top)를 정하지 않는다');
  assert.ok(/r\.(bottom|top)/.test(fn) && /r\.(right|left)/.test(fn),
    '잰 값을 쪽지 자리에 안 쓴다 — 쪽지가 늘 같은 곳에 뜬다');
  assert.ok(/innerHeight/.test(fn),
    '화면 아래에 걸릴 때 위로 뒤집지 않으면, 표 아래쪽 줄에서 쪽지가 잘린다');
});

test('삭제 단추들이 눌린 단추를 this 로 넘긴다', () => {
  /* 넘기지 않으면 쪽지가 화면 가운데에 떠서 «단추 옆»이 아니게 된다.
     ⚠ assert.match 를 쓰지 않는다 — 실패하면 600KB 짜리 소스를 통째로 찍어
       CI 기록이 쓸모없어진다. ok(re.test(...)) 로 «까닭만» 남긴다. */
  const 부름 = [
    [/delRec\('\$\{store\}','\$\{id\}','\$\{page\}',this\)/, '경력·실적 한 건'],
    [/careerDelSelected\([^)]*,\s*this\)/, '선택 삭제'],
    /* ⚠ [^)]* 로 쓰면 안 된다 — 이 자리는 _jsAttr(r.id) 처럼 «괄호가 든» 값을 넘긴다 */
    [/dupDel\([\s\S]{0,80}?,\s*this\)/, '겹침 정리'],
    [/delPersonalDoc\([^)]*,\s*this\)/, '개인 서류'],
    [/delAccount\([^)]*,\s*this\)/, '계좌'],
    [/delGalleryPhoto\([^)]*,\s*this\)/, '사진'],
    [/delStamp\([^)]*,\s*this\)/, '도장'],
    [/deleteAttach\([^)]*,\s*this\)/, '첨부 원본'],
  ];
  부름.forEach(([re, 이름]) => assert.ok(re.test(bare),
    이름 + ' 단추가 눌린 단추를 안 넘긴다 — 쪽지가 «단추 옆»에 못 뜬다'));

  /* 「this 없이 부르는 삭제 단추」가 남아 있지 않은지 본다.
     ⛔ 아래는 «일부러» 빠진 자리다 — 까닭이 있다:
       delIDDoc·delIDFile : 신분증. 휴지통에 담지 않기로 했다(주민번호가 잠기지 않은
                            자리에 남는다). 그래서 쪽지도 안 쓴다.
       delCustomGrp/Item·delSubmit : 이력서 «안»의 칸이다. 저장 전이고 되살릴 자리도
                            그 서류 안이라 휴지통이 맞지 않는다.
       deleteFileOnly     : 저장공간 관리에서 자리를 비우려고 지우는 것이다. */
  const 예외 = ['delIDDoc', 'delIDFile', 'delCustomGrp', 'delCustomItem', 'delSubmit', 'deleteFileOnly'];
  const 맨손 = (bare.match(/onclick="(del|delete)[A-Za-z]*\([^"]*?\)"/g) || [])
    .filter((x) => !/,\s*this\)/.test(x))
    .filter((x) => !예외.some((n) => x.indexOf('"' + n + '(') >= 0));
  assert.deepEqual(맨손, [],
    '이 삭제 단추들이 눌린 단추를 안 넘긴다 — 쪽지가 단추 옆에 못 뜬다.\n' +
    '    일부러 뺀 자리라면 위 예외 목록에 «까닭과 함께» 넣을 것.');
});

test('한 번에 쪽지 하나 · Esc·바깥·스크롤에 닫힌다', () => {
  const w = cutFn(bare, 'function _kcPopWire(');
  assert.ok(w, '_kcPopWire 가 없다');
  assert.ok(/Escape/.test(w), 'Esc 로 못 닫으면 갇힌다');
  assert.ok(/mousedown/.test(w), '바깥을 눌러도 안 닫히면 갇힌다');
  assert.ok(/scroll/.test(w),
    '스크롤하면 단추가 움직인다 — 안 닫으면 쪽지가 엉뚱한 자리에 남는다');
  const a = cutFn(bare, 'function kcAskDelete(');
  assert.ok(/kcPopClose\s*\(\)/.test(a), '새로 띄울 때 먼저 뜬 쪽지를 안 닫는다');
});

test('되살리기는 덮어쓰지 않는다 — 같은 번호면 새 번호로', () => {
  const r = cutFn(bare, 'async function kcTrashRestore(');
  assert.ok(r, 'kcTrashRestore 가 없다');
  assert.ok(/kcFreeId\s*\(/.test(r),
    '번호가 겹치는지 안 보고 넣으면, 되살리기가 «지금 쓰는 자료를 지우는 일»이 된다');
  const f = cutFn(bare, 'function kcFreeId(');
  assert.ok(f, 'kcFreeId 가 없다');
  assert.ok(/padStart/.test(f),
    '번호 모양(자릿수)을 지켜야 한다 — 위촉장2015-003 다음은 004 다');
});

test('번호가 바뀌면 첨부 원본도 새 번호로 옮긴다', () => {
  const r = cutFn(bare, 'async function kcTrashRestore(');
  assert.ok(/getFileAsync\s*\(/.test(r) && /saveFileUnified\s*\(/.test(r),
    '첨부 원본은 «레코드 번호»로 찾는다(hasOriginal). 번호만 바꾸고 파일을 안 옮기면\n' +
    '    되살린 레코드에 원본이 없다 — 화면에는 「원본없음」으로 보인다');
});

test('30일 비우기는 «지운 때가 있는 것»만 지운다', () => {
  /* 「기한이 지났나」는 한 군데(kcTrashDue)에서만 판단해야 한다.
     ⚠ 두 곳에 적어 두면 한 곳만 고쳐져 «담긴 것은 남고 원본만 지워지는»
       반쪽 상태가 조용히 생긴다 — 실제로 처음 판이 그랬다. */
  const due = cutFn(bare, 'function kcTrashDue(');
  assert.ok(due, 'kcTrashDue 가 없다 — 기한 판단이 흩어져 있다');
  assert.ok(/TRASH_DAYS\s*\*\s*86400000/.test(due), '기한 판단이 30일 기준을 안 쓴다');
  assert.ok(/e\.delAt/.test(due),
    '지운 때가 없는 것까지 «지났다»고 하면, 언제 지웠는지 모르는 것을 없애는 셈이다');
  assert.ok(/!e\.delAt|e\.delAt\s*&&|!e\s*\|\|\s*!e\.delAt/.test(due),
    '지운 때가 없는 것을 «지나지 않은 것»으로 걸러야 한다');

  const sw = cutFn(bare, 'function kcTrashSweep(');
  assert.ok(sw, 'kcTrashSweep 가 없다');
  assert.ok(/deleteFile\s*\(/.test(sw), '비울 때는 첨부 원본까지 지워야 한다');
  assert.ok(!/86400000/.test(sw),
    '비우기 안에 기한 셈을 또 적어 두었다 — kcTrashDue 하나만 쓸 것');
  const 판단횟수 = (sw.match(/kcTrashDue/g) || []).length;
  assert.ok(판단횟수 >= 2,
    '지울 것을 고를 때와 남길 것을 고를 때 «같은» 판단을 써야 한다 (지금 ' + 판단횟수 + '번)');
});

test('완전삭제만이 첨부 원본을 지운다', () => {
  const p = cutFn(bare, 'function kcTrashPurge(');
  assert.ok(p, 'kcTrashPurge 가 없다');
  assert.ok(/deleteFile\s*\(/.test(p), '완전삭제가 원본을 안 지우면 자리가 안 빈다');
  const put = cutFn(bare, 'function kcTrashPut(');
  assert.ok(!/deleteFile\s*\(/.test(put), '담을 때 원본을 지우면 휴지통이 껍데기가 된다');
});

test('화면을 열 때 30일 지난 것을 비운다 (시계로 돌리지 않는다)', () => {
  assert.match(bare, /kcTrashSweep\s*\)?\s*;/,
    '환경설정을 열 때 비우지 않으면 휴지통이 영원히 쌓인다');
  const sw = cutFn(bare, 'function kcTrashSweep(');
  assert.ok(!/setInterval/.test(sw),
    '시계로 돌릴 일이 아니다 — 브라우저 안 자료라 열지 않으면 아무 일도 없는 것이 맞다');
});

test('⛔ 신분증 서류는 «일부러» 휴지통에 담지 않는다', () => {
  const fn = cutFn(bare, 'function delIDDoc(');
  assert.ok(fn, 'delIDDoc 가 없다');
  assert.ok(!/kcTrashPut/.test(fn),
    '신분증·주민번호 서류를 휴지통에 담으면, 잠긴 칸(id_docs)의 자료가 «잠기지 않은»\n' +
    '    평상 칸에 30일 남는다(클라우드로도 올라간다) — 지우려던 뜻과 정반대다.\n' +
    '    「여기도 휴지통으로」 하고 고치지 말 것. 되살릴 수 없는 것이 여기서는 옳다.');
  assert.match(bare, /FB_SKIP=\[[^\]]*'id_docs'/,
    'id_docs 는 클라우드로 올리지 않는 칸이어야 한다 — 같은 까닭이다');
});

test('휴지통 화면이 「남은 기간」을 보여 준다', () => {
  const r = cutFn(bare, 'function renderTrash(');
  assert.ok(r, 'renderTrash 가 없다');
  assert.ok(/kcTrashLeft\s*\(/.test(r),
    '남은 기간을 안 보여 주면 «언제 사라지는지» 알 수 없다 — 이 화면의 핵심 칸이다');
  assert.ok(/D-/.test(r), '남은 날을 D-n 으로 보여 준다');
});

test('휴지통 한 칸은 한 줄이다 (내용과 보관함을 세로로 쌓지 않는다)', () => {
  const r = cutFn(bare, 'function renderTrash(');
  /* CLAUDE.md: 표의 한 칸은 «한 줄»이다 — 자리가 넓으면 절대 두 줄로 만들지 않는다 */
  const 칸들 = r.match(/<td[^>]*>/g) || [];
  assert.ok(칸들.length >= 5, '휴지통 표의 칸을 못 찾았다');
  칸들.forEach((td) => {
    if (/max-width/.test(td)) {
      assert.match(td, /text-overflow:ellipsis/,
        '넓이를 좁히면서 넘침 처리를 안 하면 글자가 두 줄로 쌓인다: ' + td);
    }
  });
});

test('되살리기 알림은 «누를 수 있는» 자리에 뜬다', () => {
  const u = cutFn(bare, 'function kcUndoBar(');
  assert.ok(u, 'kcUndoBar 가 없다');
  assert.ok(/kcUndo/.test(u),
    '#_toast 는 pointer-events:none 이라 단추를 넣어도 눌리지 않는다 — 따로 두어야 한다');
  assert.ok(/kcTrashRestore\s*\(/.test(u), '알림에서 바로 되살릴 수 없으면 창을 옮겨야 한다');
  const css = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
  assert.ok(/#kcUndo\{[^}]*position:fixed/.test(css), '#kcUndo 를 띄우는 자리가 없다');
});
