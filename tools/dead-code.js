#!/usr/bin/env node
/* 죽은 코드 세기 — «원문 기준으로» (STATUS ④ A1)
 *
 * ■ 왜 이 자리가 오래 막혀 있었나 — 세는 법이 두 번 틀렸다 (2026-09-05 실측)
 *
 *   ㉠ 중괄호를 그냥 세기 → «글자 안의 중괄호»에 속는다.
 *        return out + "}";
 *      이 } 하나에 셈이 어긋나 다음 함수의 몸통이 «파일 끝까지» 삼켜지고,
 *      진짜 부르는 자리가 「제 몸통 안」으로 잘못 걸린다.
 *      실제로 rules.html 의 dlDoc(두 곳에서 불린다)이 「146KB 짜리 죽은 코드」로 잡혔다.
 *
 *   ㉡ 글자·주석·정규식·틀글을 걷어낸 뒤 세기 → 틀글(``)의 닫는 백틱을 놓치면
 *      그 뒤가 통째로 글자로 읽힌다. pu-cards.html 에서 함수 1,406개가 55개로 줄었다.
 *      이 저장소는 화면을 백틱으로 짓는 곳이 많아 특히 위험하다.
 *
 * ■ ★ 그래서 괄호를 «아예 안 센다».
 *   필요한 물음은 하나뿐이다 — 「이 이름이 «선언 말고» 어디에든 나오는가」.
 *   저장소 전체에서 낱말로 세고, 제 선언 하나를 뺀다. 남으면 산 것이다.
 *
 *   ⚠ 이 셈은 «넉넉한 쪽»으로 틀린다 — 제 몸통 안에서 저를 부르는 함수(재귀)는
 *     죽었어도 산 것으로 본다. 그래도 그 편이 낫다.
 *     **산 것을 지우는 것보다 죽은 것을 남기는 편이 싸다.**
 *
 * ■ 「살아 있다」를 넓게 본다 — onclick="fn()" 같은 «글자» 도, 검사·문서도 센다.
 *   그래서 이 연장은 「죽었다」를 성급히 말하지 않는다. 지울지는 사람이 본다.
 *
 * 쓰기:  node tools/dead-code.js            (앱 화면 + js/ 전부)
 *        node tools/dead-code.js pu-cards.html
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* 주석을 «자리는 남기고» 지운다 — 줄 번호가 원문과 그대로 맞아야 한다.
   ⚠ 이것 없이 세면 «주석에 적어 둔 함수»를 진짜 선언으로 읽는다.
     js/pu-co-thread.js 는 「자리가 생기면 이렇게 쓰면 된다」를 주석에 적어 두었는데,
     2026-09-05 에 그 둘(fromSms·fromKakao)이 「죽은 코드」로 잡혔다. */
function 주석빼기(src) {
  const out = src.split('');
  const 지우기 = (a, b) => { for (let i = a; i < b && i < out.length; i++) if (out[i] !== '\n') out[i] = ' '; };
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const b2 = e < 0 ? src.length : e + 2; 지우기(i, b2); i = b2 - 1; }
    else if (src[i] === '/' && src[i + 1] === '/') { let e = src.indexOf('\n', i); if (e < 0) e = src.length; 지우기(i, e); i = e - 1; }
  }
  return out.join('');
}

/* 함수 «선언»만 찾는다 — 몸통 끝은 안 본다(위 ★)
   ⚠ 즉시 실행 함수 «(function 이름(){…})()» 는 «부르는 자리가 없어도 산다».
     이름 앞이 여는 괄호면 그것이다. 2026-09-05 에 cleanupLS·bindGlobalPhotoDrag 가
     그렇게 「죽은 코드」로 잡혔다 — 지웠으면 앱이 시작할 때 하던 일이 통째로 사라졌다. */
