/* ✏️ 글자·도형 — 요금 0원 (대표 지시 2026-08-29 「3단계」)
   검토 문서 docs/사진편집-라이브러리-검토.md 의 3단계.

   ■ 왜 남의 것(fabric)을 쓰나
   끌어 옮기기·모서리로 크기 조절·돌리기·글자를 그 자리에서 고치기는 손으로 만들면
   손잡이 여덟과 맞히기 셈을 한 벌 더 갖게 된다. **여기가 라이브러리가 값어치를 하는
   자리**라고 검토에서 적었고, 그대로 했다.

   ■ 이 검사가 지키는 것 다섯
     ① 요금이 안 든다는 것이 화면에 보인다(요금 드는 갈래는 여전히 «하나뿐»)
     ② **우리 사본을 먼저** 쓰고 **쓸 때만** 받는다(292KB — 안 쓰는 사람은 한 글자도 안 받는다)
     ③ ★ **fabric 의 「저장」을 안 쓴다** — 그린 것을 얹은 그림만 받아 우리 저장 층으로
     ④ ★ **원본 크기로 다시 그려** 받는다(배수) — 화면 크기로 받아 늘리면 글자가 흐려진다
     ⑤ 도구를 바꾸거나 창을 닫으면 판을 걷는다

   ■ 브라우저에서 실제로 돌려 본 값 (2026-08-29)
     판 669×502 · 사진이 배경 ✅ · 3개 넣음 · 나온 사진 **2000×1500**(원본 그대로)
     색 가짓수 556(단색 원본에서 — 실제로 그려졌다) · 원본은 그대로 들고 있다 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ── ① 요금 ── */

test('★★ 글자·도형은 «0원»이다 — 요금 드는 갈래는 여전히 하나뿐', () => {
  const modes = vm.runInNewContext(APP.match(/const ED_MODES = \[[\s\S]*?\];/)[0] + '\nED_MODES;', {});
  assert.equal(modes.length, 4, '★ 도구가 넷이어야 합니다');
  const mark = modes.filter(function (m) { return m.k === 'mark'; })[0];
  assert.ok(mark, '★★ 글자·도형 갈래가 없습니다');
  assert.equal(mark.pay, false, '★★ 0원인데 요금이 드는 것으로 적혀 있습니다');
  assert.equal(modes.filter(function (m) { return m.pay; }).length, 1,
    '★★ 요금이 드는 갈래가 늘었습니다 — 헛돈이 나갑니다');
  const fn = cutFn(APP, 'function edPanelHtml(');
  assert.match(fn, /✏️ 이대로 넣기 \(요금 없음\)/, '★ 단추에 0원이라고 안 적혀 있습니다');
});

/* ── ② 우리 사본 먼저 · 쓸 때만 ── */

test('★★ 글자·도형 도구도 «우리 사본»을 먼저 쓴다 — 방화벽이 cdnjs 를 막는다', () => {
  assert.match(APP, /const FAB_LIB_HERE = 'vendor\/fabric\.min\.js';/);
  const fn = cutFn(APP, 'async function loadFabricLib(');
  assert.ok(fn.indexOf('FAB_LIB_HERE') < fn.indexOf('FAB_LIB_CDN'),
    '★★ 바깥(cdnjs)을 먼저 봅니다 — 막히면 글자 넣기가 통째로 멎습니다');
  assert.match(fn, /FAB_LIB_CDN/, '★ 물러설 곳이 없으면 우리 사본이 깨졌을 때 끝입니다');
  assert.match(fn, /if \(window\.fabric\) return window\.fabric;/, '★ 받아 놓고 또 받습니다');
  const js = path.join(R, 'vendor', 'fabric.min.js');
  assert.ok(fs.existsSync(js), '★★ vendor/fabric.min.js 가 없습니다 — 우리 사본 길이 헛말입니다');
  /* ⚠ 이 파일에는 허가 표시가 «안 들어 있다» — 그래서 따로 넣었다.
     남의 코드를 저장소에 담으면서 허가문을 안 남기면 안 된다. */
  const lic = path.join(R, 'vendor', 'fabric-LICENSE');
  assert.ok(fs.existsSync(lic), '★★ fabric 허가문이 없습니다 — 남의 코드를 담았으면 남겨야 합니다');
  assert.match(fs.readFileSync(lic, 'utf8'), /MIT License/);
});

