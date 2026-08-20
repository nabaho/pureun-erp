const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 폰 사진 올리기는 «그림만» 받는 칸을 연다', () => {
  /* accept 에 pdf 가 섞여 있으면 안드로이드가 «갤러리»를 아예 안 띄우고
     「카메라 / 파일」만 준다 — 사진을 고르러 파일 관리자를 뒤져야 했다
     (대표 지적 2026-08-20). 그림만 받으면 사진 고르개가 바로 열린다. */
  assert.match(photos, /<input type="file" id="picInput" accept="image\/\*" multiple hidden>/,
    '★ 그림만 받는 칸이 없으면 갤러리가 안 뜹니다.');
  const fn = photos.slice(photos.indexOf('function phUpload()'), photos.indexOf('function phUploadDoc()'));
  assert.match(fn, /isPhone\(\) \? \$\('picInput'\) : null/);
  /* 넓은 화면은 예전 그대로 — PC 에서는 파일 창이 열리므로 갈래가 많아도 상관없다 */
  assert.match(fn, /\|\| \$\('docInput'\)/);
});

test('PDF·서류 파일 길은 남아 있다', () => {
  /* 그림만 받게 하면서 PDF 를 아예 못 올리게 되면 기능을 잃는 것이다. */
  assert.match(photos, /function phUploadDoc\(\)/);
  assert.match(photos, /id="phDocBtn" onclick="phUploadDoc\(\)"/, '시트에 PDF 길이 없습니다.');
  const doc = photos.slice(photos.indexOf('function phUploadDoc()'), photos.indexOf('function phUploadDoc()') + 500);
  assert.match(doc, /\$\('docInput'\)/, 'PDF 길이 그림 칸을 열면 뜻이 없습니다.');
  /* 서류 칸은 여전히 pdf 를 받는다 */
  assert.match(photos, /id="docInput" accept="image\/\*,application\/pdf"/);
});

test('★ 두 칸이 «같은 손잡이»를 쓴다 — 갈라 두면 한쪽만 고친다', () => {
  assert.match(photos, /\$\('picInput'\)\.onchange = \$\('docInput'\)\.onchange;/,
    '★ 받는 자리를 따로 적으면 언젠가 한쪽만 고칩니다.');
  /* 남의 것을 보는 중에는 못 올린다 — 두 길 모두 같은 그물을 지나야 한다 */
  ['function phUpload()', 'function phUploadDoc()'].forEach(function (f) {
    const at = photos.indexOf(f);
    assert.match(photos.slice(at, at + 300), /viewingOnlyOther\(\)/,
      f + ' 에 「남의 사진 보는 중」 그물이 없습니다.');
  });
});
