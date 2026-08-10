/* 여러 쪽짜리 스캔 — 쪽마다 따로 판독하고 어느 문서 몇 쪽인지 남긴다
   대표 지시 2026-08-10: "만약 pdf가 여러장이 업로드 되는경우 각각 한장씩
   판독해서 기록을 남겨달라."

   판독은 이미 쪽마다 따로 돌고 있었다(올린 것은 모두 queueRead 를 탄다).
   빠져 있던 것은 **기록**이다 — 올리고 나면 파일 이름을 담지 않으므로
   「(2/3쪽)」이 사라져, 나중에 보면 서로 남남인 사진 석 장이 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── ① 쪽마다 따로 판독한다 ── */
test('★ 스캔은 쪽마다 한 건으로 갈라진다', () => {
  const fn = app.match(/async function pdfToPages\([\s\S]*?\n\}/);
  assert.ok(fn, 'pdfToPages 를 찾지 못했습니다.');
  assert.ok(/page: n, total: total/.test(fn[0]), '몇 쪽인지 안 알려 줍니다.');
  assert.ok(/for \(let n = 1; n <= take; n\+\+\)/.test(fn[0]), '쪽마다 그리지 않습니다.');
});

test('★ 갈라진 쪽도 하나씩 모두 판독 대기열에 들어간다', () => {
  /* 한 장만 읽고 마는 일이 없어야 한다 — 올라간 것은 전부 queueRead 를 탄다. */
  const fn = app.match(/function onQueueChange\([\s\S]*?\n\}/);
  assert.ok(fn, 'onQueueChange 를 찾지 못했습니다.');
  assert.ok(/list\.forEach/.test(fn[0]) && /queueRead\(j\)/.test(fn[0]),
    '올라간 것마다 판독을 걸지 않으면 첫 쪽만 읽힙니다.');
});

test('판독은 한 번에 하나씩 돈다 — 한꺼번에 던지면 서로 막힌다', () => {
  const fn = app.match(/function pumpRead\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'pumpRead 를 찾지 못했습니다.');
  assert.ok(/if \(readBusy \|\| !readQ\.length\) return;/.test(fn[0]),
    '여러 쪽을 동시에 던지면 AI 가 분당 한도에 걸려 전부 막힙니다.');
});

/* ── ② 어느 문서 몇 쪽인지 남긴다 ── */
test('★ 쪽마다 문서 이름·쪽수를 달아 보낸다', () => {
  const m = app.match(/r\.pages\.forEach\(function \(p\) \{[\s\S]*?\n      \}\);/);
  assert.ok(m, '쪽을 파일로 만드는 곳을 찾지 못했습니다.');
  assert.ok(/__pdfDoc = \{/.test(m[0]), '쪽 정보를 안 달면 올린 뒤 사라집니다.');
  ['name:', 'page:', 'total:', 'taken:', 'group:'].forEach(function (k) {
    assert.ok(m[0].indexOf(k) > -1, k + ' 이 빠졌습니다.');
  });
});

test('★ 한 파일의 쪽들은 같은 묶음 번호를 쓴다', () => {
  /* 쪽마다 새로 만들면 묶는 뜻이 사라진다 — forEach 밖에서 한 번만 만들어야 한다. */
  const blk = app.match(/const r = await pdfToPages\(f\);[\s\S]*?\n      \}\);/);
  assert.ok(blk, '스캔을 쪽으로 가르는 부분을 찾지 못했습니다.');
  const made = blk[0].indexOf('PuPhotoStore.newId()');
  const loop = blk[0].indexOf('r.pages.forEach');
  assert.ok(made > -1, '묶음 번호를 만드는 곳이 없습니다.');
  assert.ok(made < loop,
    '묶음 번호를 쪽마다 새로 만들면 묶는 뜻이 사라집니다 — 되풀이 밖에서 한 번만 만들어야 합니다.');
  const inLoop = blk[0].slice(loop);
  assert.ok(!/newId\(\)/.test(inLoop), '되풀이 안에서 또 만들고 있습니다.');
});

test('★ 그 기록이 실제로 저장된다 — 안 담으면 화면에도 안 나온다', () => {
  assert.ok(/if \(f\.__pdfDoc\) meta\.doc = f\.__pdfDoc;/.test(app),
    '쪽 정보를 meta 에 안 담으면 올리는 순간 사라집니다.');
});

/* ── ③ 사람이 볼 수 있어야 한다 ── */
const src = app.match(/function docLabel\(meta\)[\s\S]*?\n\}/)[0];
function label(doc) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.docLabel({ doc: doc });
}

test('★ 「위임계약서 2/3쪽」처럼 보인다', () => {
  assert.equal(label({ name: '위임계약서', page: 2, total: 3, taken: 3 }),
    '위임계약서 2/3쪽');
});

test('★ 한 장짜리에는 안 붙는다 — 할 말이 없다', () => {
  assert.equal(label({ name: '사업자등록증', page: 1, total: 1, taken: 1 }), '');
  assert.equal(label(null), '');
  assert.equal(label(undefined), '');
});

test('★ 상한에 걸려 못 담은 쪽이 있으면 그 사실도 적는다', () => {
  /* 조용히 자르면 "나머지는 어디 갔나"에 답할 수 없다(상한 10쪽). */
  const s = label({ name: '취업규칙', page: 3, total: 24, taken: 10 });
  assert.ok(s.indexOf('3/24쪽') > -1, '전체 쪽수를 안 알려 줍니다.');
  assert.ok(s.indexOf('앞 10쪽만 담음') > -1, '못 담은 쪽이 있다는 사실이 빠졌습니다.');
});

test('★ 칸과 크게 보기 양쪽에 나온다', () => {
  const grid = app.match(/const capTxt = \[[^\]]*\]/);
  assert.ok(grid && /docLabel\(it\.meta\)/.test(grid[0]),
    '칸에 안 나오면 훑어볼 때 무엇의 몇 쪽인지 알 수 없습니다.');
  const view = app.match(/\$\('viewerInfo'\)\.textContent = it[\s\S]*?: '';/);
  assert.ok(view && /docLabel\(it\.meta\)/.test(view[0]),
    '크게 보기 제목줄에 안 나오면 열어 봐도 알 수 없습니다.');
});

test('스캔 파일 이름으로도 찾을 수 있다', () => {
  /* 여러 쪽짜리는 그 이름이 사람이 기억하는 유일한 실마리다. */
  /* ⚠ hayOf 앞머리에는 캐시용 return 이 하나 더 있다 — 거기서 자르면
     정작 찾을 말을 모으는 부분을 못 본다. 함수 끝까지 본다. */
  const fn = app.match(/function hayOf\(it\)[\s\S]*?\n\}/);
  assert.ok(fn, 'hayOf 를 찾지 못했습니다.');
  assert.ok(/m\.doc && m\.doc\.name/.test(fn[0]), '스캔 이름으로 못 찾습니다.');
});