test('★★ «쓸 때만» 받는다 — 292KB 를 안 쓰는 사람이 매번 받으면 안 된다', () => {
  /* ⚠ 「fabric 이라는 낱말이 머리말에 있나」로 보면 안 된다 — 꾸밈 주석에도 그 낱말이
     있어 헛울린다(실제로 걸렸다). **처음부터 받는 자리**, 곧 script/link 태그를 본다. */
  const head = APP.slice(0, APP.indexOf('</head>'));
  const eager = (head.match(/<(?:script|link)[^>]*(?:src|href)="[^"]*fabric[^"]*"/g) || []);
  assert.deepEqual(eager, [],
    '★★ 글자 도구를 머리말에 박아 두었습니다 — 안 쓰는 사람도 292KB 를 매번 받습니다');
  assert.match(cutFn(APP, 'async function edMarkStart('), /await loadFabricLib\(\)/,
    '★ 글자·도형으로 들어갈 때 받아야 합니다');
  /* 크기가 갑자기 커지지 않았는지 — 통짜 편집기를 넣은 것 아닌가 */
  const kb = fs.statSync(path.join(R, 'vendor', 'fabric.min.js')).size / 1024;
  assert.ok(kb < 400, '★ 도구가 ' + Math.round(kb) + 'KB 입니다 — 통짜 편집기를 넣은 것 아닙니까');
});

/* ── ③ 라이브러리의 「저장」을 안 쓴다 ── */

