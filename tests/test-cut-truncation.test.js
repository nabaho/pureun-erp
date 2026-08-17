'use strict';
/* 검사가 「함수를 통째로 본다」고 믿는데 실제로는 잘려 보는 일이 없게 한다.

   ■ 무엇이 문제인가

   검사 300곳 남짓이 `function X\([\s\S]*?\n\}` 로 함수를 뽑는다. 이 정규식은
   **열 0 의 첫 중괄호**에서 끊긴다. 함수 안에 열 0 짜리 `}` 가 하나라도 생기면
   그 뒤를 통째로 못 본다.

   ⚠ 그런데 그게 **조용하다.** 「없어야 한다」(indexOf < 0 · doesNotMatch)를 보는
     검사는 뒷부분을 못 보고도 통과한다 — 지키는 줄 알았는데 안 지킨다.
     실제로 이 저장소에서 두 번, 뽑기가 함수 앞부분에서 끊겨 정작 봐야 할 대목을
     놓쳤다(격자 그리기·저장 층).

   ■ 왜 300곳을 다 고치지 않고 이 검사를 두나

   뽑기 방식 자체는 **잘리지만 않으면 아무 문제가 없다.** 300곳을 손으로 바꾸는 것은
   그 자체가 큰 위험이고, 「이 방식을 쓰지 마라」는 검사는 **모양을 못 박는 검사**가
   되어 이번에 고치고 있는 바로 그 병이 된다.
   그래서 방식이 아니라 **결과**를 본다 — 「지금 실제로 잘리고 있는가」.
   오늘은 0건이다. 잘리는 순간 여기서 큰 소리가 난다.

   ■ 걸렸다면 어떻게 고치나

   그 검사의 뽑기를 **중괄호 짝을 세는 방식**으로 바꾼다. 보기:

     function cut(src, decl) {
       const head = src.indexOf(decl);
       let i = src.indexOf('{', head + decl.length), d = 0;
       for (; i < src.length; i++) {
         if (src[i] === '{') d++;
         else if (src[i] === '}') { d--; if (!d) break; }
       }
       return src.slice(head, i + 1);
     }
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const TDIR = __dirname;

/* 중괄호 짝을 세어 진짜 끝을 찾는다 */
function trueEndOf(src, at) {
  let i = src.indexOf('{', at), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return i + 1; }
  }
  return -1;
}

/* 그 검사가 읽는 원본 파일들.
   ⚠ readFileSync 옆에서만 찾으면 놓친다 — 이름을 도우미로 넘기는 검사가 많다. */
function sourcesOf(testSrc) {
  const out = [];
  const re = /['"]([\w.\-]+\.(?:html|js))['"]/g;
  let m;
  while ((m = re.exec(testSrc))) {
    if (/\.test\.js$/.test(m[1])) continue;
    for (const dir of ['', 'js', 'functions', 'app', 'engine', 'fund-erp']) {
      const p = path.join(R, dir, m[1]);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        if (out.indexOf(p) < 0) out.push(p);
        break;
      }
    }
  }
  return out;
}

