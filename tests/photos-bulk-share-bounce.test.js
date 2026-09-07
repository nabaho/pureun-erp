'use strict';
/* 김동현 제보 · 대표 보고 2026-09-03 — 사진첩에서 일괄 작업을 하다 생긴 것 셋

   "일괄 선택하여 담당자 지정 시 화면과 같이 사진이 깨지게 되며, 담당자에게 공유가
    제대로 되지 않습니다(또한 초기 플랫폼 화면으로 튕겨서 돌아가게 됩니다).
    일괄적으로 사진을 선택하여 다른 사람에게 열어줄 수 있는 방식이었으면 좋겠습니다."

   ① 사진이 깨진다  — 업체 이름을 달자 서류 칸이 통째로 26px 띠 카드가 됐다.
   ② 공유가 안 된다 — 담당자를 못 찾으면 «아무 말 없이» 끝났다.
   ③ 튕긴다        — 돌아갈 곳(camReturnTo)이 세션 내내 살아 있었다.
   ④ 일괄 공유 길  — 있는데 폰에서는 ☰ 시트 안에 있어 «없는 것»으로 보였다.

   실행: node --test tests/photos-bulk-share-bounce.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const app = stripComments(raw);

/* ══════ ③ 튕김 — 가장 아픈 것 ══════ */

test('★★ 카메라를 닫으면 «돌아갈 곳»도 함께 버린다 — 안 버리면 한참 뒤에 튕긴다', () => {
  const fn = stripComments(cutFn(raw, 'function closeCam('));
  assert.match(fn, /camReturnTo = ''/,
    '★★ 돌아갈 곳이 세션 내내 남습니다.\n' +
    '  포털 📷 로 들어온 뒤 한참 사진첩에서 일하다가, 아무 때나 카메라로 한 장 찍으면\n' +
    '  그 순간 푸른 토탈서비스로 나가 버립니다 — 「갑자기 튕긴다」가 그것입니다.');
});

test('★★ «그만두고 닫을 때»는 안 돌아간다 — 뒤로가기 한 번에 두 번 움직이면 안 된다', () => {
  const fn = stripComments(cutFn(raw, 'function closeCam('));
  assert.ok(!/camGoBack\(\)/.test(fn),
    '★★ 닫기에서 돌려보내면, 폰 뒤로가기로 카메라를 닫은 사람이\n' +
    '  사진첩 밖으로 튕겨 나갑니다(뒤로가기는 이미 한 걸음 갔습니다).');
});

test('★ 돌려보내는 것은 «다 올린 뒤» 그 한 자리뿐이다 — 그것까지 없애면 포털 촬영이 안 돌아온다', () => {
  assert.match(app, /if \(camReturnTo\) \{ camDiscard\(\); camGoBack\(\); \}/,
    '★ 찍어서 다 올린 뒤 온 곳으로 돌아가는 길은 남아 있어야 합니다.');
});

test('★ 카메라가 «안 열렸을 때»도 돌아갈 곳을 버린다 — 권한 거부가 나중에 튕김이 된다', () => {
  const fn = stripComments(cutFn(raw, 'function camFail('));
  assert.match(fn, /camReturnTo = ''/,
    '★ 권한 거부로 못 열었는데 주소가 남으면, 나중에 찍은 한 장이 사람을 내보냅니다.');
});

/* ══════ ① 사진이 깨진다 ══════ */

