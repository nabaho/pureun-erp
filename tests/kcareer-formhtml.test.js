/* 서식 입력판 — 받은 한글 서식의 표를 «그대로» HTML 로 그려 그 자리에서 친다.
   대표 제안(2026-08-29): 「한글 파일을 똑같은 형태로 html 로 변환해서 데이터를 넣으면 어떤가」.
   ★ 내는 파일은 여전히 원본 한글이다. 여기서 그리는 HTML 은 «치는 화면»일 뿐이다.
   목업: docs/mockups/kcareer-html-input.html */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/kcareer-formhtml.js');
const M = require('../js/kcareer-formmap.js');
const H = require('../hwpx_gen.js');

const tbl = (rows, w) => H.tablePara(rows, H.cols(w || rows[0].map(() => 1 / rows[0].length)));

test('표를 «표로» 그린다 — 줄줄이 늘어놓으면 서식이 아니다', () => {
  const b = V.build(tbl([['성명', ''], ['주소', '']]));
  const t = b.blocks.filter((x) => x.kind === 'table');
  assert.equal(t.length, 1);
  assert.equal(t[0].rows.length, 2);
  assert.equal(t[0].rows[0].length, 2);
});

test('본문 글도 순서대로 담는다 — 제목·안내문이 빠지면 다른 서식처럼 보인다', () => {
  const xml = H.para('지원서', H.CP.title) + tbl([['성명', '']]) + H.para('끝인사', H.CP.body);
  const kinds = V.build(xml).blocks.map((x) => x.kind);
  assert.deepEqual(kinds, ['para', 'table', 'para']);
  assert.match(V.build(xml).blocks[0].text, /지원서/);
});

test('칸의 행·열·병합을 그대로 옮긴다 — 안 옮기면 표가 어긋난다', () => {
  const b = V.build(tbl([['성명', '', '생년월일', '']]));
  const c = b.blocks[0].rows[0];
  assert.equal(c.length, 4);
  c.forEach((cell) => { assert.equal(cell.rowSpan, 1); assert.equal(cell.colSpan, 1); });
});

test('★ 자리 이름표가 칸 지도와 «같다» — 다르면 화면과 저장이 어긋난다', () => {
  const xml = tbl([['성명', ''], ['주소', '']]);
  const mapIds = M.scan(xml).slots.map((s) => s.id).sort();
  const htmlIds = [];
  V.build(xml).blocks.forEach((bl) => {
    if (bl.kind !== 'table') return;
    bl.rows.forEach((r) => r.forEach((c) => { if (c.slotId) htmlIds.push(c.slotId); }));
  });
  assert.deepEqual(htmlIds.sort(), mapIds);
});

test('글자가 있는 칸은 «못 고치는» 칸으로 — 서식 문구를 지우면 안 된다', () => {
  const b = V.build(tbl([['제출서류', '1. 이력서 1부']]));
  const cells = b.blocks[0].rows[0];
  assert.equal(cells[0].slotId, null, '라벨 칸은 채울 자리가 아닙니다');
  assert.equal(cells[1].slotId, null, '글이 있는 칸은 채울 자리가 아닙니다');
});

test('안내글 「(한글)」은 «남기고» 그 뒤에 칠 자리를 둔다', () => {
  const b = V.build(tbl([['성  명', '(한글)']]));
  const c = b.blocks[0].rows[0][1];
  assert.equal(c.kind, '안내글뒤');
  assert.equal(c.text, '(한글)', '안내글은 화면에 남아야 합니다');
  assert.ok(c.slotId, '뒤에 칠 자리가 있어야 합니다');
});

test('칸 안에 라벨이 여럿이면 «라벨마다» 칠 자리를 둔다 — 자택·직장·직위', () => {
  const b = V.build(tbl([['전화번호', '자택:______  직장:______']]));
  const c = b.blocks[0].rows[0][1];
  assert.equal(c.kind, '칸안라벨');
  assert.ok(c.parts && c.parts.length >= 4, '라벨과 칠 자리가 번갈아 나와야 합니다');
  const keys = c.parts.filter((p) => p.t === 'in').map((p) => p.key);
  assert.ok(keys.indexOf('phoneHome') >= 0 && keys.indexOf('phoneWork') >= 0);
});

test('끝에 붙은 라벨에도 칠 자리를 둔다 — 「직위 :」가 문장 끝이어도', () => {
  const b = V.build(tbl([['현 근무처', '기관명 : 부서명 : 직위 :']]));
  const parts = b.blocks[0].rows[0][1].parts;
  const keys = parts.filter((p) => p.t === 'in').map((p) => p.key);
  assert.deepEqual(keys, ['org', 'dept', 'title']);
});

