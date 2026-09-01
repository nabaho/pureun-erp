/* 올린 자료를 «묶음마다 따로» — A와 B가 서로의 자료를 함께 본다
   (2026-08-10 대표 요청) "A가 특정 엑셀을 넣고 B가 다른 기간 자료를 넣으면 각각 저장돼
   추후 모든 데이터를 동시에 볼 수 있나. A가 삭제하면 삭제되게."
   전에는 올린 자료가 bank_ledger_draft 하나에 뭉쳐 «그 PC 안에만» 남아 서로 못 봤다.
   ★ 묶음마다 서버에 따로 싣는다 — 한 덩어리로 저장하면 동시에 올릴 때 나중 사람이
     앞사람 것을 지운다. */
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
vm.runInContext(grab('var LEDGER_BATCH_KEY =', 'if(typeof window !== \'undefined\'){\n  window.erpMakeBatch'), ctx);

const r = (d, a, m) => ({ _k:d + '|' + a, type:'income', src:'bank', date:d, amount:a, memo:m || '' });

console.log('\n[① 올린 파일 하나 = 묶음 하나]');
const bA = ctx.erpMakeBatch([r('2026-04-10', 100), r('2026-06-30', 200)],
  { by:'P-001', byName:'권형하', fileName:'하나은행_4~6월.xls', src:'bank' });
t('줄 수를 적는다', bA.n, 2);
t('누가 올렸는지 적는다', [bA.by, bA.byName], ['P-001', '권형하']);
t('★ 담긴 기간을 적는다 (목록에서 어느 달 자료인지 바로 본다)', [bA.from, bA.to], ['2026-04-10', '2026-06-30']);
t('묶음 번호가 생긴다', /^lb-/.test(bA.id), true);
t('날짜 없는 줄은 안 담는다 (달로 나눌 수도, 겹침을 가릴 수도 없다)',
  ctx.erpMakeBatch([r('', 100), r('2026-04-10', 200)], {}).n, 1);
t('담을 줄이 없으면 묶음을 안 만든다', ctx.erpMakeBatch([], {}), null);
t('빈 값도 안 터진다', ctx.erpMakeBatch(null, null), null);

console.log('\n[② 여러 묶음을 한 목록으로 — 먼저 올린 것이 앞]');
const bB = ctx.erpMakeBatch([r('2026-07-05', 300)],
  { by:'A-003', byName:'김보람', fileName:'하나은행_7월.xls', at:'2026-08-10T09:00:00Z' });
bA.at = '2026-08-09T09:00:00Z';
const all = ctx.erpBatchRows([bB, bA]);          // 일부러 뒤집어 넣는다
t('★ 두 사람 것이 모두 나온다 (이것이 대표가 원한 것)', all.length, 3);
t('먼저 올린 묶음이 앞에 온다 (겹치면 앞엣것이 이긴다)',
  all.map(function(x){ return x.date; }), ['2026-04-10', '2026-06-30', '2026-07-05']);
t('★ 줄마다 어느 묶음에서 왔는지 적힌다 (지울 때 이것을 본다)', all[2]._b, bB.id);
t('원본 묶음은 안 건드린다', bA.rows[0]._b, undefined);
t('빈 목록도 안 터진다', ctx.erpBatchRows(null), []);

console.log('\n[③ 지우기 — 올린 사람 + 관리자 (대표 선택)]');
t('★ 올린 본인은 지운다', ctx.erpCanDropBatch(bA, { sid:'P-001' }), true);
t('★ 남은 못 지운다', ctx.erpCanDropBatch(bA, { sid:'A-003' }), false);
t('관리자는 남의 것도 지운다 (올린 사람이 휴가·퇴사면 영영 못 지운다)',
  ctx.erpCanDropBatch(bA, { sid:'A-003', role:'admin' }), true);
t('관리자대행도 지운다', ctx.erpCanDropBatch(bA, { sid:'A-003', role:'admin-delegate' }), true);
t('isAdmin 표시로도 지운다', ctx.erpCanDropBatch(bA, { sid:'A-003', isAdmin:true }), true);
t('사번이 없으면 못 지운다 (로그인 정보를 못 읽었을 때 남의 것을 지우면 안 된다)',
  ctx.erpCanDropBatch(bA, { sid:'' }), false);
