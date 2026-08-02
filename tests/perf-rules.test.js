/* 붙여넣을 규칙 파일 점검 — perf_confirm 추가본 */
const fs = require('fs');
const path = require('path');
// 인자를 안 주면 저장소의 대상 파일을 본다 (node tests/perf-rules.test.js 로 바로 실행)
const TARGET = process.argv[2] || path.join(__dirname, '..', 'docs/firebase-rules-현재적용본.json');
const t = fs.readFileSync(TARGET, 'utf8');
let j;
try { j = JSON.parse(t); } catch (e) { console.log('  FAIL JSON 문법 — ' + e.message); process.exit(1); }

let pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (e ? ' — ' + e : '')); } }

ok('JSON 문법이 맞다', true);
const R = j.rules;
ok('최상위가 rules 하나', Object.keys(j).length === 1 && !!R);

const pc = R.data && R.data.perf_confirm;
ok('perf_confirm 이 data 아래 있다', !!pc);
/* 총괄 관리자(admin)와 관리자대행(admin-delegate) 만 = uid_roles.isAdmin.
   fin(재무 메뉴 권한)으로 열어 두면 재무 담당자도 전 직원 성과급을 보게 된다. */
ok('★ 전체 보기·발행은 총괄·대행만 (isAdmin)',
   /uid_roles.*isAdmin/.test(pc['.read'] || '') && /uid_roles.*isAdmin/.test(pc['.write'] || ''),
   pc['.read']);
ok('★ perf_confirm 안에 fin 은 하나도 없다',
   JSON.stringify(pc).indexOf("child('fin')") < 0);
ok('바깥 재무 노드는 그대로 fin 이다',
   /child\('fin'\)/.test(JSON.stringify(R.data.finance_income)));

const sid = pc['$ym'] && pc['$ym'].p && pc['$ym'].p['$sid'];
ok('사람별 칸이 있다', !!sid);
ok('본인만 자기 것을 읽는다',
   (sid['.read'] || '').indexOf("data.child('uid').val() === auth.uid") >= 0, sid['.read']);
ok('사람별 칸에 통짜 쓰기 권한은 없다', sid['.write'] === undefined,
   '통짜 .write 가 있으면 금액까지 고칠 수 있다');

const writable = Object.keys(sid).filter(function (k) { return k[0] !== '.'; }).sort();
console.log('       본인이 손댈 수 있는 것: ' + writable.join(', '));
ok('손댈 수 있는 건 확인 관련뿐',
   JSON.stringify(writable) === JSON.stringify(['deviceHint', 'done', 'doneAt', 'doneBy', 'items', 'objection']),
   writable.join(','));

const s = JSON.stringify(sid);
ok('금액·이름·건수에는 쓰기 규칙이 없다',
   s.indexOf('"amount"') < 0 && s.indexOf('"total"') < 0 && s.indexOf('"name"') < 0);

const it = sid.items['$fid'];
ok('항목 체크는 참/거짓만 들어간다', (it.ok['.validate'] || '').indexOf('isBoolean') >= 0);
ok('항목 체크도 본인 uid 대조', (it.ok['.write'] || '').indexOf('auth.uid') >= 0);
ok('완료 표시는 참/거짓만', (sid.done['.validate'] || '').indexOf('isBoolean') >= 0);
ok('완료는 대표도 풀 수 있다', (sid.done['.write'] || '').indexOf('isAdmin') >= 0, sid.done['.write']);
ok('이의 사유 길이 제한이 있다',
   ((sid.objection.text || {})['.validate'] || '').indexOf('length <= 500') >= 0);

/* 남의 것을 통째로 훑을 수 없어야 한다 */
ok('사람 묶음 전체를 훑는 읽기 권한은 없다', pc['$ym'].p['.read'] === undefined);
ok('월 묶음 전체를 훑는 읽기 권한은 없다', pc['$ym']['.read'] === undefined);

/* 기존 규칙이 안 망가졌는지 — 지난번 적용본 기준.
   목록을 둘로 나눈다. 안 나누면 브랜치마다 결과가 달라진다
   (아직 그 기능이 병합 안 된 브랜치에서는 새 노드가 없는 게 정상이다) */

/* ① 반드시 있어야 하는 것 — 하나라도 빠지면 규칙을 잘못 덮어쓴 것이다 */
const baseTop = ['uid_roles','sid_roles','data','payroll_os','fund_erp','work_erp','ieum_public',
  'scal_staff','scal_types','scal_cos','scal_scheds','scal_env','scal_fieldState','scal_conflictMatrix',
  'scal_roundlog','scal_erpTypeMap','companies','pucards','improve_requests','presence','activeWriter',
  'appBuild','serverBackups','serverBackupsIndex','serverBackupsRecentIndex','kcareer','esign',
  'rules_mgmt','chwieop'];

/* ② 있어도 되는 것 — 다른 작업에서 일부러 늘린 노드.
   ★ 최상위를 일부러 늘렸다면 여기에 적어라. 적지 않으면 아래 검사가 막는다
     (실수로 늘어난 것을 잡는 덫이라 자동으로 넘기지 않는다) */
const allowTop = ['systemAlerts','systemBackups','systemBackupsIndex','systemRestoreLog',
  'puphotos'];   /* 2026-08-02 사진첩 B단계 */

const keys = Object.keys(R);
const removed = baseTop.filter(function (k) { return keys.indexOf(k) < 0; });
const added = keys.filter(function (k) {
  return baseTop.indexOf(k) < 0 && allowTop.indexOf(k) < 0;
});
ok('기존 최상위 항목이 하나도 안 빠졌다', removed.length === 0, '빠진 것: ' + removed.join(','));
ok('최상위에 모르는 게 생기지 않았다 (perf_confirm 은 data 아래)', added.length === 0,
   '늘어난 것: ' + added.join(',') + ' — 일부러 넣었다면 이 파일 allowTop 에 적어라');
/* 성과급은 반드시 data 아래여야 한다 — 최상위로 올라가면 전원이 읽게 된다 */
ok('perf_confirm 이 최상위에 없다', keys.indexOf('perf_confirm') < 0);
ok('perf_confirm 이 data 아래에 있다', !!(R.data && R.data.perf_confirm));

const mustData = ['finance_income','finance_expense','payroll_monthly','payroll_irregular','user_accounts','user_dir'];
const missD = mustData.filter(function (k) { return !(k in R.data); });
ok('data 아래 기존 항목이 그대로 있다', missD.length === 0, '빠진 것: ' + missD.join(','));
ok('esign·rules_mgmt 구조 보존', !!(R.esign && R.esign.cases && R.rules_mgmt && R.rules_mgmt.done));

console.log('       최상위 ' + keys.length + '개 · data 아래 ' + Object.keys(R.data).length + '개');
console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
