/* 계약창 사진 첨부 칸 없애기 (2026-08-26 대표 승인, 안 ㉯)
 *
 * 대표 지시: 「사진파일 첨부는 필요없다. 기업정보함에서 모두 가져오면 될 것 같다」
 * 없앤 것은 «사진을 계약에 쌓아 두는 일»이고, «사진에서 글자를 읽는 편함»은 남겼다.
 *
 * ⚠ 못 박는 규칙의 핵심: 사진이 계약 기록(상태)에 «들어가지 않는다».
 *   들어가면 레코드가 수 MB 로 부풀어 저장이 조용히 실패한다(예전 「계약 저장 실패」).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
const B = bare(SRC);
const DZ = bare(cutBlock(SRC, 'function dropZone(field, title, hint){'));

test('★ 사진을 «붙이는» 길이 사라졌다', () => {
  assert.strictEqual(B.indexOf('📷 사진·파일 첨부 (탭)'), -1, '첨부 칸이 남아 있다');
  assert.strictEqual(B.indexOf('function onCardSelect('), -1, '붙이던 손이 남아 있다');
  assert.strictEqual(B.indexOf('function onCardDrop('), -1, '끌어놓아 붙이던 손이 남아 있다');
});

test('★ 대신 「사진으로 채우기」가 있다', () => {
  assert.ok(DZ.indexOf('📷 사진으로 채우기') >= 0, '채우기 단추가 없다 — OCR 길이 통째로 사라졌다');
  assert.ok(DZ.indexOf('글자만 읽고 사진은 버립니다') >= 0, '무엇을 하는지 화면이 말해야 한다');
});

test('★★ 고른 사진이 계약 기록에 «들어가지 않는다»', () => {
  const ff = bare(cutBlock(SRC, 'function fillFrom(file){'));
  assert.ok(/runOcr\(field,\s*b64\)/.test(ff), '사진을 읽기 층에 곧바로 넘겨야 한다');
  assert.ok(ff.indexOf('setF(') < 0, '사진을 화면 상태에 담고 있다 — 그러면 계약에 저장된다');
  assert.ok(!/\[field\]\s*=\s*b64/.test(ff), '사진을 회사 칸에 넣고 있다');
});

test('★ 읽기 층이 넘겨받은 사진을 «먼저» 쓴다', () => {
  const fn = bare(cutBlock(SRC, 'function runOcr(field, imgOverride){'));
  assert.ok(/var img = imgOverride \|\| \(f\.company && f\.company\[field\]\) \|\| ''/.test(fn),
    '넘겨받은 사진을 안 쓰면 채우기가 «빈 사진»으로 돈다');
});

test('★ 넘겨받아 읽은 경우에는 «지울 것이 없다»', () => {
  const fn = bare(cutBlock(SRC, 'function runOcr(field, imgOverride){'));
  assert.ok(/if\(!imgOverride && filled > 0/.test(fn),
    '애초에 안 담은 사진을 지우려 들면 예전 사진이 엉뚱하게 지워진다');
});

test('★ 다 읽고 나서 무엇을 했는지 말해 준다', () => {
  const fn = cutBlock(SRC, 'function runOcr(field, imgOverride){');
  assert.ok(fn.indexOf('사진은 저장하지 않았습니다') >= 0, '저장 안 했다는 말이 없다');
  assert.ok(fn.indexOf('원본 사진 정리됨') >= 0, '예전 사진을 지웠다는 말이 없다');
});

test('★ 끌어다 놓기가 살아 있다 (없애면 편함 하나가 조용히 사라진다)', () => {
  assert.ok(/onDrop:function\(e\)\{ e\.preventDefault\(\); fillFrom\(/.test(DZ),
    '끌어다 놓기가 채우기로 안 간다');
  assert.ok(DZ.indexOf('onDragOver:function(e){ e.preventDefault(); }') >= 0, '끌어놓기를 안 받는다');
});

test('★ Ctrl+V 도 «채우기»로 간다 — 사진은 안 담는다', () => {
  const i = B.indexOf('function onGlobalPaste(e){');
  assert.ok(i >= 0, '붙여넣기 손을 못 찾았다');
  const g = B.slice(i, B.indexOf('document.addEventListener(\'paste\'', i));
  assert.ok(g.indexOf('runOcr(targetField, b64)') >= 0, '붙여넣기가 아직 사진을 담는다');
  assert.ok(!/\[fld\]\s*=\s*b64/.test(g), '붙여넣은 사진을 회사 칸에 넣고 있다');
});

test('★ 예전에 붙여 둔 사진은 그대로 보이고, 지울 수도 있다', () => {
  assert.ok(DZ.indexOf('예전에 붙여 둔 사진') >= 0, '있던 사진을 말없이 감췄다');
  assert.ok(DZ.indexOf('clearImg(field)') >= 0, '지울 길이 없다');
  assert.ok(DZ.indexOf('AsyncImg') >= 0, '사진을 안 보여 준다');
});

test('★ 기업정보함에서 가져오는 길은 그대로다 (첫째 길이다)', () => {
  assert.ok(DZ.indexOf('📇 기업정보함 정보 가져오기') >= 0, '첫째 길이 사라졌다');
  assert.ok(DZ.indexOf('기업정보함에서 보기') >= 0, '사진 보러 갈 길이 사라졌다');
  assert.ok(DZ.indexOf('setPcCoPick(field)') >= 0, '어느 칸에서 눌렀는지 안 넘긴다');
});

test('두 칸(대표자 명함 · 사업자등록증)은 그대로 둘이다', () => {
  /* ⚠ 주석 걷은 사본(B)이 아니라 원본을 본다 — 부르는 자리는 주석과 상관없다.
     (B 는 문자열 속 「/*」 같은 것에 걸려 한 토막을 통째로 삼킬 수 있다) */
  assert.ok(SRC.indexOf("dropZone('businessCardImg'") >= 0, '대표자 명함 칸이 사라졌다');
  assert.ok(SRC.indexOf("dropZone('bizLicenseImg'") >= 0, '사업자등록증 칸이 사라졌다');
});