/* ★ 올린 사람이 안 적힌 옛 묶음 + 사번을 못 읽은 사람 = «둘 다 빈 값».
   빈 값끼리 같다고 보면 아무나 지우게 된다. */
t('★ 둘 다 비어 있으면 못 지운다', ctx.erpCanDropBatch({ id:'x', by:'' }, { sid:'' }), false);
t('묶음이 없으면 false', ctx.erpCanDropBatch(null, { role:'admin' }), false);
t('로그인 정보가 없어도 안 터진다', ctx.erpCanDropBatch(bA, null), false);

console.log('\n[④ 한도 — 넘겨도 기존 묶음을 자동삭제하지 않는다]');
/* 큰 파일 하나로 17묶음→1묶음이 된 실제 사고 뒤, 한도는 화면 처리 권장선일 뿐이다. */
function big(n, at){ var rows = []; for(var i=0;i<n;i++) rows.push(r('2026-01-' + String((i%28)+1).padStart(2,'0'), i+1, 'm'+i));
  return ctx.erpMakeBatch(rows, { at:at, by:'P-001' }); }
const t1 = ctx.erpTrimBatches([big(30,'2026-08-01'), big(30,'2026-08-02'), big(30,'2026-08-03')], 70);
t('★ 한도를 넘어도 빠진 묶음은 없다', t1.dropped.length, 0);
t('★ 묶음 셋이 모두 보존된다', t1.keep.length, 3);
t('권장선 초과 줄 수만 알려 준다', t1.overflowRows, 20);
t('한도 안이면 아무것도 안 버린다', ctx.erpTrimBatches([big(10,'2026-08-01')], 70).dropped.length, 0);
t('한 묶음이 커도 그대로 보존한다',
  ctx.erpTrimBatches([big(500,'2026-08-01')], 70).keep.length, 1);
t('빈 목록도 안 터진다', ctx.erpTrimBatches(null, 70).keep, []);

console.log('\n[⑤ 요약 — 몇 묶음·몇 줄·내 것 몇 개]');
const sm = ctx.erpBatchSummary([bA, bB], 'P-001');
t('묶음 수', sm.count, 2);
t('줄 합계', sm.rows, 3);
t('내가 올린 묶음', sm.mine, 1);
t('남이 올린 묶음', sm.others, 1);
t('로그인 정보가 없으면 전부 남의 것으로 본다', ctx.erpBatchSummary([bA, bB], '').mine, 0);

console.log('\n[⑥ 서버에 «묶음마다 따로» 실린다 — 이것이 이 기능의 뼈대]');
/* 한 덩어리로 저장하면 A와 B가 동시에 올릴 때 나중 사람이 앞사람 묶음을 지운다 */
t('★ 건별 저장 목록(DIFF_KEYS)에 들어 있다', /'employment_contracts','ledger_batches'\]/.test(src), true);
t('★ 실시간 수신도 묶음별이다 (통째 17→1 급감 모달 경로로 가지 않는다)',
  /'leave_grants', 'leave_of_absence', 'closed_archive', 'ledger_batches'/.test(src), true);
t('★ 올릴 때 묶음 하나만 고쳐 쓴다 (통째로 덮어쓰지 않는다)',
  /dbUpsert\(LEDGER_BATCH_KEY, _bat\);/.test(src), true);
