/* 골라 둔 짝도 함께 본다 (2026-08-10 대표 지시: "골라둔짝도 보이게")
   줄은 묶음으로 함께 보게 됐는데 «어느 업체로 골라 뒀는지» 는 각자 PC 에만 남아,
   A가 골라 둔 줄을 B는 여전히 「확인 필요」로 보고 같은 일을 또 했다.
   ★ 골라 둔 것을 서버에 두되, «누가 골랐는지» 도 함께 적는다 —
     남이 골라 둔 것을 확정하기 전에 누구에게 물어야 할지 알아야 한다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
vm.runInContext(grab('var LEDGER_PICK_KEY =', 'if(typeof window !== \'undefined\'){\n  window.erpMakeBatch'), ctx);

const KWON = { sid:'P-001', name:'권형하' };
const BORAM = { sid:'A-003', name:'김보람' };

console.log('\n[① 골랐다 — 누가 골랐는지도 함께 적는다]');
let p = ctx.erpPickSet({}, '2026-07-14|2100000|비즈', 'pend-1', KWON);
t('고른 건 번호를 적는다', p['2026-07-14|2100000|비즈'].pid, 'pend-1');
t('★ 누가 골랐는지 적는다 (물어볼 사람을 알아야 한다)',
  [p['2026-07-14|2100000|비즈'].by, p['2026-07-14|2100000|비즈'].byName], ['P-001', '권형하']);
t('언제 골랐는지도', /^\d{4}-/.test(p['2026-07-14|2100000|비즈'].at), true);

console.log('\n[② 있던 것 위에 얹는다 — 남이 고른 것을 지우면 안 된다]');
/* 화면이 들고 있던 낡은 판을 통째로 쓰면 그 사이 남이 골라 둔 것이 지워진다 */
let p2 = ctx.erpPickSet(p, '2026-07-05|300000|더빌', 'pend-2', BORAM);
t('★ 앞서 고른 것이 그대로 있다', Object.keys(p2).length, 2);
t('새로 고른 것도 있다', p2['2026-07-05|300000|더빌'].byName, '김보람');
t('원래 것을 건드리지 않는다 (넘겨받은 판을 고치면 되돌릴 수 없다)', Object.keys(p).length, 1);
t('같은 줄을 다시 고르면 갈아 끼운다',
  ctx.erpPickSet(p2, '2026-07-05|300000|더빌', 'pend-9', KWON)['2026-07-05|300000|더빌'].pid, 'pend-9');
t('건 번호가 없으면 고른 것을 푼다',
  Object.keys(ctx.erpPickSet(p2, '2026-07-05|300000|더빌', '', KWON)).length, 1);
t('줄 열쇠가 없으면 아무 일도 안 한다', Object.keys(ctx.erpPickSet(p2, '', 'x', KWON)).length, 2);
t('빈 값도 안 터진다', ctx.erpPickSet(null, 'k', 'v', null).k.pid, 'v');

console.log('\n[③ 줄을 치우면 그 줄의 고른 것만 푼다]');
const p3 = ctx.erpPickDrop(p2, ['2026-07-14|2100000|비즈']);
t('★ 치운 줄만 빠진다', Object.keys(p3), ['2026-07-05|300000|더빌']);
t('남의 것은 그대로 (통째로 비우면 남이 고른 것까지 날아간다)', p3['2026-07-05|300000|더빌'].byName, '김보람');
t('없는 줄을 지워도 안 터진다', Object.keys(ctx.erpPickDrop(p2, ['없는줄'])).length, 2);
t('빈 목록이면 그대로', Object.keys(ctx.erpPickDrop(p2, [])).length, 2);
t('빈 값도 안 터진다', ctx.erpPickDrop(null, ['k']), {});

console.log('\n[④ 화면이 쓰는 꼴로]');
const m = ctx.erpPickMap(p2);
t('줄열쇠 → 건번호', m['2026-07-14|2100000|비즈'], 'pend-1');
t('두 줄 모두', Object.keys(m).length, 2);
/* 예전에는 값이 그냥 건번호였다 — 그때 것도 읽혀야 한다 */
t('★ 옛 꼴(값이 그냥 번호)도 읽는다', ctx.erpPickMap({ 'k1':'pend-x' }).k1, 'pend-x');
t('빈 값도 안 터진다', ctx.erpPickMap(null), {});
t('배열이 들어와도 안 터진다', ctx.erpPickMap([1,2]), {});

console.log('\n[⑤ 누가 골랐나 — 내 것에는 이름표를 안 붙인다]');
/* 내 화면이 온통 내 이름이면 정작 남이 고른 줄이 눈에 안 들어온다 */
t('★ 남이 고른 줄이면 이름을 준다',
  ctx.erpPickWho(p2, '2026-07-05|300000|더빌', 'P-001').name, '김보람');
t('★ 내가 고른 줄에는 안 붙인다',
  ctx.erpPickWho(p2, '2026-07-14|2100000|비즈', 'P-001'), null);
t('로그인 정보가 없으면 모두 남의 것으로 본다',
  ctx.erpPickWho(p2, '2026-07-14|2100000|비즈', '').name, '권형하');
