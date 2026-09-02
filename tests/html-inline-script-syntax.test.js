/* 루트 HTML(앱)들의 <script> 가 «문법으로라도» 멀쩡한가 (2026-09-02)
 *
 * ■ 왜 이 검사가 있나
 *   929c6d60(「업체 360도 관계 조회 추가」)가 pu-erp.html 한 줄에 닫는
 *   중괄호 하나를 빠뜨렸다 — h('div',{key:x.edgeId,style:{...}},x.label+...)
 *   에서 style 객체만 닫고 props 객체는 안 닫아, 그 뒤로 스크립트 전체가
 *   «구문 오류»였다. 이 저장소는 빌드가 없어 브라우저가 곧바로 파일을
 *   그대로 실행한다 — 구문 오류 하나면 그 파일의 스크립트 전체가 멈춘다.
 *
 *   그런데 이 커밋의 CI(node --test tests/*.test.js)는 «전부 통과»였다.
 *   기존 검사들은 죄다 함수 하나를 오려서(cutFn 류) 도는데, 오려 낸 조각이
 *   우연히 짝이 맞으면 바깥의 깨진 자리를 못 본다. 실제로 몇 분 동안
 *   main 이 이 상태로 배포돼 있었다(대표가 화면을 새로 열었으면 흰 화면).
 *
 *   그래서 «함수 하나»가 아니라 «파일 전체의 스크립트」를 통째로 파싱해
 *   본다. 값(무엇이 적혀 있는지)은 안 보고 «문법으로 읽히는가»만 본다 —
 *   그래서 코드가 아무리 자라거나 바뀌어도 이 검사는 안 깨진다.
 *
 * ⚠ type="module" 스크립트는 최상위 await 가 문법으로 허용된다(모듈이라)
 *   — vm.Script 는 일반 스크립트로만 읽어 그걸 오류로 본다. 그래서
 *   `(async function(){ ... })()` 로 한 겹 감싸서 같은 문법을 허용한다
 *   (동적 import() 는 일반 스크립트에서도 이미 허용이라 그대로 둔다).
 * ⚠ `import.meta` 는 감싸도 안 풀린다 — Node vm.Script 는 «모듈»로 파싱하는
 *   길을 따로 열어야만(--experimental-vm-modules) 허용하는데, 그러려면
 *   정적 import 문의 링커까지 지어야 해서 이 검사의 몸무게에 안 맞는다.
 *   이 검사가 잡으려는 것은 «짝 안 맞는 괄호」 같은 문법 오타이지 모듈
 *   의미론 전체가 아니라서, `import.meta` 만 값 없는 자리표로 바꿔 읽는다
 *   (그 뒤 나머지 코드의 진짜 문법은 그대로 잡는다).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* 루트에 있는 앱 HTML만 본다 — docs/ 나 mockups 같은 목업 폴더는 실제로 배포되어
   돌아가는 화면이 아니라 대상이 아니다(있어도 무해하니 걸러내진 않되, 못 찾아도 실패시키진 않는다). */
const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
assert.ok(htmlFiles.length > 5, '루트 HTML을 못 찾았습니다 — 저장소 구조가 바뀌었는지 확인');

function scriptBlocks(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;                       // 외부 파일은 그 파일 자신의 검사 몫
    if (/type\s*=\s*["']?text\/babel["']?/i.test(attrs)) continue; // Babel이 따로 옮겨 읽는 문법
    const isModule = /type\s*=\s*["']?module["']?/i.test(attrs);
    out.push({ code: m[2], isModule });
  }
  return out;
}

for (const file of htmlFiles) {
  test('구문 검사 — ' + file, () => {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const blocks = scriptBlocks(html);
    blocks.forEach((b, i) => {
      if (!b.code.trim()) return;
      const body = b.isModule ? b.code.replace(/import\.meta/g, '({url:""})') : b.code;
      const src = b.isModule ? '(async function(){\n' + body + '\n})' : body;
      try {
        new vm.Script(src, { filename: file + '#script' + (i + 1) });
      } catch (e) {
        assert.fail(
          file + '의 ' + (i + 1) + '번째 <script' + (b.isModule ? ' type="module"' : '') + '> 가 문법 오류입니다: '
          + e.message + '\n(빌드가 없어 브라우저가 그대로 실행한다 — 하나라도 깨지면 그 파일 전체가 멈춘다)'
        );
      }
    });
  });
}
