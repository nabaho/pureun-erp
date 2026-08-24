'use strict';
/* 열 쪽이 넘는 문서를 «다 담고», 판독은 덩이로 나눠 읽어 합친다 (대표 지시 2026-08-24)

   ■ 무엇이 문제였나

   한 파일에서 담는 쪽을 10쪽으로 묶어 두었다. 그 까닭은 담기가 아니라 **판독**이었다
   — 그림 열 장을 한 번에 AI 에 넣으면 뒤쪽을 못 본다. 그래서 취업규칙 24쪽을 올리면
   앞 10쪽만 들어가고, 화면에서는 멀쩡해 보이는데 **뒷부분이 통째로 없었다.**

   ■ 고친 방향

     ① 담는 쪽 상한을 올린다(10 → 50). 대신 한 번에 펼칠 쪽의 **총합**을 따로 둔다.
     ② 장수 상한(UPLOAD_MAX)은 «고른 사진»에만 걸린다 — 쪽은 「다시 골라 주세요」가
        불가능한 것이라(그 파일을 또 올리면 첫 쪽부터 온다) 거기 섞으면 안 된다.
     ③ 판독은 10쪽(그림)·25쪽(글자)씩 **덩이**로 나눠 차례로 읽고 한 벌로 합친다.
        앞 덩이가 이기고, pairs 만 이어 붙이고, 한 덩이라도 못 읽으면 확인필요로 둔다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function numOf(name) {
  const m = app.match(new RegExp('^const ' + name + ' = (\\d+);', 'm'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return Number(m[1]);
}

/* ══════ ① 담는 쪽 상한 ══════ */

test('★ 한 문서에서 열 쪽보다 훨씬 많이 담는다 — 취업규칙은 20~40쪽이다', () => {
  const n = numOf('PDF_MAX_PAGES');
  assert.ok(n >= 30, '★ 상한이 ' + n + '쪽입니다 — 취업규칙·단체협약이 잘립니다');
  assert.ok(n <= 200, '상한이 사실상 없으면 책 한 권이 창고로 들어갑니다: ' + n);
});

test('★ 한 번에 펼치는 쪽의 «총합»에도 상한이 있다 — 큰 문서 다섯 개면 250장이다', () => {
  const b = numOf('PDF_PAGE_BUDGET');
  assert.ok(b >= numOf('PDF_MAX_PAGES'),
    '★ 총합이 한 문서 상한보다 작으면 큰 문서를 혼자서도 못 올립니다');
  const fn = cutFn(app, 'async function addFiles(');
  assert.match(fn, /pageUsed \+ r\.pages\.length > PDF_PAGE_BUDGET/,
    '★ 총합을 안 지키면 창고와 판독이 함께 터집니다');
});

