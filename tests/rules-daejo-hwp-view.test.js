'use strict';
/* 조문 검토·편집 창에서 「한글 모양」을 바로 보기

   왜: 표에서 고치는 동안에는 한글에 어떻게 찍힐지 안 보였다. 실제로 그 기능은
   이미 있었지만(previewDoc — 내려받을 .hwpx 를 만들어 rhwp 로 렌더) 진입점이
   ④ 제출 서류에만 있어 편집 중에는 닿지 못했다.

   미리보기는 파일을 만들어 주지 않는다 — 그러니 내려받기용 확인창(docGateOk)으로
   막을 이유가 없다. 대신 같은 경고를 미리보기 안 안내줄로 보여 준다.
   ⚠ 내려받기 쪽 확인창은 그대로여야 한다(그쪽은 실제로 파일이 나간다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
  const marker = 'function ' + name + '(';
  let start = src.indexOf(marker);
  if (start < 0) throw new Error('함수 못찾음: ' + name);
  if (src.slice(start - 6, start) === 'async ') start -= 6;   // async 를 떼면 top-level await 로 파싱이 깨진다
  let pd = 0, pEnd = -1;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { pEnd = i; break; } }
  }
  const bodyStart = src.indexOf('{', pEnd + 1);
  let d = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') {
      d--;
      if (d === 0) {
        const out = src.slice(start, i + 1);
        try { new vm.Script(out); } catch (e) { throw new Error('추출이 잘렸을 수 있음: ' + name + ' — ' + e.message); }
        return out;
      }
    }
  }
  throw new Error('함수 끝 못찾음: ' + name);
}

function warnCtx() {
  const c = vm.createContext({
    escapeH: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
  vm.runInContext(fn('docPreviewWarn'), c);
  return c;
}

/* ── 안내줄 ── */
test('★ 걸릴 것이 없으면 아무 말도 하지 않는다', () => {
  assert.equal(warnCtx().docPreviewWarn([], 0), '');
  assert.equal(warnCtx().docPreviewWarn(null, null), '');
});

test('★ 확인 안 된 가지번호가 있으면 건수와 조번호를 적는다', () => {
  const s = warnCtx().docPreviewWarn(['제5조의2 (교육)'], 0);
  assert.match(s, /1건/);
  assert.match(s, /제5조의2/);
});

test('★ 문안이 빈 신설은 이 문서에서 빠진다고 알린다', () => {
  const s = warnCtx().docPreviewWarn([], 3);
  assert.match(s, /3건/);
  assert.match(s, /빠집/);
});

test('둘 다 있으면 둘 다 적는다', () => {
  const s = warnCtx().docPreviewWarn(['제5조의2'], 2);
  assert.match(s, /제5조의2/);
  assert.match(s, /2건/);
});

test('가지번호가 많으면 앞쪽만 적고 나머지는 건수로 줄인다', () => {
  const many = ['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10'];
  const s = warnCtx().docPreviewWarn(many, 0);
  assert.match(s, /10건/);
  assert.match(s, /외 2건/);
  assert.ok(!s.includes('a10'), '열 개를 다 적으면 안내줄이 화면을 밀어냅니다');
});

test('★ 조문 제목에 든 꺾쇠는 글자로 새긴다 — 안내줄이 깨지면 안 된다', () => {
  const s = warnCtx().docPreviewWarn(['<b>제5조'], 0);
  assert.ok(!s.includes('<b>제5조'), '날것으로 넣으면 안내줄 서식이 깨집니다');
  assert.match(s, /&lt;b&gt;제5조/);
});

/* ── 배선 ── */
test('★ 편집 창 툴바에 「한글 모양」 단추가 있다', () => {
  const tools = src.slice(src.indexOf('id="daejo-tools"'), src.indexOf('id="daejo-tbl"'));
  assert.match(tools, /id="pv-daejo"/, '고치는 창에서 바로 닿을 수 있어야 합니다');
});

test('★ 그 단추가 신구대조표 미리보기를 부른다', () => {
  assert.match(src, /\$\("pv-daejo"\)\.addEventListener\("click",\s*\(\)\s*=>\s*previewDoc\("daejo"\)/);
});

test('★ 미리보기는 내려받기 확인창으로 막지 않는다', () => {
  const pv = fn('previewDoc');
  assert.ok(!/docGateOk\(\)/.test(pv),
    '미리보기는 파일을 만들지 않으므로 확인창으로 막을 이유가 없습니다');
  assert.match(pv, /docPreviewWarn\(/, '대신 같은 경고를 안내줄로 보여 줘야 합니다');
});

test('★ 내려받기는 확인창을 그대로 지킨다 — 그쪽은 실제로 파일이 나간다', () => {
  assert.match(fn('downloadOneDoc'), /docGateOk\(\)/, '내려받기 확인창을 걷어내면 안 됩니다');
  const setBtn = src.slice(src.indexOf('$("dl-docset").addEventListener'));
  assert.match(setBtn.slice(0, 600), /docGateOk\(\)/);
});

test('★ 한글 화면을 별창으로 띄울 수 있다 — 모니터 두 대에 나란히', () => {
  assert.match(src, /addPopBtn\("ov-docpv"/, '별창이 없으면 편집 창과 나란히 못 봅니다');
});
