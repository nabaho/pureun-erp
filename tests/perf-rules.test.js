/* 붙여넣을 규칙 파일 점검 — perf_confirm 추가본 */
const fs = require('fs');
const path = require('path');
// 인자를 안 주면 저장소의 대상 파일을 본다 (node tests/perf-rules.test.js 로 바로 실행)
const TARGET = process.argv[2] || path.join(__dirname, '..', 'docs/firebase-rules-전체-적용본.json');
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
  /* 2026-09-06 정부컨설팅 「이어는 두되 일정관리에서 진행할지는 따로」 스위치(대표 지시).
     다른 scal_* 과 같은 권한 — 직원은 읽고 쓰고, 지우기는 관리자만. */
  'scal_erpTypeRun',
  'puphotos',    /* 2026-08-02 사진첩 B단계 */
  /* 2026-09-05 공인노무사회에서 받아 둔 자료. 서버(ilaborPull)가 관리자 SDK 로
     담기만 하던 자리라 규칙이 아예 없었고, 뉴스레터 화면이 읽으려 하자
     「permission_denied at /ilabor/items」 로 막혔다 — 받아 놓고 아무도 못 봤다.
     읽기만 열고 쓰기는 서버만 한다(.write:false). */
  'ilabor',
  /* 2026-09-08 판독을 몇 번 불렀나 — 앱별 셈(대표 물음 「판독 한도 어떻게 해결할까」).
     세는 곳이 «아예 없어» 「사진첩이 다 썼나 경력관리가 다 썼나」를 알 수 없었다.
     담기는 것은 «숫자뿐»이라 읽기는 재직 직원 전체, 쓰기는 아무도 못 한다(.write:false) —
     서버만 관리자 SDK 로 적는다. */
  'ai_read_tally',
  /* 2026-08-07 건의함을 「전 직원 공개(data/suggestions)」에서 대표만 보는 비공개 자리로
     옮겼다. 옮기고 이 줄을 안 적어서 배포가 두 번 실패했다(06:24·06:52) —
     최상위를 늘렸으면 반드시 여기에 적을 것. */
  'suggestions_private','suggestions_meta_private','suggestions_resolved_private',
  /* 2026-08-07 푸른이알피 30분 수시 자동백업. `serverBackupsRecentIndex`(목차)만 있고
     본체가 없어 백업이 조용히 막혀 있었다. */
  'serverBackupsRecent',
  /* 2026-08-08 기업정보함 개인 폴더. 잠근 명함·사진·폴더이름을 대표 계정만 읽을 수 있는
     자리로 옮긴다. 부모(pucards_private)에는 읽기를 주지 않는다 — 주면 누가 개인
     폴더를 갖고 있는지 목록이 드러난다. 사람별 분리는 puphotos 와 같은 방식. */
  'pucards_private',
  /* 2026-09-04 파생 관계망(온톨로지 6단계 ㉡). 확정 관계만 담는 «사본»이라
     지워져도 자료를 잃지 않는다 — 원본에서 다시 만든다.
     ⚠ 최상위인 까닭: 칸(personal·financial)을 권한으로 갈라야 하는데,
       data 아래에 두면 그 자리의 넓은 규칙에 먼저 걸린다. */
  'ontology',
  /* 2026-08-15 급여데이터함. 사람별 자리(paydata/u/$owner)에 담고, 휴가 대리인은
     기간(deputy/…/to >= now)이 살아 있는 동안만 주인 자료를 만진다. */
  'paydata',
  /* 2026-08-15 건의 폰 알림(웹푸시). 기기 토큰을 본인 자리에만 담는다 —
     남의 토큰을 읽으면 그 사람 폰으로 알림을 밀어넣을 수 있다. */
  'fcm_tokens',
  /* 2026-08-29 — 겨냥을 «적용본»으로 옮기며 함께 적었다. 옛 스냅숏에는
     아예 없던 칸들이라 「모르는 게 생겼다」로 잡혔다. 일부러 넣은 것이 맞다:
     billing(요금) · backup_key(백업열쇠) · homepage · mailbox · pu_mailseen(메일 읽음)
     · scal_*(일정관리) · exportLog·exportSeen(반출 기록). */
  'billing','backup_key','homepage','mailbox','pu_mailseen','scal_erpConsHold','scal_serverBackups','scal_serverBackupsIndex','exportLog','exportSeen',
  /* 2026-08-29 사진 변경 이력을 «이 PC 안»에서 «모두가 보는 공용 자리»로 옮겼다.
     답해야 할 때 그 사람 PC 에만 있는 기록은 없는 것과 같다. 회차 이력과 같은 모양 —
     남기는 것은 직원 누구나, 지우는 것은 총괄관리자만. */
  'scal_photoLog',
  /* 2026-09-02 경력관리 «직원 공개용 사본» — 대표가 경력관리 세 통(위촉장·자격·학력)만
     골라 올린 것. 읽기는 재직 직원 전원, 쓰기는 관리자(대표)만.
     ⚠ 대표 칸(kcareer/{uid})을 여는 대신 사본을 둔 까닭: 그 칸에는 실적·비용·개인정보·
       신분증이 함께 들어 있어 통째로 열면 「경력관리만」 보여 줄 수가 없다. */
  'kcareer_pub',
  /* 2026-09-02 뉴스레터 — 주간뉴스레터의 설정·회차 초안·받는 명단.
     읽기·쓰기 모두 총괄관리자만(homepage 와 같은 잣대). 화면은 pu-news.html.
     ⚠ 직원에게 열지 말 것 — 자동으로 담을 밑감이 homepage/newsBrief 에 있어,
       열려면 홈페이지 관리의 문까지 함께 열어야 한다. */
  'newsletter',
  /* 2026-09-03 경력관리 «받은 함» — 직원이 PDF 위촉장을 올리고 대표가 들인다
     (대표 지시 「다른직원이 고치거나 지울수 없어도 pdf 위촉장을 업로드해서 등록할 수 있게」).
     직원은 자기 자리에만 «더하기»만 하고, 지우는 것은 관리자만 한다.
     ⚠ 이 줄을 안 적어 main 이 빨간불이었다(커밋 4a0172e3 이 PR 없이 올라가 CI 를 안 지났다).
       최상위를 늘렸으면 «반드시» 여기에 적을 것 — 이 검사 하나가 모든 앱 배포를 막는다. */
  'kcareer_inbox'];

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

