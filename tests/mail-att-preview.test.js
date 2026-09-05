/* 첨부 미리보기 (대표 승인 목업 2026-09-05)
   「첨부자료도 미리보기 화면이 있어야 되는데 이부분은 없다」
   「한글 파일 등에 대한 미리보기 또는 pdf 미리보기 등을 모두 만들었으면 좋겠다.
    그래야 바이러스 걸러낼 것 같다」

   ★★ 대표님 말씀이 맞다 — 한글·워드 파일의 위험은 «그 프로그램이 열 때» 터진다.
     여기서는 한글도 워드도 열지 않는다. 파일 속에서 «글자만» 뽑아 우리 화면에 그린다.
     PDF 도 보기틀에 맡기지 않고 pdf.js 로 읽어 «그림처럼» 그린다.
     그래서 무엇인지 보고 나서 내려받을지 말지 정할 수 있다 — 지금까지는 무엇인지
     보려면 «반드시 내려받아 열어야» 했다.
   ⚠ 그렇다고 백신은 아니다. 이 검사는 그 선을 넘지 않는지를 지킨다.

   지키는 것.
   ① 무엇을 그릴 수 있는지 한 자리에서 정한다 — 못 그리면 흐린 단추
   ② PDF 를 «보기틀에 맡기지 않는다» — 우리가 그린다
   ③ 종류를 «우리가» 못 박는다 — 메일이 적어 보낸 종류를 믿지 않는다
   ④ 글은 «글자로» 그린다 — 남의 HTML 을 우리 화면에 붙이지 않는다
   ⑤ 판독기는 «누를 때» 부른다 — 메일함 여는 속도를 망치지 않는다
   ⑥ 창을 닫으면 그 파일은 사라진다
   ⑦ 큰 파일은 먼저 여쭙는다
   ⑧ PC 와 폰 «둘 다» 그린다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

function kindCtx(){
  const ctx = { console };
  vm.createContext(ctx);
  ['MB_PV_IMG', 'MB_PV_TXT', 'MB_PV_DOC', 'MB_PV_XLS'].forEach(k=>{
    const m = bare.match(new RegExp('const ' + k + '\\s*=\\s*(\\{[^}]*\\})'));
    assert.ok(m, k + ' 을 못 찾았습니다');
    vm.runInContext('const ' + k + ' = ' + m[1] + ';', ctx);
  });
  vm.runInContext(sliceFn(app, 'function mbPvExt('), ctx);
  vm.runInContext(sliceFn(app, 'function mbPvKind('), ctx);
  return ctx;
}

/* ══════ ① 무엇을 그릴 수 있나 ══════ */

test('★★ 한글·PDF 를 «둘 다» 그린다 — 대표께서 이름 대어 말씀하신 둘이다', () => {
  const c = kindCtx();
  assert.equal(c.mbPvKind('전문심리위원 후보자 명단 재등재 안내.hwp', ''), 'doc',
    '한글 파일을 못 그립니다');
  assert.equal(c.mbPvKind('안내.hwpx', ''), 'doc', '새 한글(.hwpx)을 못 그립니다');
  assert.equal(c.mbPvKind('[사 제30호증] 사실확인서.pdf', ''), 'pdf', 'PDF 를 못 그립니다');
});

test('★★ 그릴 수 있는 것과 없는 것을 «한 자리»에서 가른다', () => {
  const c = kindCtx();
  [['a.docx','doc'], ['a.doc','doc'], ['a.rtf','doc'], ['a.odt','doc'],
   ['a.jpg','img'], ['a.JPG','img'], ['a.png','img'],
   ['a.xlsx','xls'], ['a.xls','xls'],
   ['a.txt','txt'], ['a.csv','txt']].forEach(([n, want])=>{
    assert.equal(c.mbPvKind(n, ''), want, n + ' 을 ' + want + ' 로 안 봅니다');
  });
  /* 못 그리는 것 — 흐린 단추가 되어야 한다 */
  ['a.zip', 'a.exe', 'a.pptx', 'a.alz', 'a'].forEach(n=>{
    assert.equal(c.mbPvKind(n, ''), '', n + ' 을 그릴 수 있다고 합니다 — 눌러도 아무 일이 안 납니다');
  });
});