test('★★ 업체 이름만으로는 사진을 접지 않는다 — 카드는 «제목»이 있을 때만', () => {
  const fn = cutFn(raw, 'function renderGrid(');
  const m = fn.match(/if \(it\.meta\.kind === 'doc' && (.+?)\) \{/);
  assert.ok(m, '★ 서류를 카드로 가르는 줄을 못 찾았습니다');
  assert.match(m[1], /docTitle\(it\)/,
    '★★ 업체 이름만 달아도 카드로 뒤집힙니다.\n' +
    '  업체를 한 번에 지정하는 순간 고른 사진이 통째로 26px 띠가 됩니다 —\n' +
    '  제보의 「사진이 깨진다」가 그것입니다. 업체 이름은 무슨 서류인지를\n' +
    '  하나도 안 알려 주면서 사진만 가립니다.');
});

/* ══════ ② 공유가 안 된다 — 조용한 실패 ══════ */

test('★★ 담당자를 못 찾으면 «말한다» — 조용히 끝나면 보낸 줄 안다', () => {
  const fn = stripComments(cutFn(raw, 'function autoShareByCo('));
  const head = fn.slice(0, fn.indexOf('const uids'));
  assert.match(head, /toast\(/,
    '★★ 업체를 못 찾았는데 아무 말이 없습니다.\n' +
    '  화면에는 「🏢 28장에 … 을 달았습니다」만 뜨므로 사람은 담당자에게도\n' +
    '  열린 줄 압니다. **못 한 일을 말하지 않는 것은 안 한 것보다 나쁩니다.**');
  assert.ok(!/if \(!m\) return;/.test(head),
    '★★ 못 찾았을 때 말없이 돌아서는 줄이 남아 있습니다.');
});

test('★ 담당자가 «없는 것»과 «로그인 안 한 것»을 갈라 말한다 — 손쓰는 데가 다르다', () => {
  const fn = stripComments(cutFn(raw, 'function autoShareByCo('));
  const noUid = fn.slice(fn.indexOf('if (!uids.length)'));
  assert.match(noUid.slice(0, 400), /noAcct/,
    '★ 로그인 안 한 담당자는 그 사람이 한 번 들어오면 됩니다.');
  /* ⚠ 「업체관리」 한 낱말만 보면 아래쪽 다른 글월에도 걸려 돌연변이가 살아남았다 —
     이 갈래가 «담당자가 없다»고 실제로 말하는지 본다. */
  assert.match(noUid.slice(0, 400), /지정돼 있지 않습니다/,
    '★ 담당자 칸이 비어 있는 것은 «업체관리에서 정해야» 하는 일입니다.\n' +
    '  로그인 안 한 담당자와 손쓰는 데가 다르므로, 갈라 말하지 않으면\n' +
    '  사람이 엉뚱한 데를 뒤집니다.');
});

/* ══════ ⑤ 직원이 넘기는 길 (대표 보고 2026-09-03 「여전히 쉽지 않다」) ══════ */

test('★★ 손댈 수 «없어도» 넘길 수 있으면 센다 — 되전달이 그것이다', () => {
  const fn = stripComments(cutFn(raw, 'function shareableSel('));
  assert.match(fn, /filter\(mayShare\)/,
    '★★ mayTouch 로 세면 직원이 «받은 사진»을 고를 때 공유 칸이 통째로 안 뜹니다.\n' +
    '  규칙과 openSharePeople 은 되전달(㉮ 2026-08-30)을 허용하는데\n' +
    '  단추만 잠겨 있는 셈입니다 — 2026-08-28 과 같은 모양, 반대 방향입니다.');
});

test('★★ 한 장이라도 못 넘긴다고 «통째로» 거절하지 않는다', () => {
  const fn = stripComments(cutFn(raw, 'function openSharePeople('));
  const head = fn.slice(0, fn.indexOf('const shared'));
  assert.match(head, /if \(!can\.length\)/,
    '★★ 「☑ 전부」로 스물여덟 장을 고르면 받은 사진이나 민감 서류가 한 장쯤 섞입니다.\n' +
    '  그 한 장 때문에 나머지 스물일곱 장도 못 넘기면, 사람은 「공유가 안 된다」고만\n' +
    '  느낍니다 — 하나도 못 넘길 때만 거절해야 합니다.');
  assert.ok(!/can\.length !== list\.length/.test(head),
    '★★ 섞이면 거절하는 줄이 남아 있습니다.');
});

test('★★ 고르개가 «넘길 수 있는 것»을 든다 — 못 넘길 것까지 들면 그 장에서 실패한다', () => {
  const fn = stripComments(cutFn(raw, 'function openSharePeople('));
  assert.match(fn, /_sharePick = \{ ids: can,/,
    '★★ 고른 것 전부를 들면, 못 넘기는 장에서 서버가 막아 「몇 장은 열지 못했습니다」가 뜹니다.');
  assert.match(fn, /skipped: skipped/, '★ 몇 장이 빠졌는지 들고 있어야 말해 줄 수 있습니다');
});

test('★★ 빠진 장이 있으면 «왜» 빠졌는지 고르개에 적는다', () => {
  const fn = stripComments(cutFn(raw, 'function sharePeopleHtml('));
  /* ⚠ 「p.skipped 가 어딘가 적혀 있나」만 보면 if (false) 로 꺼도 안 걸린다
     (돌연변이가 살아남아 드러났다) — «그 값이 조건»인지를 본다. */
  assert.match(fn, /if \(p\.skipped\)/,
    '★★ 조용히 빼면 사람은 스물여덟 장이 다 간 줄 압니다 — 그것이 이번 제보의 핵심입니다.');
  assert.match(fn, /되전달/, '★ 왜 빠졌는지(열려 있지 않음·민감)를 말해야 합니다');
});

test('★ 고를 사람이 없을 때 «무엇을 하면 되는지» 말한다', () => {
  const fn = stripComments(cutFn(raw, 'function openSharePeople('));
  const i = fn.indexOf('if (!others.length)');
  assert.ok(i > 0, '★ 고를 사람이 없을 때를 안 봅니다');
  const msg = fn.slice(i, i + 400);
  /* ⚠ 안내 «문장»을 글자로 박지 않는다 — 2026-09-07 명단을 넓히자(사진첩을 연 사람
     → 로그인한 재직 직원 전부) 이 검사가 **기능이 좋아졌는데** 깨졌다.
     못 박을 것은 두 가지다: ① 누가 고를 수 있는지 ② 없는 사람은 무엇을 하면 뜨는지.
     그 둘이 있으면 「고장인가?」가 「그분더러 그것을 하시라」로 바뀐다. */
  assert.match(msg, /고를 수 있습니다/,
    '★ 「고를 사람이 없습니다」로 끝내면 사람은 고장으로 읽습니다 —\n' +
    '  «누가» 고를 수 있는 명단인지를 먼저 말해야 합니다.');
  assert.match(msg, /목록에 뜹니다/,
    '★ 없는 사람을 «어떻게 하면» 목록에 세우는지가 빠졌습니다 —\n' +
    '  그 한 줄이 있어야 사람이 다음에 할 일을 압니다.');
});

/* ══════ ④ 일괄 공유로 가는 길 ══════ */

test('★★ 폰 도구줄에 «공유로 가는 길»이 있다 — 없으면 한 장씩 여는 수밖에 없다', () => {
  assert.match(app, /id="shareJumpBtn"[^>]*onclick="shareFromBar\(\)"/,
    '★★ 사진을 고른 사람 눈앞(도구줄)에 공유가 없습니다.\n' +
    '  폰에는 왼쪽 대시보드가 없어 그 칸이 ☰ 시트 안으로 들어갑니다 —\n' +
    '  제보자가 「개별 사진을 눌러 열어주기 방식만 가능」이라 한 까닭입니다.');
});

test('★★ 고르개를 «새로 만들지 않는다» — 두 자리가 되면 한쪽만 고쳐진다', () => {
  const fn = stripComments(cutFn(raw, 'function shareFromBar('));
  assert.match(fn, /openShareMany\(\)/,
    '★★ 길잡이 단추가 제자리의 그 고르개를 열어야 합니다 — 목록이 두 벌이 되면 안 됩니다.');
  assert.ok(!/sharePeopleHtml|innerHTML/.test(fn),
    '★★ 길잡이가 제 목록을 그리고 있습니다 — 고르개가 둘이 되었습니다.');
});

test('★ 폰에서는 시트를 «먼저 열고» 나서 편다 — 순서가 바뀌면 열자마자 사라진다', () => {
  const fn = stripComments(cutFn(raw, 'function shareFromBar('));
  const i = fn.indexOf('openPhSheet()');
  assert.ok(i > 0, '★ 폰에서 시트를 안 엽니다 — 고르개가 시트 안에 있습니다.');
  assert.match(fn.slice(i), /setTimeout\(/,
    '★ 시트를 여는 일이 shareCard 를 다른 부모로 «옮깁니다».\n' +
    '  옮기기 전에 펴면 열자마자 끌려가 화면에서 사라집니다.');
});

test('★ 이미 펴져 있으면 다시 접지 않는다 — 시트가 열린 순간 눈앞에서 닫히면 안 된다', () => {
  const fn = stripComments(cutFn(raw, 'function shareFromBar('));
  assert.match(fn, /_sharePick && _sharePick\.host === 'sharePickBox'/,
    '★ openShareMany 는 같은 칸이면 «토글»입니다 — 그대로 부르면 접힙니다.');
});

test('★★ 길잡이 단추는 도구줄과 «같은 셈»으로 나온다 — 갈리면 눌러도 아무 일이 없다', () => {
  const fn = stripComments(cutFn(raw, 'function renderGridBar('));
  const m = fn.match(/\$\('shareJumpBtn'\)\.style\.display = ([^;]+);/);
  assert.ok(m, '★ 도구줄이 길잡이 단추를 안 정합니다');
  /* ⚠ 2026-09-03(둘째) — 기준이 touch 에서 «넘길 수 있는 것»(shareIds)으로 바뀌었다.
     touch 로 물으면 받은 사진을 넘기는 길이 화면에서 사라진다(되전달 ㉮). */
  assert.match(m[1], /shareIds\.length/,
    '★★ 위 shareCard 와 다른 셈을 씁니다 — 도구줄엔 단추가 있는데 시트엔 칸이 없게 됩니다');
  assert.ok(!/\btouch\b/.test(m[1]),
    '★★ mayTouch 로 물으면 받은 사진을 넘기는 길이 화면에서 사라집니다');
  assert.match(m[1], /isPhone\(\)/,
    '★ 넓은 화면에서는 대시보드가 바로 옆에 보입니다 — 거기서 단추가 둘이 되면\n' +
    '  그때야말로 「두 자리」가 됩니다.');
});
