/* 한글 «원본 파일»도 함께 보관하는가 (대표 지시 2026-09-05 「보관」).
 *
 * 왜 필요한가 — 사진첩은 한글을 «쪽 그림»으로 담는다. 판독은 오히려 정확해지지만
 * 표 줄·도장 같은 서식이 사라진다. 그래서 원본 파일을 창고에 함께 둔다.
 *
 * 지켜야 할 것:
 *   ① 원본은 «문서마다 한 벌»이다 — 쪽마다 올리면 6쪽짜리가 여섯 벌이 된다
 *   ② 원본을 못 담았으면 «반드시 말한다» — 조용히 넘어가면 담긴 줄 알고
 *      원본을 지운다(그러면 서식이 영영 사라진다)
 *   ③ 원본을 못 담아도 «쪽은 올린다» — 판독은 글자로 이미 된다
 *   ④ 사진을 완전히 지우면 원본도 «함께» 지운다 — 안 지우면 요금이 계속 나가고
 *      근로자 이름·임금이 창고에 남는다
 *   ⑤ 어느 쪽을 보고 있든 그 자리에서 원본을 받을 수 있다
 *   ⑥ 창고 규칙에 그 자리가 «열려 있다» — 지금 규칙은 그림만 받는다(okImage)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn.js');
const { stripComments } = require('./strip-comments.js');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');
const SRC = stripComments(HTML);
const STORE = stripComments(fs.readFileSync(path.join(ROOT, 'js/pu-photo-store.js'), 'utf8'));

/* ── 저장 층을 진짜로 돌려 본다 ── */
function storeCtx(over) {
  const puts = [];
  const dels = [];
  const ref = function (p) {
    return {
      put: function (blob, meta) { puts.push({ path: p, blob: blob, meta: meta }); return Promise.resolve(); },
      getDownloadURL: function () { return Promise.resolve('https://창고/' + p + '?token=t'); },
      delete: function () { dels.push(p); return Promise.resolve(); }
    };
  };
  const ctx = Object.assign({
    console: console, Promise: Promise, Error: Error, encodeURIComponent: encodeURIComponent,
    BUCKET_ROOT: 'pu_photos',
    deps: { uid: 'U1', storage: { ref: ref } },
    puts: puts, dels: dels
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(cutFn(STORE, 'function origPath('), ctx);
  vm.runInContext(cutFn(STORE, 'function putOriginal('), ctx);
  return ctx;
}

/* ── ① 문서마다 한 벌 ── */
test('원본은 «문서 묶음»에 하나 — 쪽 id 가 아니라 따로 준 열쇠로 담긴다', () => {
  const decl = cutFn(SRC, 'async function addFiles(');
  /* 원본 올리기는 «쪽 만들기 밖», 파일 하나에 한 번이어야 한다 */
  const i = decl.indexOf('if (isHwp(f))');
  assert.ok(i > 0, '한글 갈래를 못 찾았다');
  const seg = decl.slice(i, decl.indexOf('continue;', i));
  assert.match(seg, /putOriginal\(/, '원본을 아예 안 담는다');
  assert.ok(!/r\.pages\.forEach[\s\S]*putOriginal/.test(decl),
    '쪽마다 원본을 담는다 — 6쪽짜리가 창고에 여섯 벌이 된다');
  /* 열쇠는 새로 만든다 — 쪽 id 를 쓰면 그 쪽을 지울 때 남은 쪽의 원본이 사라진다 */
  assert.match(seg, /putOriginal\(\s*\r?\n?\s*PuPhotoStore\.newId\(\)/,
    '원본 열쇠를 따로 만들지 않는다');
});

test('창고에 올릴 때 원래 이름·종류를 함께 적는다', async () => {
  const ctx = storeCtx();
  const blob = { size: 1234, type: 'application/x-hwp' };
  const got = await ctx.putOriginal('K1', 2026, blob, '근로계약서.hwp');
  assert.strictEqual(ctx.puts.length, 1, '한 번만 올려야 한다');
  assert.strictEqual(ctx.puts[0].path, 'pu_photos/u/U1/origs/2026/K1');
  assert.strictEqual(ctx.puts[0].meta.contentType, 'application/x-hwp');
  assert.match(ctx.puts[0].meta.contentDisposition, /attachment/,
    '받을 때 열리지 않고 저장되어야 한다');
  assert.match(ctx.puts[0].meta.contentDisposition, /%EA%B7%BC%EB%A1%9C/,
    '원래 이름으로 안 받아진다 — 뜻 없는 열쇠 이름으로 떨어진다');
  /* 돌려주는 것: 주소 + «담긴 해»(지울 때 이 해로 찾는다) + 이름·크기 */
  assert.match(got.url, /token=/, '토큰 주소가 아니면 관리자·공유가 못 받는다');
  assert.strictEqual(got.year, 2026, '담긴 해를 안 남기면 자정 넘겨 올린 것이 안 지워진다');
  assert.strictEqual(got.key, 'K1');
  assert.strictEqual(got.name, '근로계약서.hwp');
  assert.strictEqual(got.size, 1234);
});

test('확장자를 안 붙인다 — 지울 때 이름을 다시 알 필요가 없어야 한다', () => {
  const ctx = storeCtx();
  assert.strictEqual(ctx.origPath(2026, 'K1'), 'pu_photos/u/U1/origs/2026/K1');
  /* 남의 자리도 계산할 수 있어야 한다(관리자 지우기) */
  assert.strictEqual(ctx.origPath(2025, 'K2', 'U9'), 'pu_photos/u/U9/origs/2025/K2');
});

test('로그인·열쇠가 없으면 «조용히» 엉뚱한 자리에 담지 않는다', () => {
  const ctx = storeCtx({ deps: { uid: '', storage: { ref: function () { return {}; } } } });
  assert.throws(function () { ctx.origPath(2026, 'K1'); }, /계정/);
  const ok = storeCtx();
  assert.throws(function () { ok.origPath(2026, ''); }, /열쇠/);
});

/* ── ②③ 못 담으면 말한다, 그래도 쪽은 올린다 ── */
test('원본을 못 담아도 쪽은 올리고, 못 담았다고 «이름을 대고» 말한다', () => {
  const decl = cutFn(SRC, 'async function addFiles(');
  const i = decl.indexOf('if (isHwp(f))');
  const seg = decl.slice(i, decl.indexOf('continue;', i));
  /* 원본 실패가 쪽 올리기를 막으면 안 된다 — 제 catch 로 감싼다 */
  assert.match(seg, /catch[\s\S]*hwpNoOrig\.push/,
    '원본 담기가 실패하면 쪽까지 통째로 못 올린다');
  assert.match(seg, /spread\.push\([^)]*pdf: pages/,
    '원본이 없으면 쪽도 안 담는다 — 판독은 글자로 이미 되는데');
  /* ⚠ 「담는 줄이 있는가」만 보면 속는다 — 그 앞에서 던져 버리면 줄은 남아 있는데
     한 쪽도 안 올라간다(뮤테이션에서 실제로 통과했다). 원본을 못 담은 «뒤»부터
     쪽을 담기까지 사이에 던지는 것이 있으면 안 된다. */
  const between = seg.slice(seg.indexOf('hwpNoOrig.push'), seg.indexOf('spread.push'));
  assert.ok(between.length > 0, '원본 실패와 쪽 담기 사이를 못 잘랐다');
  assert.ok(!/throw/.test(between),
    '원본을 못 담으면 쪽까지 통째로 버린다 — 판독은 글자로 이미 되는데');
  /* 끝에 한 번, 이름을 대고 */
  assert.match(decl, /if \(hwpNoOrig\.length\) \{[\s\S]{0,400}?alert\(/,
    '원본을 못 담았는데 아무 말도 안 한다 — 담긴 줄 알고 원본을 지운다');
  const say = decl.slice(decl.indexOf('if (hwpNoOrig.length)'));
  assert.match(say.slice(0, 500), /hwpNoOrig\.join/, '무엇을 못 담았는지 이름을 안 댄다');
});

/* ── ④ 지우면 함께 지운다 ── */
test('사진을 완전히 지우면 한글 원본도 «함께» 지운다', () => {
  const fn = cutFn(STORE, 'function purgeStorageBody(');
  assert.match(fn, /meta/, '지울 때 사진 정보를 안 본다 — 원본 자리를 알 길이 없다');
  assert.match(fn, /origPath\(/, '원본을 안 지운다 — 요금이 계속 나가고 개인정보가 남는다');
  /* 담긴 해를 우선한다 — 사진의 해로만 찾으면 자정 넘긴 것이 안 지워진다 */
  assert.match(fn, /o\.year \|\| year/, '원본이 담긴 해를 안 쓴다');
  /* 부르는 자리 둘 다 정보를 넘겨야 한다 */
  const old = cutFn(STORE, 'function purgeOldTrash(');
  assert.match(old, /purgeStorageBody\(year, id, owner, raw\[id\]\.meta\)/,
    '30일 지난 것을 지울 때 정보를 안 넘긴다 — 원본이 남는다');
  const one = cutFn(STORE, 'function purgeOne(');
  assert.match(one, /purgeStorageBody\(year, id, [^)]*t\.meta\)/,
    '한 장 완전삭제에서 정보를 안 넘긴다 — 원본이 남는다');
});

test('원본 지우기가 실패해도 사진 본문 지우기는 계속한다', () => {
  const fn = cutFn(STORE, 'function purgeStorageBody(');
  /* 한 문서의 여러 쪽이 같은 원본을 가리킨다 — 두 번째부터는 「없다」로 실패한다 */
  assert.match(fn, /origPath\([^)]*\)[^;]*\)\.catch\(/,
    '원본이 이미 없으면 사진 지우기까지 함께 넘어진다');
  assert.match(fn, /try \{[\s\S]*origPath[\s\S]*catch/,
    '열쇠가 이상하면 사진 본문이 안 지워진 채 남는다');
});

/* ── ⑤ 어느 쪽에서든 받을 수 있다 ── */
test('원본 주소는 «쪽마다» 적혀 있어 어느 쪽에서든 바로 받는다', () => {
  const decl = cutFn(SRC, 'async function addFiles(');
  const i = decl.indexOf('file.__pdfDoc =');
  assert.ok(i > 0, '쪽 표를 붙이는 자리를 못 찾았다');
  /* ⚠ 「적는 줄이 있는가」만 보면 속는다 — 앞에 «첫 쪽일 때만»을 덧붙여도
     그 줄은 그대로다(뮤테이션에서 통과했다). 그래서 «조건»까지 못 박는다:
     원본이 있으면 그것뿐, 몇 쪽인지는 따지지 않는다. */
  assert.match(decl.slice(i, i + 500), /if \(x\.orig\) file\.__pdfDoc\.orig = x\.orig;/,
    '첫 쪽에만 적으면 3쪽을 보다가 원본을 받으려고 1쪽으로 돌아가야 한다');
});

test('원본이 있을 때만 «📄 한글 원본» 단추가 보인다', () => {
  const ctxObj = {};
  vm.createContext(ctxObj);
  vm.runInContext(cutFn(SRC, 'function origOf('), ctxObj);
  assert.ok(!ctxObj.origOf(null), '사진이 없는데 단추가 켜진다');
  assert.ok(!ctxObj.origOf({ meta: {} }), '원본이 없는 사진에 단추가 켜진다');
  assert.ok(!ctxObj.origOf({ meta: { doc: { orig: { key: 'K1' } } } }),
    '주소가 없는데 단추가 켜진다 — 눌러도 아무 일이 안 난다');
  const o = ctxObj.origOf({ meta: { doc: { orig: { key: 'K1', url: 'https://x' } } } });
  assert.ok(o && o.url === 'https://x');

  const title = cutFn(SRC, 'function renderViewerTitle(');
  assert.match(title, /viewerOrig/, '제목줄이 단추를 켜고 끄지 않는다');
  assert.match(title, /origOf\(it\)/, '원본이 있는지 안 보고 늘 켠다');
  assert.match(title, /display = o \? '' : 'none'/, '원본이 없어도 단추가 남는다');
  assert.match(HTML, /id="viewerOrig"[^>]*style="display:none"/,
    '단추가 처음부터 보인다 — 원본 없는 사진에도 잠깐 뜬다');
});

test('받기는 창고 «토큰 주소»로 간다 — 규칙과 무관하게 열려야 한다', () => {
  const fn = cutFn(SRC, 'function downloadViewerOriginal(');
  assert.match(fn, /origOf\(/, '원본이 있는지 안 보고 받으려 든다');
  assert.match(fn, /toast\(|alert\(/, '원본이 없을 때 아무 말도 안 한다');
  assert.match(fn, /a\.href = o\.url/, '적어 둔 주소로 안 간다');
  /* download 표는 남의 서버 파일에 안 먹는다 — 이름은 창고에 적어 두었다 */
  assert.ok(!/a\.download/.test(fn),
    'download 표를 믿고 있다 — 창고 주소에는 안 먹어 이름이 엉뚱해진다');
});

/* ── ⑥ 창고 규칙이 그 자리를 열어 두었나 ── */
test('창고 규칙에 한글 원본 자리가 «본인만»으로 열려 있다', () => {
  const rules = fs.readFileSync(
    path.join(ROOT, 'docs/firebase-storage-전체(붙여넣기용).txt'), 'utf8');
  const i = rules.indexOf('match /pu_photos/u/{uid}/origs/');
  assert.ok(i > 0,
    '원본 자리가 규칙에 없다 — 지금 규칙은 그림만 받아서(okImage) 한글이 막힌다');
  const seg = rules.slice(i, i + 600);
  /* 종류로 묶으면 안 된다 — 한글은 브라우저가 종류를 안 알려 주는 일이 흔하다 */
  assert.ok(!/okImage\(\)/.test(seg.slice(0, seg.indexOf('}'))),
    '그림만 받는 검사가 걸려 있다 — 한글이 통째로 막힌다');
  assert.match(seg, /request\.resource\.size </, '크기 제한이 없다');
  /* 범위는 사진첩과 같아야 한다 — 더 열면 근로자 이름·임금이 새어 나간다 */
  assert.match(seg, /allow read:[^\n]*request\.auth\.uid == uid/,
    '읽기가 본인보다 넓다 — 근로계약서에는 근로자 이름·임금이 있다');
  assert.match(seg, /allow write:[\s\S]{0,120}request\.auth\.uid == uid/,
    '쓰기가 본인보다 넓다');
  assert.match(seg, /allow delete:[^\n]*request\.auth\.uid == uid/, '지우기가 본인보다 넓다');
});

/* ── 캐시 번호 — 저장 층을 고쳤으면 부르는 화면이 새것을 받아야 한다 ── */
test('저장 층을 부르는 화면이 모두 «같은» 캐시 번호를 쓴다', () => {
  const vs = {};
  fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = /pu-photo-store\.js\?v=(\d+)/.exec(s);
    if (m) vs[f] = m[1];
  });
  const names = Object.keys(vs);
  assert.ok(names.length >= 2, '저장 층을 부르는 화면을 못 찾았다');
  const uniq = Array.from(new Set(Object.values(vs)));
  assert.strictEqual(uniq.length, 1,
    '화면마다 캐시 번호가 다르다 — 어떤 화면은 옛 저장 층을 쓴다: ' + JSON.stringify(vs));
});
