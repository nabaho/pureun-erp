/* 제출서류 — [서식]을 누르면 «오른쪽»에서 채우고 저장할 수 있나.

   전에는 서식 자료실로 화면을 옮겼다. 자료실은 «빈 양식을 받아 가는 곳»이라,
   지원금 서류를 챙기다 말고 딴 화면으로 나가게 된다. 여기서 바로 열어야
   목록을 보며 한 장씩 채우고 저장할 수 있다.

   ⚠ sidePreview 는 #formSide 를 «이름으로» 찾는다 — 그 이름의 자리만 두면
     편집 도구가 통째로 따라온다. 없으면 스스로 팝업으로 물러선다.

   실행: node fund-erp/tools/check_subside.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
/* jsdom 은 안 쓴다 — 여기서 보는 것은 «그린 글»이 아니라 배선과 태그 짝이다.
   (그대로 require 하면 jsdom 없는 곳에서 이 한 줄이 배포를 멈춘다) */

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };

const fn = (n) => { const i = src.indexOf('function ' + n + '('); let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
const panel = fn('subsidyDocsPanel');

console.log('■ 화면을 안 떠난다');
ok('[서식] 칩이 subDocForm 을 부른다', /onclick="subDocForm\(/.test(panel), '아직 화면을 옮긴다');
ok('서식 자료실로 옮기지 않는다', !/openFundDoc\(/.test(panel), '아직 openFundDoc 을 부른다');
const f = fn('subDocForm');
ok('그 기금 자료로 채운다', /S\.formFund=S\.fundId/.test(f), f);
ok('오른쪽 판을 그린다', /sidePreview\(kind\)/.test(f), f);

console.log('\n■ 오른쪽 판이 있다');
ok('#formSide 자리가 있다', /id="formSide"/.test(panel), '이름이 없으면 팝업으로 물러선다');
ok('좌우로 나뉜다', /id="subSplit"/.test(panel));
ok('내려도 따라온다 (sticky)', /position:sticky/.test(panel));
/* 굵게 표시가 사이에 낀다(<b>[📄 서식]</b>을) — 태그를 걷고 본다 */
const plain = panel.replace(/<[^>]*>/g, '');
ok('무엇을 하는 곳인지 알려 준다', /\[📄 서식\]을 누르면/.test(plain), plain.slice(-200));
ok('저장해야 남는다고 말해 준다', /\[💾 이 기금\]으로 저장하면/.test(plain), plain.slice(-200));

console.log('\n■ 태그가 맞물리나 — 여는 만큼 닫는가');
/* 로딩 중 갈래는 좌우로 안 감싼다 — 감싸 놓고 안 닫으면 화면이 깨진다 */
ok('로딩 갈래는 감싸지 않는다',
   !/return '<div id="subSplit"[\s\S]{0,200}loadingHTML\(\)/.test(panel), '로딩 return 이 split 을 연다');
const open = (panel.match(/<div/g) || []).length;
const close = (panel.match(/<\/div>/g) || []).length;
ok('여는 div 와 닫는 div 수가 같다', open === close, open + ' vs ' + close);

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (제출서류에서 바로 채운다)');
process.exit(bad ? 1 : 0);
