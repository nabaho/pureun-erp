/* 경력관리 — OCR 이 읽는 칸을 «버리지 않는다» (대표 지시 2026-09-03 「표창장등 모두 제대로 ocr」)

   ■ 무엇이 문제였나
     프롬프트는 읽어 오고, 편집창에도 칸이 있는데, 담는 코드가 그 칸을 빼먹었다.
     그러면 «화면에는 빈칸»으로 보이고 사람은 「OCR 이 못 읽었다」고 생각한다.
     기계로 견주어 두 건을 찾았다(2026-09-03):
       · 위촉장 issuer(위촉인)     — 「천안시장」을 읽어도 saveOCRRecord 에서 버려졌다
       · 표창   recipient(수상 대상) — 프롬프트·편집창에 다 있는데 저장에서만 빠져 있었다

   ■ OCR 결과를 쓰는 «두 길»
     ⑴ saveOCRRecord — 끌어놓기로 «새로 등록»할 때. 화면마다 갈래가 있다.
     ⑵ reOcrForm     — 이미 있는 기록의 편집창에서 「다시 읽기」. setF 목록으로 채운다.
     실적·강의·비용 화면은 ⑴을 거치지 않고 ⑵만 쓴다 — 그래서 갈래를 나눠 견준다.

   ⚠ 프롬프트에 칸을 더하면 «담는 곳에도» 더해야 한다. 이 검사가 그것을 기계로 지킨다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const NL = String.fromCharCode(10);

/* 담지 않아도 되는 칸 —
   ⚠ 여기에 칸 이름을 함부로 더하지 말 것. 더하는 순간 그 칸은 검사에서 빠진다.
      더할 때는 «왜 담지 않아도 되는지»를 반드시 옆에 적는다. */
const OK_TO_SKIP = {
  docType: 'type 으로 다듬어 담는다(_normType)',
  kind: 'extperf 에서 «어느 통에 담을지» 고르는 데 쓴다(_KM)',
  termYears: '발급일 + N년으로 셈해 periodStart·periodEnd 로 담는다',
  period: 'periodStart·periodEnd 두 칸으로 갈라 담는다',
  hours: 'note 뒤에 「N시간」으로 붙여 담는다(화면에 자기 칸이 없다)',
};

function block(startMark, endMark) {
  const a = source.indexOf(startMark);
  assert.ok(a > 0, startMark + ' 를 찾지 못했습니다');
  const b = source.indexOf(endMark, a + startMark.length);
  return source.slice(a, b > a ? b : source.length);
}

