'use strict';
/* 서고 ⑤ — 원본 파일 (설계서 §3-⑤ · §5 · §7)

   지금까지 서고는 «글과 해시»만 담았다. 검색·사례집·문안 은행·이력은 그것만으로 다
   되지만, 표 줄·도장·서명이 있는 «원본»은 못 본다. 제출 서류(신고서·의견청취·동의서)는
   그 도장이 증빙 자체다.

   ⚠ 창고는 새로 만들지 않는다 — 기존 `pureun-erp-hrphotos`(설계서 §10-1).
   ⚠ 쓰는 차례는 무거운 것부터다(§7): ① Storage 파일 → ② text → ③ rev → ④ index/idx.
     중간에 끊기면 «파일은 있고 색인이 없는» 고아가 남는데, 그것은 다시 올릴 때
     sha 로 찾아 색인만 붙이면 된다. 거꾸로 하면 «색인은 있고 파일이 없는» 거짓말이 남는다.
   ⚠ Storage 규칙이 아직 콘솔에 없을 수 있다(§10-1 은 사람이 할 일로 적어 두었다).
     그때도 «아무것도 안 깨져야» 한다 — 글·색인은 그대로 올라가고 원본만 빠진다(§3 차선).

   실행: node --test tests/rules-casebook-orig.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

/* ⚠ 줄끝을 고른다 — 윈도우 CRLF 에서 「글자 뒤 \n」 정규식이 안 맞는다 */
const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
  const marker = 'function ' + name + '(';
  let start = src.indexOf(marker);
  if (start < 0) throw new Error('함수 못찾음: ' + name);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let pd = 0, pEnd = -1;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { pEnd = i; break; } }
  }
  const bodyStart = src.indexOf('{', pEnd + 1);
  let d = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('함수 끝 못찾음: ' + name);
}

/* ── 순수 판정 ── */

test('★ 회차의 서류 칩이 «원본이 있는지»를 알려 준다', () => {
  const chips = CB.revChips({ docs: {
    after: { name: 'a.hwp', path: 'casebook/site_1/2022/after.hwp' },
    report: { name: 'b.pdf' },
  } });
  const a = chips.find(c => c.role === 'after');
  const r = chips.find(c => c.role === 'report');
  assert.equal(a.path, 'casebook/site_1/2022/after.hwp', '원본 자리를 안 실어 주면 화면이 열 수가 없습니다');
  assert.equal(r.path, '', '원본이 없는 것은 빈 값이어야 합니다 — 없는 자리를 지어내면 안 됩니다');
});

test('★ 원본 자리는 설계서와 같다 — casebook/{사업장}/{회차}/{역할}.{확장자}', () => {
  assert.equal(CB.paths.file('site_1234', '2022', 'after', 'hwp'),
    'casebook/site_1234/2022/after.hwp');
  assert.equal(CB.paths.file('site_1', '2019', 'report', '.PDF'),
    'casebook/site_1/2019/report.pdf', '확장자는 점을 떼고 소문자로');
});

/* ── 배선 ── */

test('★★ 파일 손잡이를 끝까지 이어 준다 — 안 그러면 올릴 때 바이트가 없다', () => {
  const r = fn('cbRead');
  assert.match(r, /f\s*:\s*f\b|file\s*:\s*f\b/,
    'entries 에 File 을 안 담으면 업로드 때 바이트를 다시 읽을 길이 없습니다');
  assert.match(r, /r\.f\s*=\s*e\.f|r\.file\s*=\s*e\.file/,
    '가린 표에 손잡이를 도로 붙여야 합니다(text·sha·ext 와 같은 자리)');
});

test('★ Storage SDK 를 싣는다 — 없으면 firebase.storage 가 없다', () => {
  assert.match(src, /firebase-storage-compat\.js/,
    'Storage SDK 를 안 실으면 원본을 올릴 수가 없습니다');
});

