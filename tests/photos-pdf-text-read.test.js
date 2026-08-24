'use strict';
/* 글자 있는 PDF 는 «글자로» 판독한다 — 대표 결정 2026-08-24

   검토에서 나온 1위 항목이다. 실데이터에서 사진첩 서류의 65%(382/585)가
   사업자등록증(명)이었고, 그것은 홈택스가 «만들어 준» PDF 라 안에 글자가 그대로
   있다. 그런데 3배 배율 그림(한 쪽 831KB)으로 바꿔 AI 에게 「읽어라」 하고 있었다.

   글자로 읽으면:
   · 판독할 때마다 그림을 내려받지 않는다 — 되풀이 판독이 비용의 큰 몫이었다.
   · AI 입력이 한 쪽 3,000토큰 → 500~1,500토큰.
   · **1↔7 · 4↔9 오독이 원천적으로 없다.**
   · 쪽수 제한이 사실상 없다 — 그림은 여러 장을 한 번에 넣으면 뒤쪽을 못 본다.

   지켜야 하는 것:
   ① 글자는 **정보(items)에 담지 않는다** — 목록을 부를 때 items 를 통째로
      내려받으므로, 거기 넣으면 줄이려던 비용이 오히려 늘어난다.
   ② **모든 쪽에 글자가 있어야** 글자로 간다. 한 쪽이라도 스캔이면 그 쪽이 통째로
      빠진 채 「다 읽었다」로 돌아온다 — 반쪽만 읽는 것이 더 나쁘다.
   ③ **가린 사본이 왔으면 글자로 가지 않는다** — 가린 것은 그림이고 글자에는 가린
      자리가 그대로 남아 있다.
   ④ 글자가 없으면 예전처럼 그림으로 물러난다(휴지통에서 되살린 사진 등).
   ⑤ 물음(PROMPT_ALL)은 한 벌만 쓴다 — 두 벌이면 한쪽만 고쳐 놓고 다른 쪽은 옛 규칙.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const readjs = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

function fnOf(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* ══════ ① 어느 쪽으로 갈지 가리는 판정 — 실제로 돌린다 ══════ */
const J = (function () {
  const c = { String, Array, Number, Boolean };
  vm.createContext(c);
  vm.runInContext(app.match(/^const PDF_TEXT_MIN = \d+;$/m)[0] + '\n' +
    fnOf(app, 'pdfTextUsable') + '\n' + fnOf(app, 'textOfOne') + '\n' + fnOf(app, 'docTextOf'), c);
  return c;
})();
const LONG = '사업자등록증명 상호 남양인텍 대표자 김종복 사업자등록번호 312-81-28123 개업일 1997-10-01';

test('★ 쓸 만큼 글자가 있으면 글자로 간다', () => {
  assert.equal(J.pdfTextUsable(LONG), true);
  assert.equal(J.docTextOf([{ text: LONG }]), LONG);
});

test('★ 스캔한 종이(글자 거의 없음)는 그림으로 간다 — 0 으로만 가르면 안 된다', () => {
  /* 도장 옆 잡티가 글자로 잡혀 몇 자가 나오는 일이 있다. */
  assert.equal(J.pdfTextUsable(''), false);
  assert.equal(J.pdfTextUsable('· ㆍ 1'), false);
  assert.equal(J.docTextOf([{ text: '· ㆍ 1' }]), '', '★ 빈 답이 돌아옵니다');
});

test('★ 한 쪽이라도 글자가 없으면 통째로 그림으로 간다 — 반쪽만 읽는 것이 더 나쁘다', () => {
  assert.equal(J.docTextOf([{ text: LONG }, { text: '' }]), '',
    '★ 그 쪽 내용이 빠진 채 「다 읽었다」로 돌아옵니다');
  assert.equal(J.docTextOf([{ text: '' }, { text: LONG }]), '');
});

test('★ 여러 쪽이면 쪽 표시를 붙인다 — 없으면 두 쪽 사이가 한 줄로 이어져 값이 섞인다', () => {
  const out = J.docTextOf([{ text: LONG }, { text: LONG }]);
  assert.match(out, /^--- 1쪽 ---\n/);
  assert.match(out, /\n--- 2쪽 ---\n/);
});

test('한 쪽이면 쪽 표시를 안 붙인다 — 쓸데없는 말은 토큰만 먹는다', () => {
  assert.ok(J.docTextOf([{ text: LONG }]).indexOf('쪽 ---') < 0);
});

test('올리는 중이면 손에 든 것을, 이미 올라간 것이면 받아 둔 것을 쓴다', () => {
  assert.equal(J.textOfOne({ text: LONG }), LONG);
  assert.equal(J.textOfOne({ _text: LONG }), LONG);
  assert.equal(J.textOfOne({}), '');
  assert.equal(J.textOfOne(null), '');
});

