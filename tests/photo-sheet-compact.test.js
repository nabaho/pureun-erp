const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function rule(sel) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = photos.match(re);
  assert.ok(m, sel + ' 규칙을 찾지 못했습니다.');
  return m[1];
}

test('「사진 작업」 시트에서 손가락으로 누르는 자리는 44px 아래로 줄지 않는다', () => {
  /* ★ 컴팩트하게 줄이다 보면 여기부터 줄이게 된다 — 그러면 누르다 빗나간다.
     줄여도 되는 것은 «이름표»(제목·닫기)이고, 단추와 고르개는 손가락 자리다. */
  const act = rule('#phActions button');
  const minH = Number((act.match(/min-height:\s*(\d+)px/) || [])[1]);
  assert.ok(minH >= 44, '작업 단추가 ' + minH + 'px 입니다 — 44px 아래는 누르다 빗나갑니다.');
  const sel = rule('#phSheet #ownerSel');
  const h = Number((sel.match(/height:\s*(\d+)px/) || [])[1]);
  assert.ok(h >= 44, '「누구 사진」 고르개가 ' + h + 'px 입니다.');
});

test('작업 단추와 「누구 사진」은 한 줄에 나란히 선다', () => {
  /* 대표 지시 2026-08-20 「셀 3개 1줄로」. display:contents 라야 단추 하나가
     숨어도(모으는 중에는 「한 문서로」가 숨는다) 빈 칸이 남지 않는다. */
  assert.match(photos, /<div id="phRow1">/);
  assert.match(rule('#phActions,#phOwner'), /display:\s*contents/);
  assert.match(rule('#phRow1'), /display:\s*flex/);
  /* ★ nowrap 이면 제 줄을 통째로 쓰는 칸(👥 공유)이 줄을 비집고 들어와
     나머지를 14px 로 눌러 버린다 — 실제로 그렇게 났던 것을 재어 보고 고쳤다. */
  assert.match(rule('#phRow1'), /flex-wrap:\s*wrap/,
    '★ nowrap 이면 제 줄을 쓰는 칸이 뜰 때 한 줄이 무너집니다.');
});

test('★★ 시트에는 «윗줄에 이미 있는 일»을 두지 않는다 (대표 지시 2026-09-03)', () => {
  /* 「상단 올리기 줄과 하단 팝업 창 중복이 있다 — 불필요한 부분 하단 정리」
     같은 일을 두 곳에 두면 «같은 말을 두 번» 눌러야 한다.
     2026-08-26 에 「＋ 올리기」에서 한 번 고친 흠이 「⚠ N」에 그대로 남아 있었다. */
  const 윗줄 = photos.slice(photos.indexOf('<div id="phBar">'),
    photos.indexOf('</div>', photos.indexOf('<button id="phNeedBtn"')));
  const 시트 = photos.slice(photos.indexOf('<div id="phActions">'),
    photos.indexOf('</div>', photos.indexOf('<div id="phActions">')));
  for (const [일, 무엇] of [['phUpload()', '사진 올리기'], ['phGoNeed()', '⚠ 확인 필요']]) {
    assert.ok(윗줄.indexOf(일) > 0, 무엇 + ' 이 윗줄에 없습니다');
    assert.ok(시트.indexOf(일) < 0,
      '★★ ' + 무엇 + ' 이 윗줄과 시트에 «둘 다» 있습니다 — 같은 말을 두 번 누르게 됩니다');
  }
  /* 시트에 남은 것은 윗줄에 «없는» 일이어야 한다 */
  assert.ok(시트.indexOf('startCollect()') > 0 && 시트.indexOf('phUploadDoc()') > 0,
    '시트에서 한 문서로·📄 파일까지 사라졌습니다 — 이 둘은 윗줄에 없는 길입니다');
});

test('★ 「⚠ N」은 «한 번»에 손볼 사진으로 간다 — 요약 안의 글자가 아니다', () => {
  assert.match(photos, /<button id="phNeedBtn" onclick="phGoNeed\(\)"/,
    '★ ⚠ 가 눌리는 자리가 아니면 시트를 거쳐 두 번 눌러야 합니다');
  /* 요약(phSummaryState)이 같은 숫자를 또 적으면 어느 것을 누를지 헷갈린다 */
  const at = photos.indexOf('function renderPhSummary()');
  const fn = photos.slice(at, photos.indexOf('\nfunction ', at + 10));
  /* ⚠ «부르는가»를 본다 — 글자만 찾으면 이 규칙을 설명하는 주석에 걸린다 */
  assert.ok(!/filter\(needsCheck\)/.test(fn),
    '★ 요약이 손볼 사진 수를 또 셉니다 — 옆 단추와 같은 숫자가 두 번 나옵니다');
  /* 걸러 놓은 채로 다 손보면 «되돌릴 단추»가 사라지면 안 된다 */
  const at2 = photos.indexOf('function renderPhNeedBtn()');
  const fn2 = photos.slice(at2, photos.indexOf('\nfunction ', at2 + 10));
  assert.match(fn2, /!n && !needOnly/,
    '★ 걸러 보는 중에 손볼 것이 0이 되면 단추가 사라져 빈 화면에 갇힙니다');
});