t('지울 때도 그 묶음만', /dbRemoveMany\(LEDGER_BATCH_KEY, \[b\.id\]\)/.test(src), true);
t('★ 용량 초과를 이유로 기존 묶음을 자동삭제하지 않는다',
  /dbRemoveMany\(LEDGER_BATCH_KEY, _tr\.dropped/.test(src), false);
t('다른 PC 도 받아 볼 수 있게 동기화 목록에 있다',
  /'ledger_batches','ledger_held','ledger_split_recipes'/.test(src), true);
t('★ 백업 스냅샷에는 안 담는다 (16MB 한도를 넘겨 백업이 통째로 실패했던 그 원인)',
  /bank_ledger_draft:1, ledger_batches:1, co_merge_log:1/.test(src), true);
t('서버 동기화에서 빠지지는 않았다 (빠지면 여전히 이 PC 에만 남는다)',
  /FB_EXCLUDE = \[[^\]]*'ledger_batches'/.test(src), false);

console.log('\n[⑦ 화면 — 줄의 정본이 묶음으로 옮겨졌다]');
t('묶음에서 줄을 만든다', /function _rowsOfBatches\(bs, hidden\)\{/.test(src), true);
t('겹치는 줄은 한 번만 (먼저 올린 쪽)', /erpBankMergeDraft\(erpBatchRows\(bs\), \[\]\)/.test(src), true);
t('이미 확정한 줄에는 「이미 처리」 표시', /if\(pk && pst\[pk\]\) row\._dup = true;/.test(src), true);
t('★ 초안에는 줄을 안 담는다 (정본이 둘이면 어느 쪽이 맞는지 알 수 없다)',
  /colMap:\(rows\.colMap\)\|\|\{\}, rows:\[\],/.test(src), true);
t('초안에 남는 것은 이 기기의 작업 상태뿐', /hidden:hidRow\|\|\{\},/.test(src), true);

console.log('\n[⑧ ✕ 로 치운 줄 — 이 기기에서만]');
/* 줄의 정본이 서버라, 화면에서만 빼면 새로고침에 되살아난다.
   그렇다고 남의 화면까지 지울 수는 없다 — 그래서 이 기기에 적어 둔다. */
t('치운 줄을 적어 둔다', /setHidRow\(function\(h\)\{ var n = Object\.assign\(\{\}, h \|\| \{\}\); n\[key\] = 1; return n; \}\);/.test(src), true);
t('★ 되돌리면 도로 푼다 (안 풀면 새로고침에 다시 사라진다)',
  /delete n\[lastAct\.row\._k\]; return n; \}\);/.test(src), true);
t('한 달 비우기도 이 기기에서만', /if\(gone\(r\)\) hide2\[r\._k\] = 1;/.test(src), true);
t('한 달 비우기가 그렇다고 말한다', /«내 화면에서» 치웁니다/.test(src), true);

console.log('\n[⑨ 옛 자료를 잃지 않는다]');
/* 지금 대표 PC 에 505줄이 떠 있다 — 안 옮기면 사라진 것처럼 보인다 */
t('★ 이 기기에 있던 옛 임시분을 내 묶음으로 옮긴다',
  /var _mb = erpMakeBatch\(d\.rows, \{ by:_me0\.sid/.test(src), true);
t('★ 옮긴 묶음을 서버에도 올린다 (안 올리면 이 PC 를 떠나는 순간 사라진다)',
  /if\(_mb\)\{ bs = bs\.concat\(\[_mb\]\); dbUpsert\(LEDGER_BATCH_KEY, _mb\); \}/.test(src), true);
t('한 번만 옮긴다', /localStorage\.setItem\(MIG, '1'\)/.test(src), true);
t('옮긴 표시는 이 기기에만 (서버로 안 간다)', /var MIG = KEY \+ 'ledger_batch_migrated';/.test(src), true);

console.log('\n[⑩ 화면에서 관리한다]');
t('도구줄에 묶음 수·줄 수가 뜬다', /'📂 올린 자료 '\+_bsum\.count\+'묶음 · '/.test(src), true);
t('남이 올린 것이 몇 개인지도', /\(남이 '\+_bsum\.others\+'\)/.test(src), true);
t('묶음 창을 연다', /batOpen && \(function\(\)\{/.test(src), true);
t('못 지우는 묶음은 그렇다고 적는다', /'올린 사람만'/.test(src), true);
t('지울 때 무엇이 사라지는지 알린다', /→ 모든 사람의 화면에서 사라집니다/.test(src), true);
t('확정한 기록은 그대로임을 알린다', /→ 이미 확정·등록한 입금\/출금은 그대로 유지됩니다/.test(src), true);
/* 글자만 보면 「지울 것」 계산을 바꿔치기해도 통과한다 — 가르는 식 자체를 못 박는다 */
t('★ 「비우기」는 지울 수 있는 것과 아닌 것을 갈라 본다',
  /var mine = bs\.filter\(function\(b\)\{ return erpCanDropBatch\(b, me\); \}\);\s*\n\s*var kept = bs\.filter\(function\(b\)\{ return !erpCanDropBatch\(b, me\); \}\);/.test(src), true);
t('「비우기」는 남의 묶음을 말없이 지우지 않는다',
  /남이 올린 묶음 ' \+ kept\.length \+ '개는 내 화면에서만 감춥니다/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