t('안 고른 줄이면 null', ctx.erpPickWho(p2, '없는줄', 'P-001'), null);
t('옛 꼴(누가 골랐는지 없음)이면 null', ctx.erpPickWho({ k1:'pend-x' }, 'k1', 'P-001'), null);
t('빈 값도 안 터진다', ctx.erpPickWho(null, 'k', 'P-001'), null);

console.log('\n[⑥ 서버에 올린다 — 이것이 「함께 보이게」의 뼈대]');
/* ⚠ 줄 모양 그대로가 아니라 «목록 안에 있는가»를 본다 — 2026-08-20 에 뒤에
   'ui_pins' 를 더하면서 쉼표·칸이 바뀌었고, 멀쩡한 고침이 이 검사에 걸렸다. */
t('★ 동기화 목록에 있다 (없으면 여전히 이 PC 에만 남는다)', (function(){
  var i = src.indexOf('var FB_ALL_SYNC_KEYS = [');
  if(i < 0) return false;
  return /'ledger_picks'/.test(src.slice(i, src.indexOf('];', i)));
})(), true);
t('서버 동기화에서 빠지지 않았다', /FB_EXCLUDE = \[[^\]]*'ledger_picks'/.test(src), false);
t('★ 저장 직전에 다시 읽어 그 위에 얹는다 (낡은 판을 통째로 쓰면 남의 것이 지워진다)',
  /var cur = dbGet\(LEDGER_PICK_KEY, \{\}\) \|\| \{\};\s*\n\s*dbSet\(LEDGER_PICK_KEY, erpPickSet\(cur, rowKey, pid,/.test(src), true);
t('저장이 실패해도 화면은 그대로 둔다 (고른 것이 눈앞에서 되돌아가면 더 헷갈린다)',
  /function savePick\(rowKey, pid\)\{\s*\n\s*try\{/.test(src), true);

console.log('\n[⑦ 고르는 모든 길이 서버로 간다]');
/* 한 곳이라도 빠지면 「어떤 것은 보이고 어떤 것은 안 보이는」 더 나쁜 상태가 된다 */
t('표에서 고르기', /nm\[row\._k\] = pid; setInMatch\(nm\);\s*\n\s*savePick\(row\._k, pid\);/.test(src), true);
t('확인 창에서 고르기', /nm\[row\._k\]=pid; setInMatch\(nm\);\s*\n\s*savePick\(row\._k, pid\);/.test(src), true);
t('찾기 창에서 고르기', /nm\[sugPopK\]=pid; setInMatch\(nm\);\s*\n\s*savePick\(sugPopK, pid\);/.test(src), true);
t('★ ⚡자동 매칭도 (한 번에 얹는다 — 한 줄씩 올리면 저장이 여러 번 돈다)',
  /Object\.keys\(nm\)\.forEach\(function\(k\)\{\s*\n\s*_cur2 = erpPickSet\(_cur2, k, nm\[k\]/.test(src), true);
t('★ 파일 올리며 저절로 짝지은 것도',
  /Object\.keys\(auto\)\.forEach\(function\(k\)\{\s*\n\s*_cur3 = erpPickSet\(_cur3, k, auto\[k\]/.test(src), true);

console.log('\n[⑧ 풀리는 자리 — 남의 것을 말없이 날리지 않는다]');
t('줄을 치우면 그 줄의 고른 것을 푼다', /dropPicks\(\[key\]\);/.test(src), true);
t('★ 묶음을 지우면 그 묶음 줄의 것만 푼다',
  /dropPicks\(\(b\.rows \|\| \[\]\)\.map\(function\(r\)\{ return r && r\._k; \}\)\.filter\(Boolean\)\)/.test(src), true);
t('★ 「비우기」도 지운 묶음 줄의 것만 (통째로 비우면 남이 고른 것까지 날아간다)',
  /dropPicks\(erpBatchRows\(mine\)\.map\(function\(r\)\{ return r\._k; \}\)\);/.test(src), true);

console.log('\n[⑨ 열 때 서버 것을 먼저 본다]');
t('★ 서버에 있으면 서버 것', /var _pk0 = erpPickMap\(dbGet\(LEDGER_PICK_KEY, \{\}\) \|\| \{\}\);/.test(src), true);
t('아직 없으면 이 기기 옛 것 (하던 일을 잃지 않게)',
  /setInMatch\(Object\.keys\(_pk0\)\.length \? _pk0 : \(d\.inMatch \|\| \{\}\)\);/.test(src), true);

console.log('\n[⑩ 화면에 「누가 골랐는지」 가 뜬다]');
t('남이 고른 줄에 이름표', /'✋ '\+_pw\.name/.test(src), true);
t('언제 골랐는지는 도움말로', /_pw\.at\?\('\\n'\+String\(_pw\.at\)\.slice\(0,16\)/.test(src), true);
t('확정 전에 확인하라고 적는다', /확정하기 전에 한 번 확인하세요/.test(src), true);
t('내 것에는 안 붙는다 (pickedBy 가 내 사번을 걸러 낸다)',
  /return erpPickWho\(_pickRaw, rowKey, u\.sid \|\| ''\);/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
