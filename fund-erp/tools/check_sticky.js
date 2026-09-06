/* 틀 고정 — 목록을 내려도 머리줄과 칸 이름이 남아 있나.

   기금이 44개라, 내리면 「기본정보/서식준비/결산/기한」과 「전체·충남·경기」 고르기가
   화면 밖으로 나갔다. 어느 묶음을 보고 있는지 모른 채 목록만 흐르게 된다.

   ⚠ 표 머리줄에는 함정이 있다. 감싼 상자에 overflow-x:auto 를 주면 CSS 규칙상
     세로(visible)가 auto 로 «따라 계산»되어 그 상자가 스크롤 상자가 된다.
     그러면 붙어 있기(position:sticky)는 그 상자 기준이 되어 아무 일도 안 일어난다.
     그래서 «가로로 넘칠 때만» 스크롤을 켠다(_syncTblScroll).

   여기서는 «배선»을 본다 — 붙어 보이는지 자체는 화면에서 눈으로 볼 일이다.
   실행: node fund-erp/tools/check_sticky.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };

console.log('■ 머리줄');
ok('#homehead 가 상단바 아래에 붙는다',
  src.includes('#homehead{position:sticky;top:var(--topbar-h,48px);z-index:11}'));
ok('머리줄에 이름표가 달려 있다', src.includes('<div class="panel" id="homehead"'));
ok('상단바(15) > 머리줄(11) > 표 머리(9) 차례',
  /#topbar\{position:sticky;top:0;z-index:15/.test(src)
  && src.includes('#homehead{position:sticky;top:var(--topbar-h,48px);z-index:11}')
  && /\.tblwrap thead th\{position:sticky[\s\S]{0,120}z-index:9/.test(src));

console.log('\n■ 표 머리줄');
ok('표 머리가 «상단바+머리줄» 아래에 붙는다',
  src.includes('top:calc(var(--topbar-h,48px) + var(--homehead-h,0px))'));
/* 기본 표는 칸 목록에서 머리를 만들므로(_headHTML) 머리글이 소스에 그대로 없다 —
   .tblwrap 이 달린 «표 수»로 센다. */
ok('목록 표 셋에 .tblwrap 이 달렸다',
  (src.match(/<div class="tblwrap"><table/g) || []).length === 3);
/* 다른 화면의 표까지 건드리면 안 된다 — 거기는 붙일 자리도 다르고 머리줄도 없다 */
ok('다른 화면 표는 그대로 둔다',
  (src.match(/<div style="overflow-x:auto"><table>/g) || []).length >= 8);

console.log('\n■ 넘칠 때만 가로 스크롤');
ok('기본은 열어 둔다', src.includes('.tblwrap{overflow:visible}'));
ok('넘치면 스크롤을 켠다', src.includes('.tblwrap.scrollx{overflow-x:auto}'));
/* 스크롤 상자 안에서는 붙기가 통하지 않는다 — 붙은 «척»만 하면 칸 이름이 겹쳐 보인다 */
ok('스크롤을 켠 상자에서는 붙이지 않는다',
  src.includes('.tblwrap.scrollx thead th{position:static;box-shadow:none}'));
ok('넘침을 재는 함수가 있다', src.includes('function _syncTblScroll(){')
  && src.includes('var over=t.scrollWidth>w.clientWidth+1;'));
/* 켜는 순간 폭이 달라져 되풀이될 수 있다 — 끌 때는 여유를 두어야 깜빡이지 않는다 */
ok('껐다 켰다 깜빡이지 않게 여유를 둔다', src.includes('t.scrollWidth<=w.clientWidth-8'));

console.log('\n■ 언제 다시 재나');
ok('머리줄 높이를 재는 함수가 있다', src.includes('function _syncHomeheadH(){'));
ok('그린 뒤에 잰다 (검색 갈래·일반 갈래 둘 다)',
  (src.match(/_syncHomeheadH\(\); _syncTblScroll\(\);/g) || []).length >= 2);
ok('창 크기가 바뀌면 다시 잰다',
  src.includes("window.addEventListener('resize',function(){ _syncHomeheadH(); _syncTblScroll(); });"));
/* 「정보 채우기」를 켜면 머리줄이 한 줄 늘어난다 — 그때도 따라가야 한다 */
ok('머리줄이 커지면 따라간다 (ResizeObserver)',
  src.includes('_homeheadRO=new ResizeObserver('));
ok('머리줄이 없는 화면에서는 0 으로 되돌린다',
  src.includes("document.documentElement.style.setProperty('--homehead-h','0px')"));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (틀 고정 배선)');
process.exit(bad ? 1 : 0);