test('★ 창고를 새로 만들지 않는다 — 기존 pureun-erp-hrphotos (설계서 §10-1)', () => {
  assert.match(src, /gs:\/\/pureun-erp-hrphotos/,
    '기금관리가 이미 서류 원본을 넣는 그 창고를 씁니다 — 국내(서울)이고 제자리입니다');
  assert.ok(!/pureun-erp-photos['"]/.test(src),
    '명함 창고에 서류를 넣으면 안 됩니다');
});

test('★★ 쓰는 차례가 무거운 것부터다 — 원본이 text 보다 «먼저» (설계서 §7)', () => {
  /* 올리는 함수는 cbUpload 다. 그 «안에서» 차례를 본다 —
     파일 전체에서 찾으면 cbPutOrig 정의가 먼저 걸려 늘 통과한다. */
  const up = fn('cbUpload');
  const 원본 = up.indexOf('cbPutOrig(');
  const 글 = up.indexOf('paths.text(');
  assert.ok(원본 >= 0, 'cbUpload 안에서 원본을 안 올립니다');
  assert.ok(글 >= 0, 'cbUpload 안에서 글을 올리는 자리를 못 찾았습니다');
  assert.ok(원본 < 글,
    '색인·글이 먼저 올라가고 파일이 나중이면, 끊겼을 때 «색인은 있고 파일은 없는» 거짓말이 남습니다');
  /* 색인(가장 가벼운 것)은 맨 뒤여야 한다 */
  const 색인 = up.indexOf('paths.idx(');
  assert.ok(색인 > 글, '색인이 글보다 먼저면 차례가 뒤집힌 것입니다');
});

test('★★ 원본 올리기가 실패해도 회차는 올라간다 (설계서 §3 차선)', () => {
  /* Storage 규칙이 아직 콘솔에 없을 수 있다 — 그때 글·색인까지 막히면 안 된다 */
  const f = fn('cbPutOrig');
  assert.match(f, /catch/, '제 try 로 감싸야 합니다');
  assert.match(f, /return null/, '실패를 «값 없음»으로 돌려주고 위에서는 계속 가야 합니다');

  const up = fn('cbUpload');
  assert.match(up, /path:\s*자리|\.\.\.\(자리\?\{path:/,
    'docs 에 원본 자리를 적어야 합니다');
  assert.match(up, /\.\.\.\(자리\?\{path:자리\}:\{\}\)/,
    '못 담았으면 path 를 «적지 않아야» 합니다 — 없는 자리를 적으면 화면이 헛것을 열려 합니다');
  /* 원본 실패를 회차 실패로 세면 안 된다 */
  const 대목 = up.slice(up.indexOf('cbPutOrig('), up.indexOf('paths.text('));
  assert.ok(!/fails\.push/.test(대목), '원본 실패를 올리기 실패로 세고 있습니다');
});

test('★★ 원본을 못 담았으면 «몇 건인지 · 왜인지» 말한다', () => {
  const up = fn('cbUpload');
  assert.match(up, /원본실패/, '못 담은 셈을 안 세고 있습니다');
  assert.match(up, /\$\{원본\}건/, '몇 건 담았는지 안 알려 줍니다');
  assert.match(up, /\$\{원본실패\}건/, '몇 건 못 담았는지 안 알려 줍니다');
  assert.match(up, /\$\{CB_ORIG_WHY\}/, '까닭을 알림에 함께 붙여야 합니다');
  assert.match(fn('cbPutOrig'), /창고 규칙이 아직 올라가지 않아/,
    '왜 못 담았는지(창고 규칙이 아직 없다)를 사람 말로 적어야 합니다');
});

test('★ 원본이 있으면 «열 수» 있다', () => {
  assert.match(src, /function cbOpenOrig|data-cborig/,
    '원본을 여는 길이 없으면 담아 둔 값이 없습니다');
  assert.match(src, /getDownloadURL/,
    'Storage 에서 내려받을 주소를 얻어야 합니다');
});

test('★ 원본이 없는 서류는 «없다고» 보인다 — 흐린 단추만 두지 않는다', () => {
  /* 「못 하는 것은 왜 못 하는지 적는다」 — 3단계가 세운 원칙 */
  assert.match(src, /원본 없음|원본이 없/,
    '원본이 없는 서류에 아무 말도 없으면 왜 못 누르는지 모릅니다');
});

test('4단계(사례집 검색)와 3단계 화면은 그대로다 — ⑤를 붙였다고 바꾼 것이 아니다', () => {
  assert.match(src, /function cbSearch\(/, '4단계 검색이 사라졌습니다');
  assert.match(src, /CB\.idxLookups\(/, '4단계 색인 읽기가 사라졌습니다');
  assert.match(src, /r\.chips\.map\(/, '3단계 회차 칩 그리기가 사라졌습니다');
  assert.match(src, /CB\.canStartReview\(/, '「이 회차로 검토 시작」이 사라졌습니다');
  assert.match(src, /CB\.SUBMIT_ROLES/, '㉡ 제출 정보가 사라졌습니다');
});
