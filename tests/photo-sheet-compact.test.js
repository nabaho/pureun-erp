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

test('「누구 사진」 이름표는 한 줄로 옮겨졌을 뿐 사라지지 않았다', () => {
  /* ⚠ 2026-08-08 에 이름표를 뺐다가 2026-08-10 대표가 「다른직원이 올린 사진은
     왜 안 보이나」 하셨다 — 기능은 있었는데 그 칸인 줄을 알 수가 없었다.
     같은 일이 「컴팩트」라는 이름으로 되풀이되지 않게 못 박는다. */
  assert.match(photos, /<p class="sect2" id="ownerCap">누구 사진/,
    '★ 「누구 사진」 이름표가 사라졌습니다 — 무엇을 고르는 칸인지 알 수 없게 됩니다.');
  const cap = rule('#phSheet #ownerPick .cap');
  assert.doesNotMatch(cap, /display:\s*none/);
  /* 한 줄로 앉히는 것은 «감추기» 가 아니라 «나란히 놓기» 다 */
  assert.match(rule('#phSheet #ownerPick'), /display:\s*flex/);
});

test('한 문서로 모으는 중 안내는 폰과 PC 에 저마다 있는 길만 알려 준다', () => {
  const at = photos.indexOf('function startCollect()');
  const fn = photos.slice(at, photos.indexOf('function renderCollectBar()', at));
  assert.match(fn, /isPhone\(\)/,
    '★ 폰에는 Ctrl 키가 없고 「서류 고르기」 단추도 감춰 둡니다 — 갈라 말해야 합니다.');
  const phone = fn.slice(fn.indexOf('isPhone()'), fn.indexOf(':', fn.indexOf('isPhone()')));
  assert.doesNotMatch(phone, /Ctrl\+V/, '폰 안내에 Ctrl+V 가 남아 있습니다.');
  assert.match(fn, /＋ 사진 올리기/, '폰에서 넣는 길(＋ 사진 올리기)을 알려 주지 않습니다.');
});

test('「📑 한 문서로」는 폰에서 여러 장을 한 번에 읽는 유일한 길이라 남는다', () => {
  /* 없애면 3장이 따로 3번 읽히고(전부 반쪽짜리) 묶어서 또 한 번 — AI 를 네 번
     부르고 세 번을 버린다. 무료 등급 분당 한도를 그 세 번이 밀어낸다. */
  assert.match(photos, /id="phCollectBtn" onclick="startCollect\(\)"/);
  assert.match(photos, /if \(collectDoc && isDoc && !meta\.doc\)/,
    '올리는 길에서 모으는 중인 문서에 붙이는 자리가 사라졌습니다.');
});