test('★ 예산이 모자라면 그 문서를 «통째로» 안 담는다 — 반쯤 담긴 문서가 더 나쁘다', () => {
  const fn = cutFn(app, 'async function addFiles(');
  const i = fn.indexOf('PDF_PAGE_BUDGET');
  const seg = fn.slice(i, i + 200);
  assert.match(seg, /dropDocs\.push\(/, '못 담은 문서를 안 적어 둡니다');
  assert.match(seg, /continue;/,
    '★ 쪽을 하나씩 세어 담으면 「1~40쪽만 있는 취업규칙」이 생깁니다');
});

test('★ 첫 문서는 늘 통째로 담는다 — 혼자 왔는데 거절하면 올릴 길이 없다', () => {
  const fn = cutFn(app, 'async function addFiles(');
  assert.match(fn, /if \(pageUsed && pageUsed \+ r\.pages\.length > PDF_PAGE_BUDGET\)/,
    '★ pageUsed 를 안 보면 50쪽짜리 하나를 올릴 수 없습니다(예산 60쪽이어도)');
});

test('★ 못 담은 문서는 «이름을 대고» 알린다 — 몇 개라고만 하면 무엇인지 모른다', () => {
  const fn = cutFn(app, 'async function addFiles(');
  assert.match(fn, /dropDocs\.join\('\\n· '\)/, '문서 이름을 안 알려 줍니다');
  assert.match(fn, /한 쪽도 안 담았습니다/,
    '★ 「일부만 담았다」로 읽히면 사람이 확인하지 않고 넘어갑니다');
});

/* ══════ ② 장수 상한은 고른 사진에만 ══════ */

test('★ 문서에서 펼친 쪽은 장수 상한에 안 센다 — 쪽은 「다시 골라」가 불가능하다', () => {
  const fn = cutFn(app, 'async function addFiles(');
  assert.match(fn, /if \(f\.__pdfPage\) \{ kept\.push\(f\); continue; \}/,
    '★ 쪽까지 세면 24쪽 문서 + 사진 일곱 장에서 뒤쪽이 잘리는데, 안내는 ' +
    '「나머지 1장은 다시 골라 주세요」가 됩니다 — 쪽은 다시 고를 수가 없습니다');
  assert.match(fn, /if \(shots < MAX\) \{ shots\+\+; kept\.push\(f\); \} else over\+\+;/,
    '고른 사진은 여전히 상한을 지켜야 합니다');
});

test('★ 「따로 담기」를 고른 쪽에도 표시가 붙는다 — __pdfDoc 으로는 가릴 수 없다', () => {
  const fn = cutFn(app, 'async function addFiles(');
  const i = fn.indexOf('const apart = !!splitBy[base];');
  const seg = fn.slice(i, i + 1200);
  assert.match(seg, /file\.__pdfPage = true;/,
    '★ 「쪽마다 따로」는 __pdfDoc 를 안 붙이므로, 그것으로 가리면 그 쪽들이 ' +
    '사진으로 세어져 30장에서 잘립니다');
  /* ⚠ 「if (!apart) 밖에 있는가」를 중괄호 깊이로 잰다. 앞뒤 순서만 보면 속는다 —
     블록 안으로 옮겨도 바로 위 객체 리터럴의 `}` 가 걸려 통과해 버린다. */
  const at = seg.indexOf('file.__pdfPage = true;');
  const guard = seg.indexOf('if (!apart) {');
  assert.ok(guard >= 0 && at > guard, '자리를 찾지 못했습니다');
  let d = 0;
  for (const ch of seg.slice(guard, at)) {
    if (ch === '{') d++;
    else if (ch === '}') d--;
  }
  assert.equal(d, 0,
    '★ __pdfPage 가 if (!apart) 안에 들어갔습니다 — 따로 담은 쪽이 사진으로 세어져 ' +
    '30장에서 잘립니다');
});

test('사진만 넘칠 때의 안내는 그대로 둔다 — 사진은 정말로 다시 고를 수 있다', () => {
  const fn = cutFn(app, 'async function addFiles(');
  assert.match(fn, /나머지 ' \+ over \+ '장은 다시 골라/);
});

/* ══════ ③ 덩이로 나눠 읽기 ══════ */

test('★ 그림은 열 장씩, 글자는 더 많이 — 한 번에 다 넣으면 뒤쪽을 못 본다', () => {
  const img = numOf('READ_CHUNK_IMG');
  const txt = numOf('READ_CHUNK_TXT');
  assert.ok(img > 0 && img <= 10,
    '★ 그림을 열 장 넘게 한 번에 넣으면 AI 가 뒤쪽을 못 봅니다: ' + img);
  assert.ok(txt > img, '글자는 그림보다 훨씬 가볍습니다 — 같은 수로 자르면 헛되게 여러 번 부릅니다');
});

/* 합치는 규칙을 실제로 돌린다 — 모양만 보면 「빈 칸만 채운다」를 증명할 수 없다. */
const M = (function () {
  const c = { Object, Array, String, Number, Boolean };
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function mergeReads(') + '\n' + cutFn(app, 'function chunkOf('), c);
  return c;
})();

const chunk = function (fields, extra) {
  return Object.assign({ kind: 'form', fields: fields, bizNoOk: null, error: null }, extra || {});
};

test('★ 앞 덩이가 이긴다 — 뒤쪽에는 붙임서류·다른 회사 이름이 섞여 있다', () => {
  const r = M.mergeReads([
    chunk({ docName: '취업규칙', company: '가나기업' }),
    chunk({ docName: '별지 제1호', company: '다라기업' })
  ]);
  assert.equal(r.fields.docName, '취업규칙', '★ 제목이 뒤 덩이 것으로 덮였습니다');
  assert.equal(r.fields.company, '가나기업');
});

test('★ 뒤 덩이는 «빈 칸만» 채운다 — 앞에 없던 것은 살려야 한다', () => {
  const r = M.mergeReads([
    chunk({ docName: '취업규칙' }),
    chunk({ docName: '', ceo: '홍길동', address: '서울' })
  ]);
  assert.equal(r.fields.ceo, '홍길동', '★ 뒤 덩이에서만 나온 값을 버리고 있습니다');
  assert.equal(r.fields.address, '서울');
});

test('빈 문자열·공백은 「채워졌다」로 보지 않는다', () => {
  const r = M.mergeReads([chunk({ ceo: '   ' }), chunk({ ceo: '홍길동' })]);
  assert.equal(r.fields.ceo, '홍길동', '★ 공백이 자리를 차지해 진짜 값이 못 들어갑니다');
});

test('★ pairs 는 «이어 붙인다» — 쪽 차례를 담은 유일한 값이다', () => {
  const r = M.mergeReads([
    chunk({ pairs: [{ k: '제1조', v: '목적' }] }),
    chunk({ pairs: [{ k: '제20조', v: '징계' }] })
  ]);
  assert.equal(r.fields.pairs.length, 2,
    '★ 덮어쓰면 첫 덩이의 것만 남아 뒤쪽 조문이 통째로 사라집니다');
  assert.equal(r.fields.pairs[0].k, '제1조', '쪽 차례가 뒤집혔습니다');
  assert.equal(r.fields.pairs[1].k, '제20조');
});

test('★ 사업자번호 검산은 «그 번호를 준 덩이»의 것을 쓴다', () => {
  /* 첫 덩이에 번호가 없는데 첫 덩이의 검산 결과를 그대로 두면, 번호는 뒤에서 온
     것인데 「검증 못 함」으로 남아 멀쩡한 서류가 확인필요로 간다. */
  const r = M.mergeReads([
    chunk({ docName: '계약서' }, { bizNoOk: null, ntsChecked: false }),
    chunk({ bizno: '312-81-28123' }, { bizNoOk: true, ntsChecked: true, ntsState: '계속사업자' })
  ]);
  assert.equal(r.fields.bizno, '312-81-28123');
  assert.equal(r.bizNoOk, true, '★ 번호는 받아 놓고 검산 결과는 안 받았습니다');
  assert.equal(r.ntsChecked, true);
  assert.equal(r.ntsState, '계속사업자');
});

test('★ 한 덩이라도 못 읽었으면 그 사실을 남긴다 — 반쪽 판독이 안 읽은 것보다 나쁘다', () => {
  const r = M.mergeReads([
    chunk({ docName: '취업규칙' }),
    { kind: 'other', fields: {}, error: 'AI 가 바쁩니다' }
  ]);
  assert.equal(r.partial, 1, '★ 못 읽은 덩이를 안 세면 「다 읽었다」로 넘어갑니다');
  assert.equal(r.chunks, 2);
  assert.equal(r.fields.docName, '취업규칙', '살아남은 덩이는 살려야 합니다');
});

test('다 읽었으면 partial 을 안 붙인다 — 멀쩡한 것을 확인필요로 보내면 안 된다', () => {
  const r = M.mergeReads([chunk({ docName: 'ㄱ' }), chunk({ ceo: 'ㄴ' })]);
  assert.equal(r.partial, undefined);
  assert.equal(r.chunks, 2);
});

test('하나도 못 읽었으면 첫 실패를 그대로 돌려준다', () => {
  const r = M.mergeReads([{ kind: 'other', fields: {}, error: '앞' }, { error: '뒤' }]);
  assert.equal(r.error, '앞');
});

test('덩이 자르기 — 딱 맞을 때 빈 덩이를 만들지 않는다', () => {
  assert.equal(M.chunkOf([1, 2, 3, 4], 2).length, 2);
  assert.equal(M.chunkOf([1, 2, 3], 2).length, 2);
  assert.equal(M.chunkOf([], 2).length, 0);
  assert.equal(M.chunkOf(null, 2).length, 0);
  assert.deepEqual(M.chunkOf([1, 2, 3], 2)[1], [3]);
});

/* ══════ ④ 배선 ══════ */

test('★ 덩이는 «한 번에 하나씩» 읽는다 — 한꺼번에 던지면 분당 한도에 다 막힌다', () => {
  const fn = cutFn(app, 'function runReadChunks(');
  assert.ok(!/Promise\.all/.test(fn), '★ 덩이를 동시에 던지고 있습니다');
  assert.match(fn, /reduce\(/, '차례로 잇지 않습니다');
});

test('★ 한 덩이가 터져도 앞 덩이는 살린다', () => {
  const fn = cutFn(app, 'function runReadChunks(');
  assert.match(fn, /one\(\)\.catch\(/,
    '★ 마지막 한 덩이 때문에 마흔 쪽을 읽어 놓고 전부 버립니다');
});

test('한 덩이뿐이면 합치는 일을 아예 안 한다 — 대부분이 한 장짜리다', () => {
  const fn = cutFn(app, 'function runReadChunks(');
  assert.match(fn, /if \(mk\.length === 1\) return mk\[0\]\(\);/);
});

test('★ 올릴 때 읽는 길과 다시 읽는 길이 «같은» 덩이 층을 쓴다', () => {
  /* 두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽은 옛 길로 남는다 — 글자 판독에서 겪었다. */
  ['function readDocChunked(', 'function readPhoto('].forEach(function (d) {
    const fn = cutFn(app, d);
    assert.match(fn, /runReadChunks\(/, d + ' 가 덩이 층을 안 씁니다');
  });
  const rp = cutFn(app, 'function readPhoto(');
  assert.match(rp, /runReadChunks\(textChunkMakers\(tx\)\)/, '다시 읽기의 글자 길이 안 나뉩니다');
  assert.match(rp, /runReadChunks\(imgChunkMakers\(imgs\)\)/, '다시 읽기의 그림 길이 안 나뉩니다');
});

test('★ 다시 읽는 길이 쪽 경계를 잃지 않는다 — 이어 붙이면 나눌 수가 없다', () => {
  const fn = cutFn(app, 'function readPhoto(');
  assert.ok(!/\}\)\)\.then\(docTextOf\)/.test(fn),
    '★ 받아 오는 자리에서 바로 이어 붙이면 쪽 경계가 사라져 덩이로 나눌 수 없습니다');
});

test('★ 덩이마다 1쪽부터 다시 세지 않는다 — 「3쪽」이 두 번 나오면 앞뒤를 못 맞춘다', () => {
  const fn = cutFn(app, 'function textChunkMakers(');
  assert.match(fn, /const from = ci \* READ_CHUNK_TXT;/, '쪽 차례를 안 넘깁니다');
  assert.match(fn, /docTextOf\(g, from\)/);
  const dt = cutFn(app, 'function docTextOf(');
  assert.match(dt, /'--- ' \+ \(off \+ i \+ 1\) \+ '쪽 ---/, '넘긴 차례를 안 씁니다');
});

test('★ 한 덩이라도 못 읽었으면 «자동 통과»를 주지 않는다 — 두 길 모두', () => {
  ['function startRead(', 'function readPhoto('].forEach(function (d) {
    const fn = cutFn(app, d);
    assert.match(fn, /if \(r\.partial\) \{/, d + ' 가 못 읽은 덩이를 안 봅니다');
    assert.match(fn, /read\.auto = false;/,
      '★ ' + d + ' 에서 반쪽만 읽고 「다 읽었다」로 넘어갑니다 — 사람이 다시 볼 기회가 없어집니다');
    assert.match(fn, /덩이 중 ' \+ r\.partial \+ '덩이를 못 읽었습니다/,
      '왜 확인필요인지 안 알려 줍니다');
  });
});

test('몇 덩이로 나눠 읽었는지 남긴다 — 「왜 이 문서만 오래 걸렸나」에 답한다', () => {
  ['function startRead(', 'function readPhoto('].forEach(function (d) {
    assert.match(cutFn(app, d), /if \(r\.chunks > 1\) read\.chunks = r\.chunks;/);
  });
});

test('★ 한 문서에 모으기 상한도 함께 올렸다 — 10 이었던 까닭이 없어졌다', () => {
  /* 「더 넣으면 AI 가 뒤쪽을 못 본다」가 10 의 까닭이었다. 덩이로 나눠 읽으니
     그 까닭이 사라졌다. 까닭이 없어진 상한을 남겨 두면 다음 사람이 못 고친다. */
  assert.ok(numOf('COLLECT_MAX') >= 30, '★ 모으기는 여전히 열 장에서 막힙니다');
  assert.ok(!/더 많으면 AI가 한 번에 못 보고 뒤쪽을 통째로 빠뜨립니다/.test(app),
    '★ 이제 사실이 아닌 까닭이 안내문에 남아 있습니다');
});
