/* 「목록을 달라고 했는데 덩어리가 왔다」 — 화면이 통째로 죽던 것
   (2026-08-13) 대표 화면: 세금계산서 탭이 「fin/invoice 렌더링 오류」로 안 열렸다.
     · (incs || []).forEach is not a function      ← erpInvoiceMatchAll
     · (dbGet(…) || []).forEach is not a function  ← 알림 다시읽기
   까닭: 서버(RTDB)는 중간이 빈 목록을 {"0":…,"3":…} 꼴 덩어리로 돌려준다.
   부르는 곳 296군데가 (dbGet(…)||[]) 로 감싸 놨지만 || 는 «비었을 때» 만 막는다
   — 덩어리는 참(truthy)이라 그대로 통과해 .forEach 에서 터진다.
   그래서 뿌리인 dbGet 에서 «목록을 달라고 했으면 반드시 목록으로» 돌려준다. */
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

// ── 소스에서 진짜 dbGet 을 꺼내 돌린다 (흉내 낸 것으로 시험하면 뜻이 없다) ──
const store = {};
const ctx = {
  console: console,
  KEY: 'pu_',
  localStorage: { getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; } }
};
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  if(a < 0 || b < 0) throw new Error('소스에서 못 찾음: ' + from);
  return src.slice(a, b);
};
vm.runInContext('var _dbCache = {};', ctx);
vm.runInContext(grab('var _dbListMemo =', '\nfunction dbGet(k, def){'), ctx);
vm.runInContext(grab('function dbGet(k, def){', '\n\n// 손상된 localStorage'), ctx);

console.log('\n■ _dbAsList — 덩어리를 목록으로 편다');
t('목록은 그대로', ctx._dbAsList([1, 2, 3]), [1, 2, 3]);
t('덩어리를 편다', ctx._dbAsList({ '0':'가', '1':'나' }), ['가', '나']);
t('빠진 자리가 있어도 값만 남긴다', ctx._dbAsList({ '0':'가', '3':'라' }), ['가', '라']);
t('숫자 순으로 — 글자 순이면 10이 2보다 앞선다',
  ctx._dbAsList({ '2':'다', '10':'십', '1':'가' }), ['가', '다', '십']);
t('null 은 걸러낸다', ctx._dbAsList({ '0':'가', '1':null, '2':'다' }), ['가', '다']);
t('null 자체는 빈 목록', ctx._dbAsList(null), []);
t('글자는 빈 목록 — .forEach 로 터지느니 비어 있는 게 낫다', ctx._dbAsList('가나다'), []);
t('숫자도 빈 목록', ctx._dbAsList(7), []);
t('키가 이름인 덩어리도 편다', ctx._dbAsList({ b:2, a:1 }), [1, 2]);

// 같은 덩어리는 «같은 목록» 이어야 한다 — 렌더마다 새 목록이면 화면이 쓸데없이 다시 그려진다
const blob = { '0':{ id:'x' }, '1':{ id:'y' } };
t('같은 덩어리는 같은 목록을 돌려준다 (기억해 둔다)',
  ctx._dbAsList(blob) === ctx._dbAsList(blob), true);

console.log('\n■ dbGet — 목록을 달라고 하면 반드시 목록');
store['pu_finance_income'] = JSON.stringify({ '0':{ amount:100 }, '1':{ amount:200 } });
const got = ctx.dbGet('finance_income', []);
t('덩어리로 저장돼 있어도 목록으로 준다', Array.isArray(got), true);
t('내용이 살아 있다', got.map(function(x){ return x.amount; }), [100, 200]);
// 이 한 줄이 곧 「(dbGet(…)||[]).forEach is not a function」 이 다시 안 나는가
t('.forEach 를 곧바로 부를 수 있다',
  (function(){ let n = 0; (ctx.dbGet('finance_income', []) || []).forEach(function(){ n++; }); return n; })(), 2);

vm.runInContext('_dbCache = {};', ctx);
store['pu_cases'] = JSON.stringify([{ id:'c1' }]);
t('원래 목록이면 손대지 않는다', ctx.dbGet('cases', []), [{ id:'c1' }]);

vm.runInContext('_dbCache = {};', ctx);
store['pu_settings'] = JSON.stringify({ theme:'dark' });
t('목록을 안 달라고 하면 덩어리 그대로 (설정값 등)', ctx.dbGet('settings', {}), { theme:'dark' });

vm.runInContext('_dbCache = {};', ctx);
t('없는 열쇠는 기본값', ctx.dbGet('nope', []), []);

vm.runInContext('_dbCache = {};', ctx);
store['pu_broken'] = '{이건 JSON 이 아니다';
t('깨진 값도 안 터진다', ctx.dbGet('broken', []), []);

console.log('\n■ 소스가 뿌리에서 막고 있는가');
t('dbGet 이 _dbAsList 를 거친다',
  /if\(Array\.isArray\(def\) && !Array\.isArray\(out\)\) return _dbAsList\(out\);/.test(src), true);
t('erpInvoiceMatchAll 이 덩어리에도 안 죽는다 — (incs || []) 를 안 쓴다',
  /function erpInvoiceMatchAll[\s\S]{0,900}?\(incs \|\| \[\]\)\.forEach/.test(src), false);
t('erpInvoiceMatchAll 이 목록으로 펴서 돈다',
  /function erpInvoiceMatchAll[\s\S]{0,900}?_asList\(incs\)\.forEach/.test(src), true);
t('계산서 쪽도 마찬가지',
  /function erpInvoiceMatchAll[\s\S]{0,1600}?_asList\(invs\)\.forEach/.test(src), true);
t('입금 색인이 덩어리를 «버리지» 않는다 — 통째로 [] 로 갈아치우던 줄이 없다',
  /var incs = dbGet\('finance_income', \[\]\) \|\| \[\];\n\s*if\(!Array\.isArray\(incs\)\) incs = \[\];/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
