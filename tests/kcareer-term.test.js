/* 경력관리 — 위촉기간을 «고른다» + 위촉인 OCR (대표 지시 2026-09-03)
   「위촉인은 주로 천안시장이다 이것도 ocr 제대로 반영좀 해달라 위촉기간도 제대로 ocr 하게」
   「일반적으로 위촉기간은 위촉일로부터 1년 2년 3년 4년 등이 있다
     이부분을 차라리 선택할 수 있게 해달라」

   ■ 무엇이 문제였나
     ⑴ 위촉기간을 두 칸에 손으로 쳐야 했다. 실제 위촉장은 거의 늘 「위촉일부터 N년」이다.
     ⑵ OCR 프롬프트의 위촉인 예시가 「○○원장·○○회장·○○지사장」뿐이라
        지자체장 꼴(천안시장·충청남도교육감·대산지방해양수산청장)을 잘 못 집었다.
     ⑶ 위촉장에는 기간이 날짜가 아니라 「임기 2년」처럼 햇수로만 적힌 것이 많은데
        받을 칸이 없어 그냥 버려졌다.

   ■ 셈법 (실측으로 고정)
     2025.08.04 부터 2년 → 2027.08.03  (대표 화면과 같은 셈법 — 끝날은 만기일)
     2024.02.29 부터 1년 → 2025.02.28  (윤년)
     2025.03.01 부터 3년 → 2028.02.29  (윤년으로 넘어감) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ── 셈법은 «돌려서» 본다 — 글자만 찾으면 틀린 셈도 통과한다 ── */
function loadTerm() {
  const ctx = { };
  const src = [cutFn(bare, 'function _ymd('), cutFn(bare, 'function _ymdStr('),
               cutFn(bare, 'function termEnd(')].join('\n').replace(/\bconst |\blet /g, 'var ');
  vm.runInNewContext(src + '\nthis.termEnd = termEnd;', ctx);
  return ctx.termEnd;
}

test('★★ 위촉일부터 N년 — 끝날은 «하루 뺀» 만기일이다', () => {
  const termEnd = loadTerm();
  assert.equal(termEnd('2025.08.04', 2), '2027.08.03',
    '대표 화면의 셈법입니다 — 하루를 안 빼면 이틀치가 겹칩니다');
  assert.equal(termEnd('2025.01.01', 1), '2025.12.31');
  assert.equal(termEnd('2025.12.15', 2), '2027.12.14');
});

test('★ 윤년·달넘김을 스스로 맞춘다 — 손으로 세지 않는다', () => {
  const termEnd = loadTerm();
  assert.equal(termEnd('2024.02.29', 1), '2025.02.28');
  assert.equal(termEnd('2025.03.01', 3), '2028.02.29');
});

test('★ 모르면 비워 둔다 — 없는 기간을 만들지 않는다', () => {
  const termEnd = loadTerm();
  assert.equal(termEnd('', 2), '');
  assert.equal(termEnd('2025.08.04', 0), '');
  assert.equal(termEnd('알 수 없음', 2), '');
});

test('★★ 편집창에 1~5년 고르는 단추가 있다', () => {
  const at = bare.indexOf("f.type==='period_row'");
  assert.ok(at > 0);
  const row = bare.slice(at, at + 2200);
  assert.match(row, /\[1,2,3,4,5\]\.map/, '흔한 햇수를 골라 넣을 수 있어야 합니다');
  assert.match(row, /onclick="wiccokTerm\('\+n\+'\)"/);
  assert.match(row, /onclick="wiccokTermClear\(\)"/, '잘못 눌렀을 때 지울 길이 있어야 합니다');
});

test('★ 발급일이 없으면 억지로 넣지 않고 말해 준다', () => {
  const fn = cutFn(bare, 'function wiccokTerm(');
  assert.match(fn, /if\(!_ymd\(start\)\)\{ toast\(/,
    '발급일 없이 기간을 만들면 지어낸 날짜가 서류에 박힙니다');
  assert.match(fn, /var start=\(ps\.value\|\|''\)\.trim\(\) \|\| issue/,
    '손으로 넣어 둔 시작일이 있으면 그것을 존중해야 합니다');
});

test('★★ OCR 위촉인 — «직명»이고 사람 이름이 아니다', () => {
  const at = source.indexOf('  wiccok:`이 문서(위촉장');
  assert.ok(at > 0, '위촉장 OCR 프롬프트를 찾지 못했습니다');
  const p = source.slice(at, at + 1800);
  ['천안시장', '충청남도지사', '대산지방해양수산청장', '충청남도교육감'].forEach((x) =>
    assert.ok(p.indexOf(x) > 0, x + ' 같은 지자체장 꼴을 예로 들어야 잘 집습니다'));
  assert.ok(p.indexOf('직명만') > 0, '직명 뒤 사람 이름은 빼야 합니다');
  assert.ok(p.indexOf('서명·직인 자리') > 0, '위촉인은 문서 맨 아래에 있습니다');
});

test('★★ OCR 이 「임기 2년」을 받을 칸(termYears)이 있다', () => {
  const at = source.indexOf('  wiccok:`이 문서(위촉장');
  const p = source.slice(at, at + 1800);
  assert.ok(p.indexOf('termYears') > 0, '날짜가 아니라 햇수로만 적힌 것이 많습니다');
  assert.ok(p.indexOf('만들어 내지 마세요') > 0,
    '★ 없는 기간을 지어내면 위촉 종료일이 틀린 채로 증명서에 박힙니다');
});

test('★★ OCR 결과를 periodStart·periodEnd 두 칸으로 옮긴다', () => {
  const fn = cutFn(bare, 'async function saveOCRRecord(');
  assert.match(fn, /issuer:parsed\.issuer\|\|''/,
    '★ 위촉인을 레코드에 담지 않으면 OCR 이 읽어도 화면에 안 남습니다');
  assert.match(fn, /var sp=splitPeriod\(parsed\.period\|\|''\)/);
  assert.match(fn, /rec\.periodEnd=termEnd\(rec\.periodStart, ty\)/,
    '햇수만 적힌 것을 발급일 + N년으로 옮겨야 합니다');
  assert.match(fn, /ty>0 && ty<=10/, '터무니없는 햇수는 받지 않습니다');
  assert.match(fn, /if\(!rec\.periodEnd && ty>0/,
    '★ 날짜가 적혀 있으면 그것이 이깁니다 — 햇수로 덮어쓰면 안 됩니다');
});