/* ★ 게시 자체를 막는 줄이 없는가 (2026-08-07 실제 사고)
   규칙 파일에 `"_comment": "설명..."` 같은 줄을 넣었더니 **콘솔이 게시를 거부했다.**
   파이어베이스는 점(.)으로 시작하지 않는 이름을 전부 **자료 경로**로 보므로 그 값은
   반드시 객체여야 한다. 문자열을 넣으면 규칙 문법 오류다.
   대표님이 게시를 눌렀는데 조용히 안 먹혔고, 그 탓에 사진첩 담당자 칸이 안 떴다.
   ⚠ 설명은 규칙 파일이 아니라 코드 주석·STATUS 기록에 남길 것. */
const badRule = [];
(function walk(o, path) {
  for (const k in o) {
    const v = o[k];
    const q = path ? path + '/' + k : k;
    if (k[0] === '.') continue;                       // .read/.write/.validate/.indexOn
    if (v === null || typeof v !== 'object' || Array.isArray(v)) { badRule.push(q); continue; }
    walk(v, q);
  }
})(R, '');
ok('★ 게시를 막는 줄이 없다 (설명글은 규칙에 못 넣는다)', badRule.length === 0,
   badRule.join(', ') + ' — 점(.)으로 시작하지 않는 이름의 값은 반드시 객체여야 합니다');

console.log('       최상위 ' + keys.length + '개 · data 아래 ' + Object.keys(R.data).length + '개');
console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