/* 페이지별로 프롬프트가 읽는 칸 */
function promptFields() {
  const blk = block('const PAGE_OCR_PROMPT={', NL + '};');
  const marks = [];
  const re = /\n  ([a-z_]+):\s*[`']/g;
  let m;
  while ((m = re.exec(blk))) marks.push({ page: m[1], at: m.index });
  const out = {};
  marks.forEach((mk, i) => {
    const body = blk.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : blk.length);
    const keys = [];
    const kr = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/g;
    let k;
    while ((k = kr.exec(body))) if (keys.indexOf(k[1]) < 0) keys.push(k[1]);
    out[mk.page] = keys;
  });
  return out;
}

function saveBlock() { return block('async function saveOCRRecord(', NL + 'async function ocrDrop('); }

/* saveOCRRecord 가 담는 칸 */
function savedFields() {
  const blk = saveBlock();
  const keys = [];
  let k;
  const kr = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(?:parsed|_|'')/g;
  while ((k = kr.exec(blk))) if (keys.indexOf(k[1]) < 0) keys.push(k[1]);
  const dr = /rec\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
  while ((k = dr.exec(blk))) if (keys.indexOf(k[1]) < 0) keys.push(k[1]);
  const pr = /parsed\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((k = pr.exec(blk))) if (keys.indexOf(k[1]) < 0) keys.push(k[1]);
  return keys;
}

/* saveOCRRecord 가 갈래로 다루는 화면 */
function savePages() {
  const blk = saveBlock();
  const out = [];
  const re = /page==='([a-z_]+)'/g;
  let m;
  while ((m = re.exec(blk))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

test('★★ 등록 길(saveOCRRecord)은 그 화면의 «모든» 칸을 담는다', () => {
  /* ★ 이것이 실제 버그를 잡은 잣대다 — issuer·recipient 가 여기서만 버려졌다. */
  const prompts = promptFields(), saved = savedFields(), pages = savePages();
  const gaps = [];
  pages.forEach((page) => {
    (prompts[page] || []).forEach((f) => {
      if (OK_TO_SKIP[f]) return;
      if (saved.indexOf(f) < 0) gaps.push(page + '.' + f);
    });
  });
  assert.deepEqual(gaps, [],
    '★ 위 칸을 saveOCRRecord 에 더하세요 — 프롬프트에만 더하면 사람은 「OCR 이 못 읽었다」고 봅니다');
});

test('★★ 읽어 둔 칸을 «아무도» 안 쓰면 안 된다 — 등록이나 다시읽기 한 곳은 쓴다', () => {
  const prompts = promptFields(), saved = savedFields();
  const reo = block('async function reOcrForm(', NL + 'function ');
  const orphan = [];
  Object.keys(prompts).forEach((page) => {
    prompts[page].forEach((f) => {
      if (OK_TO_SKIP[f]) return;
      if (saved.indexOf(f) >= 0) return;
      if (reo.indexOf('parsed.' + f) >= 0) return;
      if (page === 'certdoc') return;                    /* certdoc 은 자기 길(cdReOcr)이 있다 */
      const tag = page + '.' + f;
      if (orphan.indexOf(tag) < 0) orphan.push(tag);
    });
  });
  assert.deepEqual(orphan, [],
    '★ 프롬프트가 읽어 오는데 담는 곳이 없습니다 — 그대로 버리면 OCR 이 헛일을 합니다');
});

test('★★ 위촉인·수상 대상은 담긴다 — 실제로 버려졌던 두 칸', () => {
  const blk = saveBlock();
  assert.match(blk, /issuer:parsed\.issuer\|\|''/, '위촉인(천안시장 등)');
  assert.match(blk, /recipient:parsed\.recipient\|\|''/, '표창의 수상 대상');
});

test('★ 자격증 — 발급기관을 «직명»이 아니라 «기관명»으로 적게 한다', () => {
  const p = block('  license:`이 자격증', NL + '  complete:');
  assert.ok(p.indexOf('고용노동부장관') > 0, '자격증 아래에는 직명이 찍혀 있습니다');
  assert.ok(p.indexOf('직명을 그대로 담지 마세요') > 0);
  assert.ok(p.indexOf('공인노무사') > 0, '무엇이 자격 명칭인지 예를 들어야 잘 집습니다');
});

test('★★ 수료증 — 주관·위탁이 둘 다 적힌 것을 가른다 (중복의 원인이었다)', () => {
  const p = block('  complete:`이 수료증', NL + '  edu:');
  assert.ok(p.indexOf('직인이 찍힌 쪽') > 0,
    '★ 발급기관을 어느 쪽으로 담느냐로 같은 서류가 남남처럼 갈라져 중복이 됐습니다');
  assert.ok(p.indexOf('주관·위탁기관이 발급기관과 다르면') > 0, '나머지는 비고로 남깁니다');
  assert.ok(p.indexOf('연도·기수') > 0, '「2024년 … (2024-1기)」를 살려야 짝이 맞습니다');
});

test('★ 학력 — 학교 이름만, 「총장」은 빼게 한다', () => {
  const p = block('  edu:`이 졸업증명서', NL + '  personal_doc:');
  assert.ok(p.indexOf('직명은 빼세요') > 0);
  assert.ok(p.indexOf('영남대학교') > 0);
});

test('★★ 표창 — 주는 쪽과 받는 쪽을 바꾸지 않게 못박혀 있다', () => {
  const p = block('  award:`이 표창장', NL + '  meetfee:');
  assert.ok(p.indexOf('둘을 바꾸면 기록이 뒤집힙니다') > 0,
    '실측 사고가 있었습니다 — 이 경고를 지우지 마세요');
  assert.ok(p.indexOf('recipient') > 0, '받는 쪽을 따로 받아야 합니다');
});

test('★ 다시읽기도 교육시간을 버리지 않는다 — 등록과 같은 셈', () => {
  const fn = block('async function reOcrForm(', NL + 'function ');
  assert.match(fn, /parsed\.hours/, '한 길만 고치면 뒤죽박죽이 됩니다');
  assert.match(fn, /\+'시간'/);
});

test('★ 걸러 두는 칸에는 «왜 담지 않아도 되는지»가 적혀 있다', () => {
  Object.keys(OK_TO_SKIP).forEach((k) => {
    assert.ok(String(OK_TO_SKIP[k]).length > 8, k + ' 에 까닭을 적어야 합니다');
  });
  assert.ok(Object.keys(OK_TO_SKIP).length <= 8,
    '★ 걸러 두는 칸이 늘어나면 이 검사가 아무것도 안 지킵니다');
});
