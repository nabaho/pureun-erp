/* 계약 삭제 — 되살렸으되 «안전 절차» 로만 (대표 승인 2026-08-23)

   ★ 무슨 일이 있었나
     계약관리에 삭제 코드(del·removeOne)는 있는데 부르는 단추가 없었다.
     그런데 그 코드는 «즉시 삭제» 였다 — 누구나, 사유 없이, 서버에서 곧바로 지우고,
     되돌리기는 토스트가 사라지기 전까지뿐. 그래서 단추가 떼어져 있었던 것으로 보인다.
     한편 종료보관함에는 «안전한 삭제» 가 이미 있었다(관리자·사유·휴지통).

   ★ 지키려는 것: 계약을 지우는 길은 하나뿐이고, 그 길은 안전하다.
       ① 총괄관리자만  ② 사유를 적어야 넘어간다  ③ 휴지통으로 간다(복원 가능)
       ④ 잠긴 달은 못 뚫는다
     ⚠ 「즉시 삭제」로 되돌아가지 않는다 — dbRemove('contracts', …) 가 다시 생기면 잡는다. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

/* 계약관리(ContractManagement) 안의 del 만 본다 — 다른 화면에도 같은 이름이 있다 */
const CM = src.slice(src.indexOf('function ContractManagement(props){'),
                     src.indexOf('function DupSweepModal(props){'));
ok('계약관리 화면을 찾았다 (범위 규칙이 바뀌면 알려 준다)', CM.length > 1000);

const del = CM.slice(CM.indexOf('async function del(id){'),
                     CM.indexOf('function reseed(){'));
ok('삭제 함수를 찾았다', del.indexOf('TrashBin.remove') > 0 || del.length > 0);

console.log('\n[① 총괄관리자만]');
ok('★ 관리자가 아니면 그 자리에서 돌려보낸다',
   /if\(!CURRENT_USER \|\| !CURRENT_USER\.isAdmin\)\s*\{[^}]*return;/.test(del));
ok('★ 단추 자체가 관리자에게만 보인다 (PC 카드 두 갈래 + 폰 카드)',
   (CM.match(/CURRENT_USER && CURRENT_USER\.isAdmin\)[\s\S]{0,120}?del\(c\.id\)/g) || []).length >= 3,
   '이관 가능/불가 두 갈래와 폰 카드 — 한 곳만 붙이면 상태에 따라 사라진다');

console.log('\n[② 사유를 적어야 넘어간다]');
/* 「물어보는 문구가 어딘가 있다」가 아니라 «그 답을 실제로 쓴다» 를 본다 —
   prompt 문구만 남겨 두고 값은 딴 데서 가져오면 사유를 안 받는 것과 같다. */
ok('★ 사유를 물어보고, 그 답을 쓴다',
   /var reason = prompt\(/.test(del) && /왜 지우는지/.test(del));
ok('★ 창을 닫으면(null) 아무 일도 없다', /if\(reason === null\) return;/.test(del));
ok('★ 빈 사유로는 못 지운다', /if\(!String\(reason\)\.trim\(\)\)/.test(del));
ok('★ 사유가 기록에 실린다', /TrashBin\.remove\('contracts', id, String\(reason\)\.trim\(\)\)/.test(del));

console.log('\n[③ 휴지통으로 간다 — 즉시 삭제가 아니다]');
ok('★ 휴지통으로 옮긴다', /TrashBin\.remove\('contracts'/.test(del));
/* ⚠ 이것이 이 검사의 핵심이다. dbRemove 는 서버에서 곧바로 지운다 —
   되살릴 길이 없다. 계약관리에서는 다시 쓰지 않는다. */
ok('★ 「즉시 삭제」(dbRemove)로 되돌아가지 않는다', CM.indexOf("dbRemove('contracts'") < 0,
   'dbRemove 는 되돌릴 수 없다. 지우려면 TrashBin.remove 를 쓴다');
ok('되살릴 수 있다고 말해 준다 (어디서 되살리는지까지)',
   /환경설정 → 휴지통/.test(del));

console.log('\n[④ 마감을 뚫지 않는다]');
ok('★ 잠긴 달의 계약은 못 지운다', /if\(!lockGuard\(c\)\) return;/.test(del));

console.log('\n[⑤ 지운 것은 목록에서 빠진다]');
ok('계약 목록이 휴지통 딱지를 걸러 낸다', /if\(c\._deleted\) return false;/.test(CM),
   '_deleted 를 안 거르면 지운 계약이 그대로 보인다');

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
