/* 입금 확인 알림은 «푸른이알피 타일에» 붙는다 (대표 지시 2026-08-24, 다안)

   ★ 무슨 일이 있었나
     화면 왼쪽 «아래 구석» 에 빨간 알약(💰 입금 확인 2건 · 사무관리 2건)으로 떠 있었다.
     타일과 떨어져 있어 어느 프로그램 일인지 바로 안 보였고, 구석을 한 칸 차지했다.
     대표 지시: 「푸른이알피에 연동되는 것이라 푸른이알피(타일) 왼쪽에 보이게」.

   ★ 지키려는 것
     ① 구석에 뜨는 알약을 다시 만들지 않는다
     ② 표시는 «푸른이알피 타일» 에 붙는다
     ③ 표시를 눌러도 타일이 안 눌린다 (확인 창과 이알피가 같이 열리면 안 된다)
     ④ 확인할 것이 없으면 아무것도 안 그린다
     ⑤ 타일을 다시 그려도 표시가 살아남는다 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

/* 표시를 그리는 함수만 떠 온다 */
const paint = html.slice(html.indexOf('function portalHanaPaintBadge(){'),
                         html.indexOf('function portalHanaRemoveUi(){'));
ok('표시를 그리는 함수를 찾았다', paint.length > 200);

console.log('\n[① 구석에 뜨는 알약을 다시 만들지 않는다]');
/* position:fixed 로 구석에 세우면 타일에 붙인 뜻이 없어진다 */
ok('★ 화면 구석에 세우지 않는다 (position:fixed 를 안 쓴다)',
   paint.indexOf('position:fixed') < 0 && paint.indexOf("bottom:") < 0);
ok('★ 옛 알약(portalHanaChip)이 남아 있지 않다', html.indexOf('portalHanaChip') < 0,
   '알약과 타일 표시가 둘 다 뜹니다');

console.log('\n[② 푸른이알피 타일에 붙는다]');
ok('★ 이알피 타일을 찾아서 그 안에 넣는다',
   /querySelector\('\.tile\[data-key="erp"\]'\)/.test(paint) && /tile\.appendChild\(/.test(paint));
ok('타일이 아직 없으면 조용히 넘어간다 (다음 조회 때 붙는다)',
   /if\(!tile\) return;/.test(paint),
   '타일이 없을 때 터지면 포털이 통째로 멈춥니다');
/* 자리는 css 한 곳에서 정한다 — 코드에 좌표를 흩뿌리지 않는다 */
ok('★ 자리·모양은 css(.tile-alert) 한 곳에서 정한다',
   /\.tile-alert\{[^}]*position:absolute/.test(html) && /className = 'tile-alert'/.test(paint));
ok('왼쪽에 선다 (대표 지시 「왼쪽에」)', /\.tile-alert\{[^}]*left:/.test(html));

console.log('\n[③ 표시를 눌러도 타일이 안 눌린다]');
/* 타일은 <a> 다. 안 끊으면 확인 창이 뜨면서 이알피도 함께 열려 창이 두 개가 된다. */
ok('★ 눌린 것이 위로 안 퍼진다 (stopPropagation)', /stopPropagation\(\)/.test(paint));
ok('★ 타일의 링크 이동을 막는다 (preventDefault)', /preventDefault\(\)/.test(paint));
ok('눌렀을 때 확인 창이 열린다', /showPortalHanaModal\(/.test(paint));

console.log('\n[④ 없으면 아무것도 안 그린다]');
ok('★ 0건이면 표시를 안 만든다', /if\(!items \|\| !items\.length\) return;/.test(paint));
ok('그릴 때마다 먼저 지운다 — 숫자가 겹쳐 쌓이지 않는다',
   /portalHanaRemoveBadge\(\);/.test(paint));

console.log('\n[⑤ 타일을 다시 그려도 살아남는다]');
/* 조회는 3분마다인데 타일은 그 사이에도 다시 그려진다 — 들고 있다가 곧바로 다시 붙인다 */
ok('★ 아는 알림을 들고 있는다', /var portalHanaItems = \[\];/.test(html));
ok('★ 타일을 새로 그린 직후 다시 붙인다',
   /initPortalHanaAlerts\(role\);[\s\S]{0,300}?portalHanaPaintBadge\(\);/.test(html),
   '안 붙이면 다음 조회(3분)까지 표시가 사라져 있습니다');
ok('로그아웃하면 들고 있던 것도 비운다',
   /portalHanaItems = \[\];[\s\S]{0,80}?portalHanaRemoveBadge\(\);/.test(html));

console.log('\n[⑥ 좁은 타일에 다 못 적는 것은 올려서 본다]');
ok('자세한 내용을 title 로 남긴다', /b\.title = /.test(paint));
ok('사무관리 건수도 함께 알려 준다', /사무관리/.test(paint));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
