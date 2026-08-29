/* 「원본 위에 겹쳐 쓰기」 — 입력칸을 «어느 자리»에 얹을지 셈한다.
   HTML 표로 서식을 흉내 내면 서식마다 새로 깨진다(대표 제보 2026-08-29:
   「현 주 소」가 두 줄로, 「사진부착(3.5cm×4.5cm)」이 한 글자씩 세로로, 세로 라벨이 겹침).
   원본 그림 위에 얹으면 깨질 구석이 없다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/kcareer-overlay.js');

const run = (text, x, y, w, h) => ({ text: text, x: x, y: y, w: w, h: h || 16 });

test('칸마다 «다른» 표식을 심는다 — 같으면 누가 어디인지 못 가린다', () => {
  const p = O.markPlan([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const ms = Object.keys(p.marks);
  assert.equal(ms.length, 3);
  assert.equal(new Set(ms).size, 3, '표식이 겹치면 안 됩니다');
  assert.equal(p.marks[p.values.a], 'a');
});

test('도장 자리에는 표식을 심지 않는다 — 거기에 글자를 넣으면 안 된다', () => {
  const p = O.markPlan([{ id: 'a' }, { id: 'seal', guess: '__stamp' }]);
  assert.equal(p.values.seal, undefined);
  assert.equal(Object.keys(p.marks).length, 1);
});

test('표식은 서식에 나올 리 없는 글자다 — 진짜 글자를 쓰면 원본과 헷갈린다', () => {
  const m = O.markOf(0);
  assert.ok(/[\uE000-\uF8FF]/.test(m), '사용자 영역 글자여야 합니다');
  assert.doesNotMatch(m, /[가-힣a-zA-Z0-9]/);
});

test('★ 빈 칸이면 «그 칸의 크기»를 그대로 쓴다 — 표식 글자 폭이 아니라', () => {
  const p = O.markPlan([{ id: 't0r0c1' }]);
  const mark = p.values.t0r0c1;
  const probe = [run(mark, 545, 146, 48)];
  const clean = [run('생년월일', 398, 146, 62), run('', 545, 146, 134)];
  const box = O.boxesFrom(probe, clean, p.marks, 698).t0r0c1;
  assert.equal(box.x, 545);
  assert.equal(box.w, 134, '칸 폭을 써야 입력칸이 칸에 맞습니다');
});

test('★ 안내글 뒤(「(한글)」)는 그 글자 «뒤»부터 다음 칸 앞까지', () => {
  const p = O.markPlan([{ id: 't0r0c1' }]);
  const probe = [run('(한글)' + p.values.t0r0c1, 250, 146, 95)];
  const clean = [run('(한글)', 250, 146, 47), run('생년월일', 398, 146, 62)];
  const box = O.boxesFrom(probe, clean, p.marks, 698).t0r0c1;
  assert.ok(box.x >= 297, '안내글을 덮으면 안 됩니다 (x=' + box.x + ')');
  assert.ok(box.x + box.w <= 398, '다음 칸을 침범하면 안 됩니다');
});

test('같은 줄에 다음 칸이 없으면 본문 오른쪽 끝까지', () => {
  const p = O.markPlan([{ id: 'x' }]);
  const box = O.boxesFrom([run('현주소' + p.values.x, 300, 178, 90)],
                          [run('현주소', 300, 178, 50)], p.marks, 698).x;
  assert.ok(box.x + box.w <= 698);
  assert.ok(box.w > 200, '남은 자리를 다 써야 주소가 들어갑니다');
});

test('줄이 조금 어긋나도 같은 줄로 본다 — 글자마다 기준선이 다르다', () => {
  assert.equal(O.sameLine({ y: 146, h: 16 }, { y: 149, h: 16 }), true);
  assert.equal(O.sameLine({ y: 146, h: 16 }, { y: 178, h: 16 }), false);
});

test('★ 못 쓸 상자는 «버린다» — 잘못 얹느니 안 얹는다', () => {
  assert.equal(O.usable({ x: 10, y: 10, w: 5, h: 16 }, 794, 1123), false, '너무 좁음');
  assert.equal(O.usable({ x: 700, y: 10, w: 200, h: 16 }, 794, 1123), false, '종이 밖으로 나감');
  assert.equal(O.usable({ x: -5, y: 10, w: 100, h: 16 }, 794, 1123), false);
  assert.equal(O.usable({ x: 100, y: 10, w: 200, h: 16 }, 794, 1123), true);
});

test('표식이 여러 번 나와도 «처음 것»만 쓴다 — 뒤엣것은 겹쳐 그려진 것이다', () => {
  const p = O.markPlan([{ id: 'a' }]);
  const m = p.values.a;
  const box = O.boxesFrom([run(m, 100, 50, 40), run(m, 400, 900, 40)],
                          [run('', 100, 50, 200)], p.marks, 698).a;
  assert.equal(box.y, 50);
});

/* ── 화면 연결 ── */
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('겹치기 모듈을 읽어 들인다 — 캐시 번호를 붙여서', () => {
  assert.match(source, /js\/kcareer-overlay\.js\?v=\d+/);
});

