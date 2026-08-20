/* 함수 하나를 소스에서 «통째로» 잘라 오는 공용 자르개.

   왜 있는가 — 검사가 「함수가 한 줄로 쓰여 있음」을 박아 두면 안 되기 때문이다.
   예전에는 `source.indexOf('\n', at)` 로 «첫 줄만» 잘랐다. 그래서 pu-cards.html 의
   render() 에 주석 한 줄을 더한 순간(2026-08-20) 검사 넷이 한꺼번에 깨졌다 —
   기능은 멀쩡했는데 배포가 나흘 동안 막혔다(작업 841~844).
   CLAUDE.md 「지금 값이 아니라 규칙을 못 박는다」 그대로다: 우리가 지켜야 할 규칙은
   «render() 가 무엇을 부르는가» 이지 «몇 줄로 쓰였는가» 가 아니다.

   여는 중괄호부터 짝이 맞는 닫는 중괄호까지 세어서 자른다. 따옴표·백틱·주석 안의
   중괄호는 세지 않는다. */
'use strict';

function sliceFn(source, head){
  const at = source.indexOf(head);
  if(at < 0) throw new Error('소스에서 ' + head + ' 를 찾지 못했습니다');
  let i = source.indexOf('{', at + head.length - 1);
  if(i < 0) throw new Error(head + ' 의 여는 중괄호를 찾지 못했습니다');
  let depth = 0;
  for(; i < source.length; i++){
    const c = source[i], n = source[i+1];
    if(c === '/' && n === '/'){ i = source.indexOf('\n', i); if(i < 0) break; continue; }
    if(c === '/' && n === '*'){ i = source.indexOf('*/', i + 2) + 1; if(i < 1) break; continue; }
    if(c === '"' || c === "'" || c === '`'){
      for(i++; i < source.length; i++){
        if(source[i] === '\\'){ i++; continue; }
        if(source[i] === c) break;
      }
      continue;
    }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return source.slice(at, i + 1); }
  }
  throw new Error(head + ' 의 짝 맞는 닫는 중괄호를 찾지 못했습니다');
}

module.exports = { sliceFn };
