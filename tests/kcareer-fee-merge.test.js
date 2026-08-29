/* 비용관리 — 회의비용·기타비용을 한 화면으로 (대표 검토·승인 2026-08-29)
   두 화면은 칸·열·검색·「구분」 고르기가 «완전히 같았다». 코드가 통째로 복사돼 있었고
   다른 것은 새로 만들 때의 기본 구분(회의/기타)뿐이었다.
   → 「구분」이 이미 하는 일을 화면 둘로 또 나눈 것이라, 어디에 넣었는지 찾아 헤매게 된다.
   ⚠ 기록은 «옮기지 않는다» — 옮기다 잃는 것이 합치는 이득보다 크다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('비용 화면은 두 저장소를 «함께» 읽는다 — 기록을 옮기지 않고 한 표에 모은다', () => {
  assert.match(bare, /stores:\s*\['meetfee'\s*,\s*'etcfee'\]/);
  assert.match(bare, /cfg\.stores\s*\?/, '두 저장소를 읽는 길이 있어야 합니다');
});

test('★ 줄마다 «온 곳»을 들고 다닌다 — 잃으면 기타비용을 고칠 때 사본이 생긴다', () => {
  assert.match(bare, /_st:\s*st/, '어느 저장소에서 왔는지 표시해야 합니다');
  assert.match(bare, /_stOf\[rid\]/, '줄을 눌렀을 때 자기 저장소로 가야 합니다');
  assert.match(bare, /openEditDrawer\(rst, rid\)/, '남의 저장소로 저장하면 원본이 갈라집니다');
});

test('기타비용을 고치면 합친 표도 다시 그린다 — 안 그리면 「저장했는데 그대로」', () => {
  assert.match(bare, /if\(name==='etcfee'\)[\s\S]{0,120}renderCareer\('meetfee'\)/);
});

test('사이드바 메뉴가 하나로 줄었다', () => {
  assert.match(bare, /\{g:'회의·비용관리', items:\[\['page-meetfee','비용관리'\]\]\}/);
  assert.doesNotMatch(bare, /\['page-etcfee','기타비용신청'\]/);
});

test('★ 기타비용 화면은 «남겨 둔다» — 옛 기록을 고칠 자리가 사라지면 안 된다', () => {
  assert.ok(source.indexOf('id="page-etcfee"') > 0, '화면이 사라지면 옛 기록을 못 고칩니다');
  assert.match(bare, /etcfee:\{title:'기타비용신청'/, '옛 기록의 서식 정의도 남아야 합니다');
});

test('「구분」 칩으로 거른다 — 거르는 규칙은 «한 곳»에만 둔다', () => {
  assert.match(bare, /function renderFeeChips/);
  const at = bare.indexOf('function renderFeeChips');
  const fn = bare.slice(at, at + 1400);
  assert.match(fn, /sel\.value\s*=\s*b\.dataset\.t/, '칩은 고르개를 움직여야 합니다');
  assert.doesNotMatch(fn, /rows\.filter/, '칩이 따로 거르면 고르개와 어긋납니다');
  assert.match(fn, /cnt\[k\]/, '칩마다 건수를 적어야 눌러 보기 전에 압니다');
});

test('칩 종류는 «고르개에서» 가져온다 — 두 곳에 적으면 한쪽만 늘어난다', () => {
  const at = bare.indexOf('function renderFeeChips');
  assert.match(bare.slice(at, at + 800), /sel\.options/);
});

/* ── 한글 → PDF 바로 받기 (대표 결정 2026-08-29) ──
   지금까지는 인쇄창을 거쳐 사람이 「PDF로 저장」을 골라야 했다 — 그건 «자동»이 아니다.
   ⚠ 바깥 라이브러리를 갈아 끼우지 않는다. 조사 결과 LibreOffice 의 HWP 필터는
     한글 '97 이전만 읽고 그 뒤 판은 조용히 망가뜨리며, hwp.js 는 HWP5(이진)만 읽는다.
     이미 쓰는 rhwp-core 가 hwp·hwpx 둘 다 읽고 A4로 그린다 — 그 캔버스를 묶기만 하면 된다. */

test('★ 인쇄창 없이 «바로» PDF 파일로 떨군다', () => {
  assert.match(bare, /function hwpViewPdfFile/);
  const at = bare.indexOf('function hwpViewPdfFile');
  const fn = bare.slice(at, at + 1600);
  assert.match(fn, /pdf\.save\(/, '파일로 떨어져야 «자동»입니다');
  assert.doesNotMatch(fn, /\.print\(\)/, '인쇄창을 거치면 사람이 또 골라야 합니다');
});

test('쪽마다 «그 쪽의 가로세로»로 만든다 — 가로 쪽이 섞여도 안 찌그러진다', () => {
  const at = bare.indexOf('function hwpViewPdfFile');
  const fn = bare.slice(at, at + 1600);
  assert.match(fn, /c\.width\s*>\s*c\.height/);
  assert.match(fn, /Math\.min\(pw\s*\/\s*c\.width,\s*ph\s*\/\s*c\.height\)/, '비율을 지켜야 합니다');
});

test('인쇄 길도 «남긴다» — 종이로 뽑거나 미리 볼 일이 있다', () => {
  assert.match(bare, /function hwpViewPdf\(/);
  assert.ok(source.indexOf('hwpViewPdfFile()') > 0 && source.indexOf('hwpViewPdf()') > 0,
    '받기와 인쇄 단추가 모두 있어야 합니다');
});

test('PDF 도구를 못 불러오면 «인쇄로 뽑으라»고 알린다 — 막다른 길을 두지 않는다', () => {
  const at = bare.indexOf('function hwpViewPdfFile');
  assert.match(bare.slice(at, at + 1000), /인쇄/);
});
