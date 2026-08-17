/* 통째 저장에도 동시편집 그물 + 글자 시각도 읽기 (2026-08-15 대표 지시 ③④)

   ★ ③ 저장하는 길이 셋인데 그물이 둘에만 있었다
       한 건 저장 dbUpsert      → 있음
       일괄 저장 dbUpsertMany   → 있음
       통째 저장 dbSet          → «없음» ← 그런데 화면에서 부르는 곳이 230군데로 제일 많다
     상담일지·업무일지·기타사업·기금·근태 대부분이 통째 저장을 쓴다.
     사라지는 것보다 나쁜 것은 «사라져도 모르는 것» 이다.

   ★ 그물이 «있어도 안 걸리던» 구멍
     겹침 판단은 저장 시각(updatedAt)을 견주는데, 숫자만 읽고 있었다.
     그런데 상담일지처럼 화면이 제 손으로 ISO 글자를 넣는 자리가 여럿이다 —
     그런 자리에서는 「시각을 모른다」로 보여 판단이 통째로 꺼졌다.
     있는 줄 알았는데 없는 것이 가장 나쁘다. 둘 다 읽게 했다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

/* 판단 층을 그대로 들여와 실제로 돌린다 */
const ctx = { console:console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'pu-conflict.js'), 'utf8')
  .replace("typeof window !== 'undefined' ? window : globalThis", 'this'), ctx);
const P = ctx.PuConflict;

console.log('\n[① 시각을 숫자로 적은 자료 — 예전부터 되던 것]');
const NUM_OLD = { id:'a', updatedAt:1000, updatedBy:'김보람', name:'옛이름' };
t('남이 나중에 고쳤으면 겹친다', !!P.check(Object.assign({}, NUM_OLD, { updatedAt:2000 }), NUM_OLD, {}), true);
t('내가 읽어온 뒤로 안 바뀌었으면 안 겹친다', P.check(NUM_OLD, NUM_OLD, {}), null);
t('내가 고친 것이면 알리지 않는다',
  P.check({ id:'a', updatedAt:2000, updatedBy:'권형하' }, { id:'a', updatedAt:1000 }, { myName:'권형하' }), null);

console.log('\n[② ★ 시각을 «글자»로 적은 자료 — 여기서 판단이 통째로 꺼져 있었다]');
/* 상담일지는 updatedAt: new Date().toISOString() 을 넣는다 */
const ISO_MINE  = { id:'b', updatedAt:'2026-08-15T01:00:00.000Z' };
const ISO_THEIR = { id:'b', updatedAt:'2026-08-15T02:00:00.000Z', updatedBy:'김보람' };
t('★ 글자 시각도 견준다 (전에는 무조건 안 겹침이었다)', !!P.check(ISO_THEIR, ISO_MINE, {}), true);
t('★ 누가 고쳤는지도 나온다', P.check(ISO_THEIR, ISO_MINE, {}).who, '김보람');
t('글자 시각이 더 이르면 안 겹친다', P.check(ISO_MINE, ISO_THEIR, {}), null);
t('같은 시각이면 안 겹친다', P.check(ISO_MINE, { id:'b', updatedAt:'2026-08-15T01:00:00.000Z' }, {}), null);

console.log('\n[③ 숫자와 글자가 섞여 있어도 견줄 수 있다]');
/* 같은 표에 옛 자료(글자)와 새 자료(숫자)가 섞이는 일이 실제로 있다 */
const msOf = s => Date.parse(s);
t('★ 저장된 것은 숫자, 내가 읽은 것은 글자',
  !!P.check({ id:'c', updatedAt: msOf('2026-08-15T02:00:00Z'), updatedBy:'김보람' },
            { id:'c', updatedAt:'2026-08-15T01:00:00Z' }, {}), true);
t('★ 그 반대도',
  !!P.check({ id:'c', updatedAt:'2026-08-15T02:00:00Z', updatedBy:'김보람' },
            { id:'c', updatedAt: msOf('2026-08-15T01:00:00Z') }, {}), true);

console.log('\n[④ 모르는 시각은 지어내지 않는다 — 헛경고가 잦으면 진짜 경고도 무시된다]');
t('시각이 아예 없으면 판단하지 않는다', P.check({ id:'d' }, { id:'d' }, {}), null);
t('말이 안 되는 글자는 시각으로 안 친다', P.check({ id:'d', updatedAt:'어제쯤' }, { id:'d', updatedAt:'그제' }, {}), null);
/* ★ 한쪽만 엉터리일 때가 진짜 함정이다 — 엉터리에 아무 숫자나 주면
   「저장된 것이 더 새것」으로 보여 멀쩡한 저장마다 경고가 뜬다. */