function 선언들(src) {
  const bare = 주석빼기(src), out = [];
  const re = /(?:^|[^\w$.])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(bare))) {
    /* ⚠ 앞 글자를 볼 때 «잘라 내지 않는다» — 500KB 를 함수마다 자르면
       1,400번 × 500KB 가 되어 멈춘 것처럼 느려진다(2026-09-05 에 실제로 겪었다). */
    let k = m.index + m[0].indexOf('function') - 1;
    while (k >= 0 && /\s/.test(bare[k])) k--;
    out.push({ name: m[1], at: m.index, 즉시: k >= 0 && bare[k] === '(' });
    re.lastIndex = m.index + m[0].length - 1;
  }
  return out;
}

/* ⚠ 앞의 점(.)을 빼지 «않는다». 이 저장소의 검사들은 함수를 떼어내 «ctx.fn(...)» 로
     부른다 — 점을 빼고 세면 그것이 안 잡혀 «산 것을 죽었다»고 말한다
     (2026-09-05 에 pickEmail 이 실제로 그렇게 잡혔다).
   ⚠ 대신 obj.fn 처럼 남의 것까지 세게 되어 «넉넉한 쪽»으로 틀린다 — 그 편이 안전하다. */
function 낱말(name) {
  return new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
}
function 세기(hay, name) {
  const re = 낱말(name);
  let n = 0;
  while (re.exec(hay)) n++;
  return n;
}

function 파일모으기() {
  const out = {};
  (function walk(dir, depth) {
    if (depth > 3) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(html|js|md)$/.test(e.name)) out[path.relative(ROOT, p)] = fs.readFileSync(p, 'utf8');
    }
  })(ROOT, 0);
  return out;
}

/* 앱이 실제로 배포하는 것만 본다 — 참고본·목업은 대상이 아니다 */
function 볼파일(전체) {
  return Object.keys(전체).filter(f =>
    (/^[^/]+\.html$/.test(f) || /^js\/[^/]+\.js$/.test(f))
    && !f.startsWith('reference/') && !f.startsWith('docs/'));
}

function 훑기(파일들, 전체) {
  const 결과 = [];
  for (const f of 파일들) {
    const src = 전체[f]; if (!src) continue;
    const 본 = {};
    const 모두 = 선언들(src);
    for (const d of 모두) {
      if (본[d.name]) continue;
      본[d.name] = 1;
      if (모두.some(x => x.name === d.name && x.즉시)) continue;   /* 즉시 실행 — 산 것 */
      const 선언수 = 모두.filter(x => x.name === d.name).length;
      /* 제 파일에 선언 말고 더 나오면 산 것 */
      if (세기(src, d.name) > 선언수) continue;
      const 남 = Object.keys(전체).filter(k => k !== f && 낱말(d.name).test(전체[k]));
      결과.push({
        file: f, name: d.name, 남,
        검사만: !!남.length && 남.every(k => k.startsWith('tests/') || k.startsWith('docs/')),
        없음: !남.length,
        line: src.slice(0, d.at).split('\n').length
      });
    }
  }
  return 결과;
}

module.exports = { 선언들, 낱말, 세기, 훑기, 파일모으기, 볼파일 };

if (require.main === module) {
  const 전체 = 파일모으기();
  const 볼것 = process.argv[2] ? [process.argv[2]] : 볼파일(전체);
  const r = 훑기(볼것, 전체);
  const 죽음 = r.filter(x => x.없음);
  const 검사만 = r.filter(x => x.검사만);
  console.log('■ 아무 데서도 안 불린다 — ' + 죽음.length + '개');
  죽음.forEach(x => console.log('   ' + x.file + ':' + x.line + '  ' + x.name));
  console.log('\n■ «검사·문서만» 부른다 — ' + 검사만.length + '개 (아무도 안 쓰는데 검사가 지켜 준다)');
  검사만.forEach(x => console.log('   ' + x.file + ':' + x.line + '  ' + x.name + '  ← ' + x.남.join(', ')));
}