test('★ 입력판은 «원본 그림»을 그린다 — HTML 표로 흉내 내지 않는다', () => {
  const at = bare.indexOf('async function rhBuildInput');
  const fn = bare.slice(at, at + 4200);
  assert.match(fn, /renderPageToCanvas|_rhLayout/, '엔진이 그린 쪽을 써야 합니다');
  assert.doesNotMatch(fn, /KcareerFormHtml\.toHtml/, '표를 흉내 내면 서식마다 깨집니다');
});

test('★ 두 번 재서 «누가 어느 칸인지»를 정한다 — 순서로 짐작하지 않는다', () => {
  const at = bare.indexOf('async function rhBuildInput');
  const fn = bare.slice(at, at + 4200);
  assert.match(fn, /KcareerOverlay\.markPlan/, '칸마다 표식을 심어야 합니다');
  assert.match(fn, /KcareerOverlay\.boxesFrom/, '표식 자리로 상자를 얻어야 합니다');
});

test('못 쓸 상자는 얹지 않는다 — 잘못 얹느니 안 얹는다', () => {
  const at = bare.indexOf('async function rhBuildInput');
  assert.match(bare.slice(at, at + 4200), /KcareerOverlay\.usable\(/);
});

test('도장 자리에는 입력칸을 얹지 않는다 — 거기엔 글자가 아니라 도장이 간다', () => {
  const at = bare.indexOf('async function rhBuildInput');
  assert.match(bare.slice(at, at + 4200), /guess\s*===\s*"__stamp"/);
});

test('칠 자리를 못 찾으면 «칸 지도로 채우라»고 알린다 — 막다른 길을 두지 않는다', () => {
  const at = bare.indexOf('async function rhBuildInput');
  assert.match(bare.slice(at, at + 4200), /칸 지도로 채워 주세요/);
});

test('표식판은 «그리지 않는다» — 재기만 하면 되므로 두 번 그리면 느리다', () => {
  const at = bare.indexOf('async function _rhLayout');
  const fn = bare.slice(at, at + 1200);
  assert.match(fn, /if\(withCanvas\)/, '캔버스는 필요할 때만 만들어야 합니다');
});

test('★ 한글 서식은 «화면 하나»만 — 옆 미리보기를 또 띄우지 않는다', () => {
  /* 대표 제보(2026-08-29): 「새 양식을 넣었는데 두 개 다른 화면이 된다」.
     편집기가 원본을 그대로 그리므로 옆에 또 띄우면 다른 문서 둘로 보인다. */
  const at = bare.indexOf('async function importTemplateFile');
  const fn = bare.slice(at, at + 2200);
  assert.match(fn, /hideSidePreview\(\)/, '열려 있던 옛 미리보기를 닫아야 합니다');
  assert.match(fn, /else showSidePreview\(tempId\)/, 'PDF·DOCX 는 그대로 두어야 합니다');
});

test('보관함에서 열 때도 한글이면 옆 미리보기를 닫는다', () => {
  assert.match(bare, /_isHwpName\(t\.name\)[\s\S]{0,80}hideSidePreview\(\)/);
});

test('「이력서 생성·보관」이 첫 자리다 (대표 지시 2026-08-29)', () => {
  const at = bare.indexOf("{g:'이력서관리'");
  const line = bare.slice(at, at + 260);
  const iHub = line.indexOf('page-resume-hub');
  const iQuick = line.indexOf('page-quickcv');
  assert.ok(iHub > 0 && iQuick > 0, '두 화면이 모두 있어야 합니다');
  assert.ok(iHub < iQuick, '이력서 생성·보관이 빠른 이력서보다 앞이어야 합니다');
});
