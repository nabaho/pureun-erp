/* 백업·복구 — 자리를 옮긴 뒤 «정말 열리는지» 그려서 본다.

   사이드바 메뉴에 「⬇ 전체 백업」이 있었는데, 기금 현황·청구 관리와 같은 층에 놓여
   «어느 화면으로 가는 것인가» 하고 누르게 됐다. 실제로는 파일 내려받기라 상단 ⚙ 로 옮겼다.

   문자열만 보는 검사로는 «단추는 있는데 창이 안 뜨는» 것을 못 잡는다 — 그래서 실제로 그린다.
   ⚠ jsdom 이 있어야 한다. 없으면 곱게 건너뛰되 «건너뛰었다»고 분명히 말한다(check_forms 와 같다).
     설치: npm i jsdom --no-save

   실행: node fund-erp/tools/check_backup.js */
const fs=require('fs'),path=require('path');
const W=path.resolve(__dirname,'..','..');
const src=fs.readFileSync(path.join(W,'fund.html'),'utf8');
let JSDOM;
try { JSDOM=require('jsdom').JSDOM; }
catch(e){ console.log('SKIP: jsdom 이 없어 백업·복구 창 검사를 건너뜁니다 (npm i jsdom --no-save)'); process.exit(0); }
const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only'});
global.window=dom.window;global.document=dom.window.document;
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
global.esc=s=>String(s==null?'':s);
global.$=id=>document.getElementById(id);
global.closeM=()=>{};
(0,eval)([gF('shell'),gF('showModal'),gF('showBackup')].join('\n'));

document.body.innerHTML=shell();
const side=document.getElementById('side').textContent.replace(/\s+/g,' ');
const top =document.getElementById('topright').textContent.replace(/\s+/g,' ');
let bad=0; const ok=(n,c,w)=>{ if(!c){bad++;console.log('  ✗ '+n+(w?'  — '+w:''));} else console.log('  · '+n); };
ok('사이드바에 「전체 백업」이 없다', !/전체 백업/.test(side), side);
ok('사이드바에 남은 메뉴는 셋', /기금 현황/.test(side)&&/청구 관리/.test(side)&&/서식 자료실/.test(side), side);
ok('상단에 ⚙ 가 있다', /⚙/.test(top), top);
ok('⚙ 누르면 showBackup 이 열린다', /showBackup\(\)/.test(document.getElementById('toolsbtn').getAttribute('onclick')));

showBackup();
const box=document.getElementById('modalbox');
ok('백업·복구 창이 뜬다', !!box);
const t=box?box.textContent.replace(/\s+/g,' '):'';
ok('제목이 「백업·복구」', /백업·복구/.test(t), t.slice(0,60));
ok('내려받기 단추가 있다', /전체 백업 내려받기/.test(t), t.slice(0,80));
ok('그 단추가 exportAll 을 부른다',
   [].slice.call(box.querySelectorAll('button')).some(b=>/exportAll\(\)/.test(b.getAttribute('onclick')||'')));
/* 파일로 통째로 되돌리는 길은 «일부러» 두지 않았다 — 잘못 누르면 전 기금이 한 번에 날아간다.
   다만 실수로 지운 기금은 삭제 보관함에서 되살아나므로, 그 길을 함께 알려 주어야
   「되돌릴 방법이 아예 없다」고 읽히지 않는다. 둘 다 창에 있어야 한다. */
ok('되돌리기를 안 둔 까닭이 적혀 있다', /일부러 두지 않았습니다/.test(t), t);
ok('지운 기금을 되살리는 길을 알려 준다', /삭제 보관함.{0,10}복원/.test(t), t);
console.log(bad?'\nFAILURES '+bad:'\nALL PASS');
process.exit(bad?1:0);