test('★ 함수를 뽑아 보는 검사가 «잘린 채» 보고 있지 않다', () => {
  const cache = {};
  const readSrc = function (p) { return cache[p] || (cache[p] = fs.readFileSync(p, 'utf8')); };

  const bad = [];
  let looked = 0;

  fs.readdirSync(TDIR).filter(f => f.endsWith('.test.js')).forEach(function (tf) {
    if (tf === path.basename(__filename)) return;      // 나 자신은 뺀다
    const t = fs.readFileSync(path.join(TDIR, tf), 'utf8');
    if (t.indexOf('[\\s\\S]*?\\n\\}') < 0) return;
    const srcs = sourcesOf(t);
    if (!srcs.length) return;

    t.split('\n').forEach(function (line, li) {
      if (line.indexOf('[\\s\\S]*?\\n\\}') < 0) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;      // 주석에 적힌 설명은 뺀다
      const c = line.match(/\/((?:async )?function [\w$]+)\\\(/);
      if (!c) return;
      const decl = c[1].replace(/\\/g, '');
      looked++;

      srcs.forEach(function (sp) {
        const src = readSrc(sp);
        const at = src.indexOf(decl + '(');
        if (at < 0) return;
        const trueEnd = trueEndOf(src, at);
        if (trueEnd < 0) return;
        const nl = src.indexOf('\n}', at);
        const naiveEnd = nl < 0 ? src.length : nl + 2;
        if (naiveEnd >= trueEnd) return;                // 안 잘렸다
        bad.push(tf + ':' + (li + 1) + '  ' + decl + '  [' + path.basename(sp) + ']  ' +
          (trueEnd - naiveEnd) + '자를 못 봅니다(전체 ' + (trueEnd - at) + '자)');
      });
    });
  });

  assert.ok(looked > 0, '함수를 뽑아 보는 검사를 하나도 못 찾았습니다 — 이 검사가 헛돌고 있습니다.');
  assert.deepEqual(bad, [],
    '함수 뽑기가 «열 0 의 첫 중괄호»에서 끊겨 뒷부분을 못 봅니다.\n' +
    '「없어야 한다」를 보는 검사라면 **조용히 통과**하고 있습니다.\n' +
    '중괄호 짝을 세는 방식으로 바꿔 주세요(tests/cut-fn.js 의 cutFn).\n\n' +
    bad.join('\n'));
});

/* ══════ 둘째 함정 — 고정 폭 자르기 ══════
   `src.slice(at, at + 900)` 처럼 **글자 수를 적어** 자르는 곳들이 있다.
   함수가 길어지면 창이 못 닿고, 그러면 «옳은 고침» 쪽이 깨진다.
   실제로 16,145자짜리 함수를 900자만(6%) 보고 있던 곳이 있었고,
   다른 곳은 코드가 길어질 때마다 창 숫자를 키우며 쫓아가고 있었다.
   ⚠ slice 를 쓰지 말라는 것이 아니다 — **못 닿을 때만** 운다. */
test('★ 고정 폭으로 함수를 자르는 검사가 «함수 끝에 못 닿는» 일이 없다', () => {
  const cache = {};
  const readSrc = function (p) { return cache[p] || (cache[p] = fs.readFileSync(p, 'utf8')); };
  const bad = [];

  fs.readdirSync(TDIR).filter(f => f.endsWith('.test.js')).forEach(function (tf) {
    if (tf === path.basename(__filename)) return;
    const t = fs.readFileSync(path.join(TDIR, tf), 'utf8');
    const srcs = sourcesOf(t);
    if (!srcs.length) return;
    const lines = t.split('\n');

    lines.forEach(function (line, li) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const w = line.match(/\.slice\(\s*(\w+)\s*,\s*\1\s*\+\s*(\d{2,})\s*\)/);
      if (!w) return;
      const width = Number(w[2]);
      /* 그 자리 변수가 「function X(」 를 찾아 둔 것인지 — 위 다섯 줄에서 본다 */
      let decl = null;
      for (let k = li; k >= Math.max(0, li - 5); k--) {
        const d = lines[k].match(
          new RegExp('\\b' + w[1] + '\\s*=\\s*\\w+\\.indexOf\\(([\'"])((?:async )?function [\\w$]+)\\('));
        if (d) { decl = d[2]; break; }
      }
      if (!decl) return;

      srcs.forEach(function (sp) {
        const src = readSrc(sp);
        const at = src.indexOf(decl + '(');
        if (at < 0) return;
        const end = trueEndOf(src, at);
        if (end < 0) return;
        const whole = end - at;
        if (width >= whole) return;
        bad.push(tf + ':' + (li + 1) + '  ' + decl + ' [' + path.basename(sp) + ']  창 ' +
          width + '자 / 함수 ' + whole + '자 — ' + (whole - width) + '자를 못 봅니다');
      });
    });
  });

  assert.deepEqual(bad, [],
    '고정 폭으로 자른 창이 함수 끝에 못 닿습니다 — 창 숫자를 키워 쫓아가지 말고\n' +
    'tests/cut-fn.js 의 cutFn 으로 함수를 통째로 뽑아 주세요.\n\n' + bad.join('\n'));
});