test('빈 목록은 빈 문자열 — 그림으로 물러난다', () => {
  assert.equal(J.docTextOf([]), '');
  assert.equal(J.docTextOf(null), '');
});

/* ══════ ② 글자를 뽑고 담는다 ══════ */

test('★ PDF 에서 글자를 뽑는다 — 이것이 없으면 이 기능 전체가 없다', () => {
  const fn = fnOf(app, 'pdfToPages');
  assert.match(fn, /page\.getTextContent\(\)/, '★ 글자를 안 뽑고 있습니다');
  assert.match(fn, /out\.push\(\{ blob: blob, page: n, total: total, text: txt \}\)/,
    '뽑아 놓고 안 실어 보냅니다');
  /* 글자 뽑기가 실패해도 올리기를 멈추지 않는다 — 그림은 이미 손에 있다. */
  assert.match(fn, /catch \(e\) \{ console\.warn\('\[PDF 글자\]'/,
    '★ 글자 뽑기 실패가 올리기를 뒤집으면 안 됩니다');
  /* 보기용 그림은 그대로 만든다 — 사진첩은 사진을 보는 곳이다. */
  assert.match(fn, /page\.render\(/, '★ 그림을 안 만들면 사진첩에서 볼 수 없습니다');
});

test('★ 글자를 사진에 딸려 보내고, 정보에는 「있다」만 남긴다', () => {
  assert.match(app, /if \(pdfTextUsable\(p\.text\)\) file\.__pdfText = p\.text;/);
  assert.match(app, /if \(f\.__pdfText\) meta\.hasText = true;/,
    '판독이 무엇을 보고 갈라야 할지 표시가 없습니다');
  assert.match(app, /text: f\.__pdfText \|\| '',/, '올리기 대기열에 글자를 안 싣습니다');
  /* ⚠ 핵심 — meta 에 글자 자체를 담으면 목록을 열 때마다 다 내려받는다. */
  assert.ok(!/meta\.text\s*=/.test(app),
    '★ 정보(meta)에 글자를 담았습니다 — 목록을 열 때마다 그것을 다 내려받습니다');
});

test('★ 저장 층이 글자를 «정보와 갈라» 담는다', () => {
  assert.match(store, /function textPath\(year, id, owner\) \{ return base\(owner\) \+ '\/texts\//,
    '★ 글자 담을 자리가 items 와 갈려 있지 않습니다');
  assert.match(fnOf(store, 'saveMetaOnly'), /if \(p\.text\) u\[textPath\(year, p\.id\)\] = String\(p\.text\);/);
  /* 창고가 막혀 실시간DB 로 물러난 길에서도 담아야 두 동작이 안 생긴다. */
  assert.match(fnOf(store, 'saveToRtdb'), /if \(p\.text\) u\[textPath\(year, p\.id\)\] = String\(p\.text\);/,
    '★ 한쪽만 담으면 「창고일 때는 글자, 실시간DB일 때는 그림」 두 동작이 됩니다');
});

test('★ 지우면 글자도 함께 비운다 — 사진은 없는데 사업장 정보만 남으면 안 된다', () => {
  assert.match(store, /u\[textPath\(year, id, owner\)\] = null;/);
});

test('★ 글자가 없으면 빈 문자열을 준다 — 던지면 판독이 멈춘다', () => {
  const fn = fnOf(store, 'loadText');
  assert.match(fn, /catch\(?function \(\) \{ return ''; \}\)?/);
  assert.match(fn, /typeof t === 'string'/, '이상한 값이 앉아 있어도 판독이 죽으면 안 됩니다');
  assert.match(store, /loadText: loadText,/, '내보내지 않으면 화면이 못 씁니다');
});

/* ══════ ③ 판독기 — 물음은 한 벌 ══════ */

test('★ 글자 판독이 같은 물음(PROMPT_ALL)을 쓴다 — 두 벌이면 한쪽만 고쳐진다', () => {
  const fn = fnOf(readjs, 'readDocText');
  assert.match(fn, /PROMPT_ALL \+ TEXT_NOTE/, '★ 물음을 새로 베껴 적었습니다');
  assert.match(readjs, /var TEXT_NOTE =/);
  assert.match(readjs, /「이미지」라고 한 것은 아래 글자를 말합니다/,
    '앞머리가 「이 이미지가」로 시작하는데 바로잡는 말이 없습니다');
});

test('★ 사진 길과 글자 길이 같은 뒤처리를 쓴다 — 두 벌이면 한쪽이 옛 길로 남는다', () => {
  /* ⚠ 2026-08-24: runDocParts 가 «어느 길로 읽었나»(via)를 함께 받는다 — 결과에
     남겨야 「글자 있는데 그림으로 읽은 것」만 골라 다시 읽을 수 있다.
     지킬 것은 「두 길이 같은 뒤처리를 쓴다」이지 인자 개수가 아니다. */
  assert.match(fnOf(readjs, 'read'), /return runDocParts\(parts, 'image'\);/);
  assert.match(fnOf(readjs, 'readDocText'), /return runDocParts\(\[\{ text: /);
  assert.match(readjs, /function runDocParts\(parts, via\)/);
});

test('★ 빈 글자로 AI 를 부르지 않는다 — 헛돈이고 답도 쓸 수 없다', () => {
  assert.match(fnOf(readjs, 'readDocText'), /if \(!body\) return Promise\.resolve\(fail\(/);
});

test('★ 주민번호는 글자에서도 지운다 — 문지기가 한 곳뿐이면 그 한 곳을 빠뜨린다', () => {
  assert.match(fnOf(readjs, 'readDocText'), /RM\.maskRrnInText/);
});

test('글자 판독을 내보낸다', () => {
  assert.match(readjs, /readDocText: readDocText,/);
});

/* ══════ ④ 두 판독 길에 다 붙였다 ══════ */

test('★ 올린 뒤 판독하는 길에서 글자를 쓴다', () => {
  const fn = fnOf(app, 'startRead');
  assert.match(fn, /const txt = docTextOf\(sibs\);/);
  assert.match(fn, /\? PuDocRead\.readDocText\(txt\)/, '★ 안 부르면 예전처럼 그림으로 갑니다');
  assert.match(fn, /: PuDocRead\.read\(imgs\.length > 1 \? imgs : \(imgs\[0\] \|\| job\.full\)\)/,
    '그림으로 물러나는 길이 사라졌습니다');
});

test('★ 「다시 판독」 길에서는 그림을 아예 «안 내려받는다» — 여기가 비용의 큰 몫이다', () => {
  const fn = fnOf(app, 'readPhoto');
  assert.match(fn, /PuPhotoStore\.loadText\(/, '★ 담아 둔 글자를 안 씁니다');
  assert.match(fn, /if \(txt\) return PuDocRead\.readDocText\(txt\);/);
  /* 글자로 갈 때 loadFull 이 «그 뒤»에만 있어야 한다 — 앞에 있으면 늘 내려받는다. */
  assert.ok(fn.indexOf('if (txt) return PuDocRead.readDocText(txt);') < fn.indexOf('loadFull('),
    '★ 글자로 갈 때도 그림을 내려받고 있습니다 — 아끼려던 것이 그대로 나갑니다');
});

test('★ 가린 사본이 왔으면 글자로 가지 않는다 — 글자에는 가린 자리가 그대로 있다', () => {
  const fn = fnOf(app, 'readPhoto');
  assert.match(fn, /const wantText = !masked &&/,
    '★ 가리고 판독했는데 글자로 읽으면 가린 뜻이 없어집니다');
});

test('★ 「글자 있다」고 적힌 사진에만 글자를 받으러 간다 — 없는 자리를 헛 두드리지 않는다', () => {
  assert.match(fnOf(app, 'readPhoto'), /g\.meta\.hasText/);
});

/* ══════ ⑤ 판·캐시 번호 ══════ */

test('★ 판독기 판 번호를 올렸다 — 그림으로 읽어 둔 옛 PDF 를 글자로 다시 읽는다', () => {
  const m = readjs.match(/var READ_VERSION = (\d+);/);
  assert.ok(m && Number(m[1]) >= 11, '★ 판 번호를 안 올리면 옛 결과가 그림 판독으로 굳습니다');
});

test('★ 공용 .js 두 개의 ?v= 를 화면마다 같이 올렸다', () => {
  const files = fs.readdirSync(R).filter(function (f) { return f.endsWith('.html'); });
  ['pu-doc-read.js', 'pu-photo-store.js'].forEach(function (js) {
    const seen = {};
    files.forEach(function (f) {
      const s = fs.readFileSync(path.join(R, f), 'utf8');
      const m = s.match(new RegExp('js/' + js.replace('.', '\\.') + '\\?v=(\\d+)'));
      if (m) seen[m[1]] = (seen[m[1]] || []).concat(f);
    });
    const vers = Object.keys(seen);
    assert.equal(vers.length, 1,
      '★ ' + js + ' 의 ?v= 가 화면마다 다릅니다 — 같은 브라우저 안에서 갈립니다: ' +
      JSON.stringify(seen));
  });
});
