'use strict';
/* 주석만 걷는다 — «진짜 코드»는 한 글자도 안 삼킨다

   ■ 왜 따로 만드나
   이 저장소 규칙은 「소스를 글자로 보는 검사는 주석을 먼저 걷는다」이고, 옳다.
   그런데 검사마다 이렇게 손으로 적어 쓰고 있었다:

       app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')

   이 두 줄에는 조용한 구멍이 있다. 화면에는 이런 마크업이 있다 —

       <input type="file" id="picInput" accept="image/*" ...>

   여기 «별표 앞의 빗금» 두 글자가 **자바스크립트 주석을 여는 표와 똑같다.**
   걷개는 그것을 주석 시작으로 읽고 다음 닫는 표까지 삼킨다.
   2026-08-30 에 재 보니 **673KB 중 230KB(34%)** 가 사라지고 있었다 —
   `id="kindPopupTitle"` 같은 «반드시 있어야 할 것»까지 통째로.

   ■ 무엇이 무서운가
   삼켜져도 **검사는 조용히 초록이다.** `assert.ok(!/나쁜것/.test(bare))` 는 소스가
   통째로 사라져도 통과한다. 이 얼개를 쓰던 검사 일곱 파일이 한꺼번에 반쯤 눈을
   감고 있었고, 돌연변이 하나가 살아남아서야 드러났다.

   ■ 그래서 이렇게 걷는다
     ① HTML 주석을 먼저 걷는다 — 짝이 분명하다
     ② 블록·줄 주석은 **<script>·<style> 안에서만** 걷는다
        마크업의 accept="image/별표" 는 손대지 않는다
   ⚠ 글자값 안의 주석 표기(예: 자바스크립트 문자열에 든 별표빗금)까지 가려내지는
     않는다 — 완전한 파서가 필요한 일이라 여기서는 안 한다. 지금 병(마크업을
     삼키는 것)은 이것으로 사라지고, 남는 위험은 «검사가 더 엄해지는» 쪽이다.

   쓰는 법:  const { stripComments } = require('./strip-comments');
             const bare = stripComments(app); */

/* <script>·<style> 안쪽만 골라 주석을 걷는다 */
function stripInBlocks(src, tag) {
  const re = new RegExp('(<' + tag + '\\b[^>]*>)([\\s\\S]*?)(<\\/' + tag + '>)', 'gi');
  return src.replace(re, function (all, open, body, close) {
    let out = body.replace(/\/\*[\s\S]*?\*\//g, '');
    /* 줄 주석은 «줄 앞»에 있는 것만 — 주소(https://…) 를 자르지 않는다 */
    out = out.replace(/^[ \t]*\/\/.*$/gm, '');
    return open + out + close;
  });
}

function stripComments(src) {
  let s = String(src == null ? '' : src);
  s = s.replace(/<!--[\s\S]*?-->/g, '');   // ① 짝이 분명한 HTML 주석 먼저
  s = stripInBlocks(s, 'script');          // ② 코드 안에서만
  s = stripInBlocks(s, 'style');
  return s;
}

/* 자바스크립트 파일(.js)은 통째로 코드다 — 태그를 찾을 것이 없다 */
function stripJs(src) {
  return String(src == null ? '' : src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

module.exports = { stripComments: stripComments, stripJs: stripJs };