test('★★ fabric 의 «저장»을 안 쓴다 — 우리 저장 층으로만 담는다', () => {
  const fn = cutFn(APP, 'async function edMarkApply(');
  assert.match(fn, /photoEd\.done = \{/, '★★ 결과를 우리 걸음으로 안 넘깁니다');
  ['savePhoto', 'replaceImage', 'download'].forEach(function (w) {
    assert.ok(fn.indexOf(w) < 0,
      '★★ 글자·도형이 «제멋대로» 담습니다(' + w + ') — 원본 보존·손댐 기록이 빠집니다');
  });
  assert.match(fn, /how: 'mark'/, '★ 무엇으로 고쳤는지 안 가립니다');
  assert.match(fn, /want: '글자·도형 ' \+ n \+ '개 넣기'/, '★ 무엇을 했는지 안 남깁니다');
});

/* ── ④ 원본 크기로 또렷하게 ── */

test('★★ «원본 크기로 다시 그려» 받는다 — 화면 크기로 받아 늘리면 글자가 흐려진다', () => {
  const fn = cutFn(APP, 'async function edMarkApply(');
  assert.match(fn, /const mult = im\.naturalWidth \/ \(photoEd\.markW \|\| edFab\.getWidth\(\) \|\| 1\);/,
    '★★ 배수를 안 셈합니다');
  assert.match(fn, /toDataURL\(\{ format: 'jpeg', quality: 0\.92, multiplier: mult \}\)/,
    '★★ 배수를 안 주고 받습니다 — 800px 짜리를 2000px 로 늘리면 글자가 뭉갭니다');
  /* 판 너비를 기억해 둬야 배수를 셈할 수 있다 */
  assert.match(cutFn(APP, 'async function edMarkStart('), /photoEd\.markW = w;/,
    '★★ 판 너비를 안 기억해 두면 배수가 틀립니다');
  /* 고른 표시(파란 손잡이)가 그림에 찍히면 안 된다.
     ⚠ 「먼저 오는가」만 보면 **줄을 통째로 지웠을 때 통과한다**(못 찾으면 -1 이라
       무엇보다 앞이다). 있는지부터 본다 — 되돌림에서 실제로 새어 나갔다. */
  const at = fn.indexOf('discardActiveObject');
  assert.ok(at > 0, '★★ 고른 표시를 안 풉니다 — 파란 손잡이가 사진에 찍힙니다');
  assert.ok(at < fn.indexOf('toDataURL'), '★★ 내보낸 뒤에 풉니다 — 이미 찍힌 뒤입니다');
});

test('★ 아무것도 안 넣었으면 담지 않는다', () => {
  const fn = cutFn(APP, 'async function edMarkApply(');
  assert.match(fn, /if \(!edMarkCount\(\)\) \{[\s\S]{0,90}return; \}/,
    '★ 빈 채로 새 사진을 만듭니다');
  assert.match(cutFn(APP, 'function edPanelHtml('), /cnt \? '' : ' disabled'/,
    '★ 넣은 것이 없는데 단추가 눌립니다');
});

/* ── ⑤ 걷기 ── */

test('★★ 도구를 바꾸거나 창을 닫으면 판을 «걷는다»', () => {
  assert.match(cutFn(APP, 'function setEdMode('), /edMarkStop\(\);/,
    '★★ 도구를 바꿔도 글자판이 화면에 남습니다');
  assert.match(cutFn(APP, 'function photoEdCancel('), /edMarkStop\(\);/,
    '★★ 창을 닫아도 글자판이 남습니다');
  const rv = cutFn(APP, 'function renderViewerEdit(');
  assert.match(rv, /if \(mode !== 'mark'\) edMarkStop\(\);/, '★★ 다른 도구로 갔는데 남습니다');
  assert.match(rv, /if \(!on\) \{ edCropStop\(\); edMarkStop\(\);/, '★ 편집을 나갈 때 안 걷습니다');
  assert.match(cutFn(APP, 'function edMarkStop('), /try \{ edFab\.dispose\(\); \} catch/,
    '★ 걷다가 터지면 편집기가 통째로 멎습니다');
});

test('★★ 사진이 «두 장 겹쳐» 보이지 않는다 — 판이 배경으로 들고 그린다', () => {
  const rv = cutFn(APP, 'function renderViewerEdit(');
  assert.match(rv, /mode === 'mark' \? ' style="visibility:hidden"' : ''/,
    '★★ 원래 사진과 판의 사진이 겹쳐 두 장으로 보입니다');
  assert.match(rv, /mode === 'mark' \? '<canvas id="edFab"><\/canvas>' : ''/, '★ 그릴 판이 없습니다');
  assert.match(cutFn(APP, 'async function edMarkStart('), /edFab\.backgroundImage = new F\.Image\(im/,
    '★★ 사진을 판의 배경으로 안 얹으면 흰 바탕에 글자만 남습니다');
});

/* ── 도구 ── */

test('★ 넣을 수 있는 것 넷 — 글자·네모·동그라미·선', () => {
  const fn = cutFn(APP, 'function edMarkAdd(');
  ['Textbox', 'Rect', 'Ellipse', 'Line'].forEach(function (k) {
    assert.ok(fn.indexOf('F.' + k) > 0, '★ ' + k + ' 가 없습니다');
  });
  const p = cutFn(APP, 'function edPanelHtml(');
  ['🅰 글자', '▭ 네모', '◯ 동그라미', '／ 선'].forEach(function (t) {
    assert.ok(p.indexOf(t) > 0, '★ 「' + t + '」 단추가 없습니다');
  });
  assert.match(fn, /fontFamily: 'Malgun Gothic'/, '★ 한글 글꼴을 안 줍니다 — 네모로 나옵니다');
  /* 가운데 언저리에 넣는다 — 어디에 생겼는지 못 찾으면 안 된다 */
  assert.match(fn, /left: w \* 0\.2/);
  assert.match(fn, /edFab\.setActiveObject\(o\);/, '★ 넣자마자 고른 상태여야 바로 옮깁니다');
});

test('★ 색을 고를 수 있고, 골라 둔 것의 색도 함께 바뀐다', () => {
  const colors = vm.runInNewContext(APP.match(/const MARK_COLORS = \[[^\]]*\];/)[0] + '\nMARK_COLORS;', {});
  assert.ok(colors.length >= 3, '★ 색이 ' + colors.length + '가지뿐입니다');
  const fn = cutFn(APP, 'function setEdMarkColor(');
  assert.match(fn, /o\.type === 'textbox' \|\| o\.type === 'text'/,
    '★ 글자는 fill, 도형은 stroke 다 — 한 가지로 칠하면 한쪽이 안 바뀝니다');
  assert.match(fn, /o\.set\('stroke', c\)/);
});

test('★ 고른 것이 없는데 「지우기」를 누르면 말해 준다', () => {
  const fn = cutFn(APP, 'function edMarkDel(');
  assert.match(fn, /지울 것을 먼저 눌러서 골라 주세요/,
    '★ 아무 일도 안 일어나면 고장 난 줄 압니다(2026-08-29 지우개 사고와 같은 결)');
});

test('★ 준비 전에 눌러도 그 자리에서 멎지 않는다', () => {
  /* 292KB 를 받는 동안 단추를 누를 수 있다 */
  assert.match(cutFn(APP, 'function edMarkAdd('), /if \(!edFab \|\| !window\.fabric\) \{[\s\S]{0,90}return; \}/,
    '★ 아직 판이 없는데 그리려 듭니다');
  assert.match(cutFn(APP, 'async function edMarkApply('), /if \(!edFab\) \{[\s\S]{0,60}return; \}/);
});