t('★ 저장된 것만 시각을 알고 내가 읽은 판은 엉터리면 판단하지 않는다',
  P.check({ id:'d', updatedAt:'2026-08-15T02:00:00Z', updatedBy:'김보람' }, { id:'d', updatedAt:'어제쯤' }, {}), null);
t('★ 그 반대도', P.check({ id:'d', updatedAt:'엊그제' }, { id:'d', updatedAt:'2026-08-15T01:00:00Z' }, {}), null);
t('빈 글자도 마찬가지', P.check({ id:'d', updatedAt:'' }, { id:'d', updatedAt:'' }, {}), null);
t('한쪽만 시각이 있으면 판단하지 않는다', P.check({ id:'d', updatedAt:2000 }, { id:'d' }, {}), null);

console.log('\n[⑤ 통째 저장(dbSet)에 그물이 걸려 있다]');
const DBSET = src.slice(src.indexOf('function dbSet(k, v){'), src.indexOf('// ── 성과%(mgr_rates) 구조 복구'));
t('구역을 잘라냈다', DBSET.length > 2000, true);
t('★ 목록끼리 견줄 때만 본다 (설정·낱값에는 안 건다)',
  /if\(Array\.isArray\(v\) && Array\.isArray\(prev\) && typeof _conflictFind === 'function'\)\{/.test(DBSET), true);
t('저장돼 있던 것을 id 로 찾는다', /prev\.forEach\(function\(x\)\{ if\(x && x\.id\) _cPrev\[x\.id\] = x; \}\);/.test(DBSET), true);
t('겹친 것을 모은다', /var _ch = _conflictFind\(k, it, _cPrev\[it\.id\]\);/.test(DBSET), true);
/* ★ 열 건이 겹쳤다고 열 번 띄우면 아무도 안 읽는다 — 한 번만, 몇 건인지 붙여서 */
t('★ 여러 건이 겹쳐도 알림은 한 번만', /if\(_cHits\.length\) _conflictTell\(k, _cHits\[0\], _cHits\.length\);/.test(DBSET), true);
t('★ 새로 들어온 건은 견줄 상대가 없다 (헛경고 안 뜬다)', /if\(!it \|\| !it\.id \|\| !_cPrev\[it\.id\]\) return;/.test(DBSET), true);
/* ★ 그물이 넘어져 저장 자체가 막히면 본말전도다 */
t('★ 그물이 넘어져도 저장은 계속된다', /\} catch\(e\)\{ window\._erpErrLog && window\._erpErrLog\(e\); \}\r?\n  \}\r?\n\r?\n  try \{ localStorage\.setItem\(KEY\+k, newJson\);/.test(src + '\n'), true);
/* ★ 시각을 찍기 전에 봐야 한다 — 찍은 뒤에는 「내가 읽어온 판」을 알 수 없다 */
t('★ 저장하기 전에 본다', DBSET.indexOf('_conflictTell(k, _cHits[0]') < DBSET.indexOf('localStorage.setItem(KEY+k, newJson)'), true);

console.log('\n[⑥ 세 길에 모두 그물이 있다]');
t('한 건 저장', /if\(_prevRec\) _conflictNet\(k, item, _prevRec\);/.test(src), true);
t('일괄 저장', /if\(hits\.length\) _conflictTell\(k, hits\[0\], hits\.length\);/.test(src), true);
t('통째 저장', /if\(_cHits\.length\) _conflictTell\(k, _cHits\[0\], _cHits\.length\);/.test(src), true);

console.log('\n[⑦ 퇴직정산도 저장 전에 물어본다]');
const SETTLE = src.slice(src.indexOf('async function saveSettle(s){'), src.indexOf('async function saveSettle(s){') + 1400);
t('★ 물어본 뒤에 저장한다', /if\(!\(await erpGuardEdit\('retirement_settlements', nextItem, settleModal\)\)\) return;\n        dbUpsert\('retirement_settlements', nextItem\);/.test(SETTLE), true);
t('원본을 함께 넘겨 「그분이 고친 칸」을 말한다', /erpGuardEdit\('retirement_settlements', nextItem, settleModal\)/.test(SETTLE), true);
t('그만두면 저장하지 않는다', /\)\) return;/.test(SETTLE), true);

console.log('\n[⑧ 판단 층을 고쳤으니 부르는 쪽 번호도 올렸다]');
/* .js 를 고치고 ?v= 를 안 올리면 쓰던 사람 화면에는 옛 파일이 그대로 남는다 */
/* ⚠ 번호를 «2» 라고 박아 두면 다음에 3 으로 올릴 때 이 검사가 깨진다.
   지킬 것은 「번호가 붙어 있는가」이지 「몇 번인가」가 아니다. */
t('★ 캐시 번호가 붙어 있다', /<script src="js\/pu-conflict\.js\?v=\d+"><\/script>/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