test('★★ 확장자가 없어도 «메일이 적어 온 종류»로 한 번 더 본다', () => {
  const c = kindCtx();
  assert.equal(c.mbPvKind('이름없는첨부', 'application/pdf'), 'pdf');
  assert.equal(c.mbPvKind('이름없는첨부', 'image/png'), 'img');
  assert.equal(c.mbPvKind('이름없는첨부', 'text/plain'), 'txt');
});

test('★★ 못 그리는 첨부에는 «흐린 단추»를 둔다 — 감추지도, 켜 두지도 않는다', () => {
  const rd = sliceFn(app, 'function mbReadHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(rd, /mbPvKind\(a\.name,\s*a\.mime\)/, '첨부 줄이 그릴 수 있는지 안 묻습니다');
  assert.match(rd, /미리보기 없음/, '못 그리는 것을 그냥 감춥니다 — 왜 없는지 알 길이 없습니다');
  assert.match(rd, /peek off[\s\S]{0,80}disabled/,
    '못 그리는데 단추가 살아 있습니다 — 눌러 놓고 아무 일도 안 일어납니다');
});

/* ══════ ②③④ 안전 ══════ */

test('★★ PDF 를 «보기틀에 맡기지 않는다» — 우리가 그린다', () => {
  const h = sliceFn(app, 'function mbPvHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/<iframe/.test(h),
    '첨부를 iframe 으로 띄웁니다 — 그 안에서 무엇이 도는지 우리가 못 정합니다');
  assert.match(h, /canvas id="mbPvCanvas"/, '캔버스에 그리지 않습니다');
  const d = sliceFn(app, 'function mbPvPdfDraw(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(d, /pg\.render\(/, 'pdf.js 로 그리지 않습니다');
});

test('★★ 종류를 «우리가» 못 박는다 — 메일이 적어 보낸 종류를 믿지 않는다', () => {
  const d = sliceFn(app, 'function mbPvDraw(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const blobs = d.match(/new Blob\([\s\S]{0,90}/g) || [];
  assert.ok(blobs.length, '파일을 담는 자리가 없습니다');
  blobs.forEach(b=>{
    assert.ok(!/a\.mime|j\.mime/.test(b),
      '메일이 적어 보낸 종류를 그대로 씁니다: ' + b + ' — 엉뚱한 것이 그 종류인 척하며 열립니다');
  });
});

test('★★ 글은 «글자로» 그린다 — 남의 HTML 을 우리 화면에 붙이지 않는다', () => {
  const h = sliceFn(app, 'function mbPvHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(h, /pvtext">\$\{esc\(p\.text\)\}/,
    '첨부에서 뽑은 글을 «그대로» 붙입니다 — 그 안에 든 꼬리표가 살아납니다');
  assert.match(h, /esc\(String\(c==null\?''\:c\)\)/,
    '엑셀 칸을 그대로 붙입니다');
  assert.match(h, /esc\(p\.name\)/, '파일 이름을 그대로 붙입니다');
});

/* ══════ ⑤ 늦어지지 않게 ══════ */

test('★★ 판독기를 «누를 때» 부른다 — 메일함 여는 속도를 망치면 안 된다', () => {
  /* pdf.min.js 1.3MB · xlsx 880KB — 머리말에 달면 메일함이 그만큼 늦게 열린다.
     지금 고치고 있는 것이 바로 그 문제다. */
  const head = app.slice(0, app.indexOf('</head>'));
  ['vendor/pdf.min.js', 'vendor/xlsx.full.min.js', 'vendor/pako.min.js', 'hwp_extract.js']
    .forEach(f=>{
      assert.ok(head.indexOf('src="' + f) < 0,
        f + ' 를 머리말에서 미리 싣습니다 — 메일함이 그만큼 늦게 열립니다');
    });
  const d = sliceFn(app, 'function mbPvDraw(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(d, /mbPvLib\(/, '판독기를 그때 부르지 않습니다');
});

test('★★ 옛 한글(.hwp)일 때만 큰 판독기를 부른다 — 880KB 를 늘 받으면 안 된다', () => {
  const d = sliceFn(app, 'function mbPvDraw(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = d.indexOf('0xd0');
  assert.ok(i > 0, 'CFB(옛 한글)인지 안 봅니다 — 모든 문서에 큰 판독기를 부릅니다');
  assert.match(d.slice(i, i + 220), /xlsx\.full\.min\.js/,
    '큰 판독기를 부르는 자리가 CFB 판정과 이어져 있지 않습니다');
});

/* ══════ ⑥⑦⑧ 뒷정리·물음·두 화면 ══════ */

test('★★ 창을 닫으면 그 파일은 «사라진다»', () => {
  const c = sliceFn(app, 'function mbPvClose(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(c, /revokeObjectURL/, '연 파일을 안 놓아 줍니다 — 창에 그대로 쌓입니다');
  assert.match(c, /state\.mbPv\s*=\s*null/, '창을 안 닫습니다');
});

test('★★ 큰 파일은 «먼저 여쭙는다»', () => {
  const f = sliceFn(app, 'function mbAttPeek(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /MB_PV_MAX/, '크기를 안 봅니다');
  const i = f.indexOf('MB_PV_MAX');
  assert.match(f.slice(i, i + 160), /confirm\(/,
    '큰 첨부를 묻지도 않고 받습니다 — 20MB 를 기다리는 줄 모르고 기다립니다');
  const m = bare.match(/const MB_PV_MAX\s*=\s*([^;]+);/);
  assert.ok(m && /1024/.test(m[1]), 'MB_PV_MAX 가 바이트가 아닙니다: ' + (m && m[1]));
});

test('★★ PC 와 폰 «둘 다» 그린다 — 한쪽만 달면 그 화면에서는 눌러도 아무 일이 없다', () => {
  assert.match(bare, /\$\{mbPvHtml\(\)\}/, 'PC 화면이 미리보기 창을 안 그립니다');
  const m = sliceFn(app, 'function mbMobileHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(m, /mbReadHtml\(\)\s*\+\s*mbPvHtml\(\)/, '폰 화면이 미리보기 창을 안 그립니다');
  /* PDF 는 화면이 그려진 «뒤»에 그려야 한다 — 두 화면 모두 */
  const n = (bare.match(/mbPvAfter\(\)/g) || []).length;
  assert.ok(n >= 3, 'PDF 를 그리라고 부르는 자리가 ' + n + '곳뿐입니다(만드는 자리 + PC + 폰)');
});

/* ══════ 곁들이 — 크기 적기 ══════ */

test('★★ 작은 첨부를 «0.0MB» 라고 적지 않는다', () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function fmtMB('), ctx);
  assert.equal(ctx.fmtMB(20 * 1024), '20KB',
    '20KB 짜리를 「0.0MB」라고 적습니다 — 크기를 적어 놓고 아무것도 안 알려 줍니다');
  assert.equal(ctx.fmtMB(1.2 * 1024 * 1024), '1.2MB', '큰 것은 예전처럼 MB 로 적어야 합니다');
  assert.equal(ctx.fmtMB(0), '0.0MB', '크기를 모를 때는 예전 그대로 둡니다');
});

/* ══════ 이름이 겹치지 않았나 ══════ */

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다', () => {
  ['mbPvExt','mbPvKind','mbPvLib','mbPvClose','mbAttPeek','mbPvDraw',
   'mbPvPdfDraw','mbPvPage','mbPvAfter','mbPvHtml'].forEach(n=>{
    const c = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(c, 1, n + ' 이 ' + c + '번 선언돼 있습니다 — 겹치면 뒤엣것이 조용히 이깁니다');
  });
});