test('그림·글상자가 섞이면 «못 그린다»고 알린다 — 조용히 빠지면 다른 서식이 된다', () => {
  const xml = tbl([['성명', '']]) + '<hp:drawText><hp:p><hp:run><hp:t>글상자</hp:t></hp:run></hp:p></hp:drawText>';
  assert.equal(V.build(xml).warn.textBoxes, 1);
});

test('HTML 로 뽑으면 표와 입력칸이 나온다 — 값은 이스케이프한다', () => {
  const b = V.build(tbl([['성명', ''], ['비고', '<b>굵게</b> & 그밖']]));
  const html = V.toHtml(b, { values: { t0r0c1: '권형하' } });
  assert.match(html, /<table/);
  assert.match(html, /data-slot="t0r0c1"/);
  assert.match(html, /value="권형하"/);
  assert.doesNotMatch(html, /<b>굵게<\/b>/, '서식 글자를 태그로 흘리면 화면이 깨집니다');
  assert.match(html, /&lt;b&gt;/);
});

test('빈 자리와 채운 자리를 갈라 표시한다 — 노랑·초록', () => {
  const b = V.build(tbl([['성명', ''], ['주소', '']]));
  const html = V.toHtml(b, { values: { t0r0c1: '권형하' } });
  assert.match(html, /class="[^"]*kf-in kf-done[^"]*"[^>]*data-slot="t0r0c1"/);
  assert.match(html, /data-slot="t0r1c1"/);
  assert.doesNotMatch(html.slice(html.indexOf('t0r1c1') - 120, html.indexOf('t0r1c1')), /kf-done/);
});

/* ── 표가 밖으로 밀리던 것 (대표 제보 2026-08-29) ── */

test('★ 열 개수는 «표가 말해 주는» colCnt 를 따른다 — 행마다 칸 수가 다르다(병합)', () => {
  const xml = '<hp:tbl colCnt="6" rowCnt="1"><hp:tr>'
    + cellXml('전화번호', 0, 1, 1, 7000) + cellXml('자택:__', 1, 1, 1, 12000)
    + cellXml('휴대폰', 2, 1, 1, 5000) + cellXml('', 3, 1, 1, 8000)
    + cellXml('E-mail', 4, 1, 1, 5000) + cellXml('', 5, 1, 1, 8000)
    + '</hp:tr></hp:tbl>';
  const b = V.build(xml).blocks[0];
  assert.equal(b.cols, 6);
  assert.equal(V.toHtml({ blocks: [b] }, {}).match(/<col /g).length, 6);
});

test('★ 세로 병합된 열도 너비를 잰다 — 안 재면 그 열이 0이 되어 옆 칸이 밖으로 밀린다', () => {
  /* 대표 서식: 「성 명」·「생년월일」이 세로 두 줄 병합이라 그 열은 rowSpan>1 인 칸뿐이다 */
  const xml = '<hp:tbl colCnt="3" rowCnt="2">'
    + '<hp:tr>' + cellXml('성 명', 0, 1, 2, 7000) + cellXml('(한글)', 1, 1, 1, 15000)
    + cellXml('생년월일', 2, 1, 2, 8000) + '</hp:tr>'
    + '<hp:tr>' + cellXml('(한자)', 1, 1, 1, 15000) + '</hp:tr></hp:tbl>';
  const b = V.build(xml).blocks[0];
  assert.equal(b.widths.length, 3);
  b.widths.forEach((w, i) => assert.ok(w > 0, i + '번째 열이 너비를 못 받았습니다'));
  const pct = V.toHtml({ blocks: [b] }, {}).match(/width:([\d.]+)%/g).map((x) => parseFloat(x.slice(6)));
  assert.ok(Math.abs(pct.reduce((a, c) => a + c, 0) - 100) < 1.5, '열 폭 합이 100%여야 표가 안 밀립니다');
});

test('너비를 하나도 모르면 «고정하지 않는다» — 반만 알고 고정하면 표가 깨진다', () => {
  const xml = '<hp:tbl colCnt="2" rowCnt="1"><hp:tr>'
    + '<hp:tc><hp:subList><hp:p><hp:run><hp:t>가</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/></hp:tc>'
    + '<hp:tc><hp:subList><hp:p><hp:run><hp:t></hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="1" rowAddr="0"/></hp:tc>'
    + '</hp:tr></hp:tbl>';
  const html = V.toHtml(V.build(xml), {});
  assert.doesNotMatch(html, /kf-fixed/);
  assert.doesNotMatch(html, /<colgroup>/);
});

function cellXml(text, col, cs, rs, w) {
  return '<hp:tc><hp:subList><hp:p><hp:run><hp:t>' + text + '</hp:t></hp:run></hp:p></hp:subList>'
    + '<hp:cellAddr colAddr="' + col + '" rowAddr="0"/>'
    + '<hp:cellSpan colSpan="' + cs + '" rowSpan="' + rs + '"/>'
    + '<hp:cellSz width="' + w + '" height="1000"/></hp:tc>';
}