test('★ 요약은 «말을 하는 것»만 그린다 — 빈 이름표가 자리를 먹지 않는다', () => {
  /* 「📑 문서」는 모으는 중이 아닐 때 아무것도 안 알려 주면서, 그만큼
     「전체 근로자 (9명)」 같은 긴 이름을 잘라 먹었다(대표 갈무리 2026-09-03). */
  const at = photos.indexOf('function renderPhSummary()');
  const fn = photos.slice(at, photos.indexOf('\nfunction ', at + 10));
  assert.match(fn, /doc\.style\.display = collectDoc \? '' : 'none'/,
    '★ 모으는 중이 아닌데도 「📑 문서」가 자리를 먹습니다');
});

test('「누구 사진」 이름표는 한 줄로 옮겨졌을 뿐 사라지지 않았다', () => {
  /* ⚠ 2026-08-08 에 이름표를 뺐다가 2026-08-10 대표가 「다른직원이 올린 사진은
     왜 안 보이나」 하셨다 — 기능은 있었는데 그 칸인 줄을 알 수가 없었다.
     같은 일이 「컴팩트」라는 이름으로 되풀이되지 않게 못 박는다. */
  assert.match(photos, /<p class="sect2" id="ownerCap">누구 사진/,
    '★ 「누구 사진」 이름표가 사라졌습니다 — 무엇을 고르는 칸인지 알 수 없게 됩니다.');
  const cap = rule('#phSheet #ownerPick .cap');
  assert.doesNotMatch(cap, /display:\s*none/);
  /* 이름표는 고르개 «위에» 얹혔다 — 줄을 더 쓰지 않으면서 살아남는 자리다.
     (2026-08-20 셋을 한 줄로 만들며 옆에서 위로 옮겼다.) */
  assert.match(rule('#phSheet #ownerPick .cap'), /font-size:\s*\d/);
});

test('한 문서로 모으는 중 안내는 폰과 PC 에 저마다 있는 길만 알려 준다', () => {
  const at = photos.indexOf('function startCollect()');
  const fn = photos.slice(at, photos.indexOf('function renderCollectBar()', at));
  assert.match(fn, /isPhone\(\)/,
    '★ 폰에는 Ctrl 키가 없고 「서류 고르기」 단추도 감춰 둡니다 — 갈라 말해야 합니다.');
  const phone = fn.slice(fn.indexOf('isPhone()'), fn.indexOf(':', fn.indexOf('isPhone()')));
  assert.doesNotMatch(phone, /Ctrl\+V/, '폰 안내에 Ctrl+V 가 남아 있습니다.');
  /* ★ 안내가 «화면에 실제로 있는» 단추 이름을 대는가 — 값이 아니라 규칙이다.
     2026-09-03 에 시트의 「＋ 사진 올리기」를 걷어냈는데 안내는 그 이름을 그대로
     대고 있었다. 없는 단추를 찾으라는 안내는 «틀린 안내»다. */
  const 폰안내 = fn.slice(fn.indexOf("? '"), fn.indexOf("\n", fn.indexOf("? '")));
  const 이름 = /「([^」]+)」/.exec(폰안내);
  assert.ok(이름, '폰 안내가 넣는 길의 이름을 대지 않습니다.');
  assert.ok(photos.indexOf('>' + 이름[1] + '<') > 0,
    '★ 폰 안내가 「' + 이름[1] + '」로 넣으라는데 그런 이름의 단추가 화면에 없습니다.');
});

test('「📑 한 문서로」는 폰에서 여러 장을 한 번에 읽는 유일한 길이라 남는다', () => {
  /* 없애면 3장이 따로 3번 읽히고(전부 반쪽짜리) 묶어서 또 한 번 — AI 를 네 번
     부르고 세 번을 버린다. 무료 등급 분당 한도를 그 세 번이 밀어낸다. */
  assert.match(photos, /id="phCollectBtn" onclick="startCollect\(\)"/);
  assert.match(photos, /if \(collectDoc && isDoc && !meta\.doc\)/,
    '올리는 길에서 모으는 중인 문서에 붙이는 자리가 사라졌습니다.');
});
