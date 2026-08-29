#!/usr/bin/env node
/* 실시간DB 보안규칙을 «만들어» 낸다 (대표 지시 2026-08-29 「니가 전체 다시 만들어달라」)
   ═══════════════════════════════════════════════════════════════════════════
   ★ 왜 손으로 안 쓰고 만들어 내나
     같은 조건식이 **백 번 넘게** 되풀이된다. 손으로 쓰면 한 곳이 조용히 어긋나고,
     어긋난 한 곳이 곧 구멍이다. 여기서는 이름 붙인 조각(LOGIN·ADMIN·FIN…)을
     한 번만 정하고 갖다 쓴다 — 어긋날 수가 없다.

   ⚠ `== true` 를 `=== true` 로 «고치지 않았다».
     혹시 uid_roles 에 1 같은 값이 들어 있으면 === 로 바꾸는 순간 그 사람이
     관리자에서 떨어진다. 잠금 규칙을 손보면서 사람을 잠가 버리는 것이 가장 나쁘다.

   ⚠ RTDB 규칙의 두 성질을 늘 기억한다 —
     ① 읽기·쓰기는 **위에서 아래로 흐른다**. 위에서 허용하면 아래에서 못 막는다.
     ② 이름 붙은 칸이 `$변수` 보다 «먼저» 잡힌다.

   쓰는 법:  node scripts/make-firebase-rules.js > docs/firebase-rules-전체-적용본.json */
'use strict';

/* ── 되풀이되는 조건에 이름을 붙인다 ───────────────────────────────────── */
const LOGIN = "auth != null && (auth.token.firebase.sign_in_provider === 'password' || auth.token.passkey === true)";
const ADMIN = "root.child('uid_roles').child(auth.uid).child('isAdmin').val() == true";
const SUB   = "root.child('uid_roles').child(auth.uid).child('isSubAdmin').val() == true";
const MGR   = `auth != null && (${ADMIN} || ${SUB})`;      // 관리자 또는 위임관리인
const FIN   = "root.child('uid_roles').child(auth.uid).child('fin').val() == true";
const MAIL  = "auth != null && auth.token.email != null";

/* 「업무 칸」 한 벌 — 읽기는 전 직원, 새로 만들고 고치는 것도 전 직원,
   그러나 **지우는 것은 관리자만**. 실수로 통째 지우는 것을 막는 얼개다
   (newData.exists() 가 거짓이면 지우는 것이다). */
function workspace(extra) {
  return Object.assign({
    '.read': LOGIN,
    '.write': `${ADMIN}`,
    $k: {
      '.write': `(${LOGIN}) && (newData.exists() || ${ADMIN})`,
      $k2: { '.write': LOGIN }
    }
  }, extra || {});
}

/* 재무 칸 — 재무 권한을 가진 사람만 */
const finOnly = { '.read': FIN, '.write': FIN };

const rules = {};

/* ══ 요금 ══════════════════════════════════════════════════════════════
   금액은 서버(구글 예산 알림 → 함수)가 적는다. 화면은 읽기만 한다.
   ⚠ 다만 «눈금(limit)» 은 대표가 정하는 값이라 관리자 쓰기를 연다 —
     전에는 통째로 .write:false 라 아무도 못 정했다(화면에 그런 기능이 있는데도). */
rules.billing = {
  '.read': `auth != null && ${ADMIN}`,
  '.write': false,
  limit: { '.write': `auth != null && ${ADMIN}`, '.validate': 'newData.isNumber() && newData.val() >= 0' }
};

/* ══ 역할표 ════════════════════════════════════════════════════════════
   ⚠ 자기 역할을 스스로 올리지 못하게 한다 — 관리자가 아니면 false 로 내리거나
     있던 값을 그대로 두는 것만 된다(.validate). */
const roleGuard = {
  '.validate': `${ADMIN} || newData.val() === false || (data.exists() && newData.val() === data.val())`
};
rules.uid_roles = {
  '.read': LOGIN,
  $uid: {
    '.write': `(${LOGIN}) && (auth.uid == $uid || ${ADMIN})`,
    fin: roleGuard, isAdmin: roleGuard, isSubAdmin: roleGuard
  }
};
rules.sid_roles = { '.read': LOGIN, '.write': ADMIN };

/* ══ 업무 자료(data) ═══════════════════════════════════════════════════
   ⚠ data 자체의 .read 는 «재무» 다. 그래서 부팅 때 쓰는 REST 얇은 목록
     (GET /data.json?shallow=true)은 재무 권한자만 된다 — 나머지는 코드가
     굳은 명단으로 되돌아간다(pu-erp.html _fbFallbackPlan, 2026-08-29).
   ⚠ 여기 .read 를 전 직원으로 열면 «아래로 흘러» 재무 자료까지 다 열린다. 열지 말 것. */
const perfWriter = (extra) =>
  `root.child('data').child('perf_confirm').child($ym).child('p').child($sid).child('uid').val() === auth.uid${extra || ''}`;

rules.data = {
  '.read': FIN,

  perf_confirm: {
    '.read': ADMIN, '.write': ADMIN,
    $ym: { p: { $sid: {
      '.read': `data.child('uid').val() === auth.uid || ${ADMIN}`,
      items: { $fid: {
        ok:   { '.write': perfWriter(), '.validate': 'newData.isBoolean()' },
        okAt: { '.write': perfWriter(), '.validate': 'newData.isString() && newData.val().length <= 40' },
        okBy: { '.write': perfWriter(), '.validate': 'newData.isString() && newData.val().length <= 40' }
      } },
      done:   { '.write': perfWriter(` || ${ADMIN}`), '.validate': 'newData.isBoolean()' },
      doneAt: { '.write': perfWriter(` || ${ADMIN}`), '.validate': 'newData.isString() && newData.val().length <= 40' },
      doneBy: { '.write': perfWriter(` || ${ADMIN}`), '.validate': 'newData.isString() && newData.val().length <= 40' },
      deviceHint: { '.write': perfWriter(), '.validate': 'newData.isString() && newData.val().length <= 80' },
      objection:  { '.write': perfWriter(), text: { '.validate': 'newData.isString() && newData.val().length <= 500' } }
    } } }
  },

  /* 재무 — 돈과 급여. 재무 권한자만. */
  finance_income: finOnly, finance_expense: finOnly, finance_invoice: finOnly,
  payroll_monthly: finOnly, payroll_irregular: finOnly, funds: finOnly,
  mgr_rates: finOnly, pay_items: finOnly, dc_contributions: finOnly,
  retirement_settlements: finOnly, recurring_expenses: finOnly,
  expense_budget: finOnly, finance_bank_fee: finOnly, user_accounts: finOnly,

  /* 직원 명부 — 모두 보고, 관리자·위임관리인만 고친다 */
  user_dir: { '.read': LOGIN, '.write': `${ADMIN} || ${SUB}` },

  /* 그 밖의 업무 칸 — 이름이 안 붙은 것은 전부 여기로 온다.
     ⚠ 이름 붙은 칸이 «먼저» 잡히므로 위의 재무 칸들은 여기에 안 걸린다. */
  /* ══ 여기부터 — 이름 없이 열려 있던 자리들 (2026-08-29 대표 보고) ══
     지금까지 이 열한 자리는 이름이 없어 아래 $other 로 떨어졌다.
     $other 는 「깜빡 잊은 자리」와 「일부러 연 자리」를 똑같이 대접한다 —
     그래서 무엇이 열려 있는지 아무도 셀 수 없었다.
     ★ 권한은 «지금 그대로»다. 이름만 적는다 — 동작은 한 톨도 안 바뀐다.
       좁힐지는 대표 판단이다(무엇이 들었는지는 PR 에 적었다). */

  /* 여러 앱이 함께 쓰는 업무 자료 — 푸른이알피·사진첩·급여데이터함이 모두 읽고 쓴다 */
  companies:      { '.read': LOGIN, '.write': LOGIN },   /* 거래처 원장 */
  contracts:      { '.read': LOGIN, '.write': LOGIN },   /* 계약 기록 */
  consultings:    { '.read': LOGIN, '.write': LOGIN },   /* 컨설팅 사업(금액 포함) */
  presence_hours: { '.read': LOGIN, '.write': LOGIN },   /* 근무 시간 */

  /* 포털 — 앱 공용 설정과 개인 타일 순서 */
  app_config:       { '.read': LOGIN, '.write': LOGIN }, /* 포털 공용 설정(FCM 키 등) */
  portal_prefs:     { '.read': LOGIN, '.write': LOGIN }, /* 옛 타일 순서 */
  portal_prefs_uid: { '.read': LOGIN, '.write': LOGIN }, /* 지금 타일 순서 */

  /* 옛 건의 자리 — 관리자가 포털에 들어오면 suggestions_private 로 옮기고 여기를 «지운다»
     (enter.html 의 sgEnsurePrivateMigration). 이사가 끝나면 이 넷은 빈 자리가 된다.
     ⚠ 그때까지는 «건의 원문»이 여기 남아 있을 수 있다 — 좁힐 첫 후보다(대표 판단). */
  suggestions:     { '.read': LOGIN, '.write': LOGIN },
  sg_meta:         { '.read': LOGIN, '.write': LOGIN },
  sg_resolved:     { '.read': LOGIN, '.write': LOGIN },
  sg_resolved_uid: { '.read': LOGIN, '.write': LOGIN },

  /* ⚠ 여기 이름이 없는 자리는 아래로 떨어져 «재직 직원 누구나» 읽고 쓴다.
     새 자리를 만들 때는 권한을 정해 위에 이름을 적을 것 —
     tests/rules-data-named.test.js 가 이름 없는 자리를 잡는다. */
  $other: { '.read': LOGIN, '.write': LOGIN }
};

/* ══ 다른 앱들 ═════════════════════════════════════════════════════════ */
rules.payroll_os = {
  '.read': `auth != null && (${FIN} || ${ADMIN})`,
  '.write': ADMIN,
  $k: {
    '.write': `(auth != null && (${FIN} || ${ADMIN})) && (newData.exists() || ${ADMIN})`,
    $k2: { '.write': `auth != null && (${FIN} || ${ADMIN})` }
  }
};
rules.fund_erp = workspace();
rules.work_erp = workspace();
rules.chwieop  = workspace();
rules.companies = workspace({ '.indexOn': ['folder', 'updatedAt'] });
rules.improve_requests = workspace({ '.indexOn': ['authorSid', 'done'] });

rules.ieum_public = { '.read': 'auth != null', '.write': LOGIN };

/* 일정관리(scal_*) — 지우기는 관리자만인 것이 업무 칸과 같다.
   ⚠ 다만 맨 위 .write 가 workspace() 와 다르다(직원도 «만들» 수 있어야 한다). */
function scal() {
  return {
    '.read': LOGIN,
    '.write': `(${LOGIN}) && (newData.exists() || ${ADMIN})`,
    $k: {
      '.write': `(${LOGIN}) && (newData.exists() || ${ADMIN})`,
      $k2: { '.write': LOGIN }
    }
  };
}
['scal_staff','scal_types','scal_cos','scal_scheds','scal_env','scal_fieldState',
 'scal_conflictMatrix','scal_roundlog','scal_erpConsHold','scal_erpTypeMap']
  .forEach(function(k){ rules[k] = scal(); });

/* ══ 백업 ══════════════════════════════════════════════════════════════
   ★ 바뀐 곳: 쓰기를 «관리자·위임관리인» 으로 좁혔다 (2026-08-29).
     전에는 전 직원이 쓸 수 있었다 — 직원 한 사람의 실수나 계정 하나가
     털리면 **백업 스무 벌을 통째로 지울 수 있었다**. 백업은 마지막 방패라
     그 방패를 아무나 부술 수 있으면 방패가 아니다.
     화면 코드는 이미 관리자·위임관리인 기기에서만 백업을 뜬다
     (serverBackupDaily·serverBackupEvening·startRecentBackupTimer) — 규칙을
     코드에 맞춘 것이지 새로 좁힌 것이 아니다. */
rules.serverBackups            = { '.read': ADMIN, '.write': MGR };
rules.serverBackupsIndex       = { '.read': LOGIN, '.write': MGR };
rules.serverBackupsRecent      = { '.read': MGR,   '.write': MGR };
rules.serverBackupsRecentIndex = { '.read': LOGIN, '.write': MGR };
rules.systemBackups            = { '.read': MGR,   '.write': MGR };
rules.systemBackupsIndex       = { '.read': MGR,   '.write': MGR };
rules.systemRestoreLog         = { '.read': MGR,   '.write': MGR };
rules.scal_serverBackups       = { '.read': ADMIN, '.write': MGR };
rules.scal_serverBackupsIndex  = { '.read': LOGIN, '.write': MGR };

/* ★ 새로 넣는 칸 — 백업 속 주민번호를 잠그는 열쇠 (2026-08-29 대표 지시)
   ⚠ 읽기는 관리자·위임관리인만. 이 칸이 열려 있으면 잠근 뜻이 없다.
   ⚠ 쓰기는 **없을 때만** 된다(`!data.exists()`). 열쇠를 갈아치우면 옛 백업
     스무 벌을 영영 못 푼다 — 그래서 「못 바꾸게」를 코드가 아니라 **서버가** 막는다.
   ⚠ 이 칸이 없으면 백업이 아예 안 떠진다(열쇠를 못 얻으면 백업을 쓰지 않게
     해 두었다). 규칙을 올리기 전까지는 백업이 멈춘다. */
rules.backup_key = {
  '.read': MGR,
  $v: {
    '.write': `(${MGR}) && !data.exists()`,
    '.validate': 'newData.isString() && newData.val().length >= 32 && newData.val().length <= 200'
  }
};

/* ══ 기업정보함·사진첩·급여데이터함 ════════════════════════════════════ */
rules.pucards = {
  '.read': MAIL, '.write': ADMIN,
  $k: { '.write': `(${MAIL}) && (newData.exists() || ${ADMIN})`, $k2: { '.write': MAIL } }
};
rules.pucards_private = { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } };

/* ══ 반출 기록 — 기업정보함에서 «밖으로 나간 것» (대표 지시 2026-08-29) ══
   설계서: docs/superpowers/specs/2026-08-29-기업정보함-반출기록-design.md

   ★ 왜 pucards «밖»인가
     규칙은 위에서 아래로 흐르고, 부모가 준 읽기를 자식이 못 뺏는다.
     pucards 는 '.read': MAIL — 로그인한 직원 누구나 읽는다. 그 아래에 기록을 두면
     「관리자만」이라고 적어도 직원이 그대로 읽는다. 그래서 맨 위 칸이다.

   ★ 왜 쓰기 문턱이 MAIL 인가 (LOGIN 이 아니라)
     pucards 읽기와 «같아야» 한다. 더 좁히면 「기업정보함은 쓰는데 기록은 못 남기는」
     사람이 생기고, 그 사람은 앱이 내려받기를 아예 거절한다.

   ★ $other 를 막았으면 일곱 칸을 «모두» 이름으로 적어야 한다
     이름 없는 칸은 $other 에 걸려 .validate:false 가 되고, 그러면 쓰기가 통째로 막힌다.
     글자 수는 pu-cards.html 의 EXPORT_MAX 와 짝이다(앱이 먼저 잘라 보낸다).

   paydata/access_log · handoff_log 와 «같은 꼴»이다 — 새 방식이 아니다. */
const expText = (n) => `newData.isString() && newData.val().length <= ${n}`;
rules.exportLog = {
  '.read': `auth != null && ${ADMIN}`,
  $id: {
    /* !data.exists() = 새로 만드는 것만. 고치기·지우기는 «아무도» 못 한다 —
       자기 기록을 지울 수 있으면 기록은 아무 뜻이 없다. */
    '.write': `(${MAIL}) && !data.exists()`,
    '.validate': "newData.hasChildren(['at','by','uid','kind','what','n'])",
    at:   { '.validate': 'newData.isNumber() && newData.val() === now' },   /* 날짜 속이기 금지 */
    uid:  { '.validate': 'newData.isString() && newData.val() === auth.uid' }, /* 남의 이름 금지 */
    n:    { '.validate': 'newData.isNumber() && newData.val() >= 0' },
    by:   { '.validate': expText(40) },
    kind: { '.validate': expText(30) },
    what: { '.validate': expText(200) },
    why:  { '.validate': expText(300) },
    /* 정해 둔 일곱 칸 말고는 아무것도 못 넣는다 — 기록 칸에 명함 내용을 쑤셔 넣어
       «두 번째 유출원»을 만들지 못하게 막는다 */
    $other: { '.validate': false }
  }
};
/* 대표가 「확인」한 시각만 담는다(알림 배지를 끄는 데만 쓴다).
   기록 자체에 「봤음」을 적으면 «기록을 고치는» 것이 되어 고칠 문을 열어 주게 된다. */
rules.exportSeen = {
  $uid: {
    '.read':  'auth != null && auth.uid === $uid',
    '.write': `auth != null && auth.uid === $uid && ${ADMIN}`,
    '.validate': 'newData.isNumber()'
  }
};

rules.puphotos = {
  owners: {
    '.read': LOGIN,
    $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': `(${LOGIN}) && auth.uid === $uid` }
  },
  u: { $uid: {
    '.read':  `(${LOGIN}) && (auth.uid === $uid || ${ADMIN})`,
    '.write': `(${LOGIN}) && (auth.uid === $uid || ${ADMIN})`,
    /* 직원끼리 나눠 본 것만 열린다 — 명단(shareWith)에 있는 사람에게만 */
    items:  { $year: { $id: { '.read': `(${LOGIN}) && data.child('shareWith').child(auth.uid).exists()` } } },
    blobs:  { $year: { $id: { '.read': `(${LOGIN}) && root.child('puphotos').child('u').child($uid).child('items').child($year).child($id).child('shareWith').child(auth.uid).exists()` } } },
    thumbs: { $year: { $id: { '.read': `(${LOGIN}) && root.child('puphotos').child('u').child($uid).child('items').child($year).child($id).child('shareWith').child(auth.uid).exists()` } } }
  } },
  customKinds: { '.read': LOGIN, '.write': LOGIN },
  kindLabels:  { '.read': LOGIN, '.write': `(${LOGIN}) && ${ADMIN}` },
  kindHidden:  { '.read': LOGIN, '.write': `(${LOGIN}) && ${ADMIN}` },
  retention:   { '.read': LOGIN, '.write': `(${LOGIN}) && (${ADMIN} || data.child('uid').val() === auth.uid)` },
  sharedTo: { $uid: {
    '.read': `(${LOGIN}) && (auth.uid === $uid || ${ADMIN})`,
    $pid: {
      '.write': `(${LOGIN}) && (${ADMIN} || (newData.exists() && newData.child('owner').val() === auth.uid) || (!newData.exists() && (data.child('owner').val() === auth.uid || auth.uid === $uid)))`,
      '.validate': "!newData.exists() || newData.hasChildren(['owner','year','at'])"
    }
  } },
  $other: { '.read': LOGIN, '.write': `(${LOGIN}) && ${ADMIN}` }
};

/* 급여데이터함 — 대리인(deputy)은 «기간 안에만» 쓴다.
   ⚠ 읽기는 지금 전 직원이다. 설계서(2026-08-13)에 「한계」로 적어 둔 그대로다 —
     좁히면 「도착 칸」·「공용 대기 칸」이 안 보일 수 있어 여기서 바꾸지 않았다.
     좁히려면 화면 흐름을 함께 손봐야 한다. */
const payWrite = (owner) => `(${LOGIN}) && ($owner === auth.uid || root.child('paydata/u/' + $owner + '/deputy/' + auth.uid + '/to').val() >= now)`;
rules.paydata = {
  u: { $owner: {
    '.read': LOGIN,
    deputy: {
      '.write': `(${LOGIN}) && $owner === auth.uid`,
      $deputy: { from: { '.validate': 'newData.isNumber()' }, to: { '.validate': 'newData.isNumber()' } }
    },
    items:   { '.write': payWrite() },
    pending: { '.write': payWrite() },
    values:  { '.write': payWrite() },
    thumbs:  { '.write': payWrite() },
    trash:   { '.write': payWrite() },
    folders: { '.write': payWrite() }
  } },
  pending_shared: { '.read': LOGIN, '.write': LOGIN },
  owners: { '.read': LOGIN, $uid: { '.write': `(${LOGIN}) && $uid === auth.uid` } },
  arrivals: { '.read': LOGIN, '.write': LOGIN },
  shares:   { '.read': LOGIN, '.write': LOGIN },
  /* 열람 기록은 «덧붙이기만» 된다 — 한 번 적힌 줄은 아무도 못 고친다(!data.exists()).
     기록을 고칠 수 있으면 기록이 아니다. */
  access_log:  { '.read': `auth != null && ${ADMIN}`, $id: { '.write': `(${LOGIN}) && !data.exists()` } },
  handoff_log: { '.read': `auth != null && ${ADMIN}`, $id: { '.write': `(${LOGIN}) && !data.exists()` } },
  maillog:  { '.read': LOGIN, '.write': false },
  mailconf: { '.read': LOGIN, '.write': ADMIN },
  mailseen: { '.read': false, '.write': false }
};

/* ══ 건의함 ════════════════════════════════════════════════════════════ */
const sugWrite = `(${LOGIN}) && (${ADMIN} || (!data.exists() && newData.child('authorUid').val() === auth.uid && newData.child('status').val() === 'new'))`;
rules.suggestions_private = {
  '.read': `(${LOGIN}) && ${ADMIN}`,
  '.indexOn': ['createdAt'],
  $id: {
    '.write': sugWrite,
    '.validate': "!newData.exists() || newData.hasChildren(['cat','title','content','author','authorEmail','authorUid','status','createdAt'])",
    cat: { '.validate': "newData.isString() && newData.val().matches(/^(erp|consult|work|fund|rules|payroll|cards|docs|portal|bizwork|policy|edu|office|hrwelf|etc)$/)" },
    title:   { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 200' },
    content: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 10000' },
    authorUid: { '.validate': `${ADMIN} || newData.val() === auth.uid` },
    status: { '.validate': "newData.isString() && newData.val().matches(/^(new|ing|done)$/)" }
  }
};
rules.suggestions_meta_private = {
  '.read': `(${LOGIN}) && ${ADMIN}`,
  $id: {
    '.write': sugWrite,
    '.validate': "!newData.exists() || newData.hasChildren(['author','authorEmail','authorUid','status','cat','title','createdAt'])",
    authorUid: { '.validate': `${ADMIN} || newData.val() === auth.uid` },
    status: { '.validate': "newData.isString() && newData.val().matches(/^(new|ing|done)$/)" }
  }
};
rules.suggestions_resolved_private = {
  $uid: {
    '.read':  `auth != null && (auth.uid === $uid || ${ADMIN})`,
    '.write': `auth != null && (auth.uid === $uid || ${ADMIN})`
  }
};

/* ══ 알림·기록 ═════════════════════════════════════════════════════════ */
rules.systemAlerts = {
  '.read': MGR,
  $uid: { $id: {
    '.write': `(${LOGIN}) && (${ADMIN} || ${SUB} || (auth.uid === $uid && !data.exists() && newData.child('uid').val() === auth.uid))`,
    '.validate': "!newData.exists() || newData.hasChildren(['uid','kind','message','page','createdAt','status'])",
    uid:     { '.validate': `${ADMIN} || ${SUB} || newData.val() === auth.uid` },
    kind:    { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 40' },
    message: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 700' },
    page:    { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 100' },
    createdAt: { '.validate': 'newData.isNumber()' },
    status:  { '.validate': "newData.isString() && newData.val().matches(/^(new|resolved)$/)" }
  } }
};

rules.presence     = { '.read': LOGIN, '.write': LOGIN };
rules.activeWriter = { '.read': LOGIN, '.write': LOGIN };
/* 로그인 «전» 에도 읽는다 — 새 판이 나왔는지 보는 칸이라 그렇다 */
rules.appBuild = { '.read': true, '.write': ADMIN };

/* ══ 회사 메일함 ═══════════════════════════════════════════════════════
   ⚠ 「직원」의 뜻을 «로그인한 사람»으로 두면 안 된다 — 회사 메일함에는 고객사
     임직원의 신상이 제목에까지 들어 있다. uid_roles 에 «사번이 적힌 재직자»만 본다.
   ⚠ 서버 함수(functions/mail-sync.js requireMailUser)도 «같은 뜻»으로 막는다 —
     한쪽만 열면 「목록은 보이는데 본문에서 403」이 된다.
   (대표 지시 2026-08-27 「전 직원에게 다 열기」) */
const STAFF = `auth != null && root.child('uid_roles').child(auth.uid).child('sid').exists()`
            + ` && root.child('uid_roles').child(auth.uid).child('status').val() === 'active'`;
rules.mailbox  = { '.read': STAFF, '.write': false };

/* ══ 「누가 봤나」 — 혼자 맡은 건 (대표 지시 2026-08-29) ═══════════════════
   "주담당 부담당만 본 기록 남게 하면 된다. 나머지는 기록은 권형하만 확인이 된다."

   ★ 왜 pucards «밖»에 있나 — pucards 는 위쪽에 .read 가 걸려 있고, 파이어베이스
     규칙은 «위에서 허락하면 아래에서 못 막는다». 그 밑에 두면 전 직원이 읽는다.
   ⚠ 읽기는 대표님만. 쓰기는 «자기 사번 칸에만» — 남의 이름으로 못 적는다.
   ⚠ 공동으로 맡은 건의 기록은 pucards/mailSeen 에 있다(서로 봐야 두 번 일하지 않는다). */
rules.pu_mailseen = {
  '.read': `auth != null && ${ADMIN}`,
  $mail: { $sid: {
    '.write': `auth != null`
      + ` && root.child('uid_roles').child(auth.uid).child('sid').val() === $sid`
      + ` && root.child('uid_roles').child(auth.uid).child('status').val() === 'active'`
  } }
};
rules.homepage = { '.read': `auth != null && ${ADMIN}`, '.write': `auth != null && ${ADMIN}` };
rules.kcareer  = { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } };

/* ══ 전자서명 ══════════════════════════════════════════════════════════
   ⚠ 근로자는 링크로 들어와 «암호화된 채로» 낸다. meta 는 그래서 열려 있다.
     낸 것은 우리 직원만 읽는다. */
rules.esign = { cases: { $caseId: {
  meta:        { '.read': 'auth != null', '.write': MAIL },
  secret:      { '.read': MAIL, '.write': MAIL },
  arrears:     { '.read': MAIL, '.write': MAIL },
  submissions: {
    '.read': MAIL,
    $subId: {
      '.write': `(auth != null && !data.exists() && newData.child('t').val() === root.child('esign/cases/' + $caseId + '/meta/linkToken').val() && root.child('esign/cases/' + $caseId + '/meta/status').val() === 'active') || (${MAIL})`,
      '.validate': `newData.hasChildren(['enc','encKey','iv','t','submittedAt','reviewState']) || (${MAIL})`,
      enc:    { '.validate': 'newData.isString() && newData.val().length < 400000' },
      encKey: { '.validate': 'newData.isString() && newData.val().length < 1000' },
      iv:     { '.validate': 'newData.isString() && newData.val().length < 100' },
      reviewState: { '.validate': "newData.isString() && newData.val().matches(/^(pending|confirmed|hold)$/)" }
    }
  }
} } };

/* ══ 취업규칙 관리 ═════════════════════════════════════════════════════ */
const revWrite = `auth != null && ( !data.exists() || data.child('ownerUid').val() === auth.uid || ${ADMIN} ) && ( !newData.exists() || newData.child('ownerUid').val() === auth.uid )`;
const origWrite = `auth != null && ( !data.exists() || !data.child('ownerUid').exists() || data.child('ownerUid').val() === auth.uid || ${ADMIN} )`;
rules.rules_mgmt = {
  wip: { $uid: {
    '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid',
    $site: { '.validate': "newData.hasChildren(['site','asof'])" }
  } },
  done: { '.read': LOGIN, $site: { $rev: {
    '.write': revWrite,
    '.validate': "newData.hasChildren(['site','asof','ownerUid'])",
    ownerUid: { '.validate': 'newData.val() === auth.uid' },
    status: { '.validate': "newData.val() === '완료'" }
  } } },
  index: { '.read': LOGIN, $site: { $rev: {
    '.write': revWrite,
    '.validate': "newData.hasChildren(['site','asof','kind','ownerUid'])",
    ownerUid: { '.validate': 'newData.val() === auth.uid' },
    kind:  { '.validate': "newData.isString() && newData.val().matches(/^(제정|전부개정|일부개정)$/)" },
    site:  { '.validate': 'newData.isString() && newData.val().length <= 120' },
    bizno: { '.validate': 'newData.isString() && newData.val().length <= 20' },
    asof:  { '.validate': 'newData.isString() && newData.val().length <= 10' },
    changed: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000' },
    arts: { $i: { '.validate': 'newData.isString() && newData.val().length <= 60' } },
    artsMore: { '.validate': 'newData.isNumber() && newData.val() >= 0' },
    savedAt: { '.validate': 'newData.isString() && newData.val().length <= 20' },
    savedBy: { '.validate': 'newData.isString() && newData.val().length <= 40' },
    doneAt:  { '.validate': 'newData.isString() && newData.val().length <= 20' },
    doneBy:  { '.validate': 'newData.isString() && newData.val().length <= 40' },
    ownerName: { '.validate': 'newData.isString() && newData.val().length <= 40' },
    from: { '.validate': "newData.isString() && newData.val().matches(/^(rules|chwieop)$/)" },
    $other: { '.validate': false }
  } } },
  orig:    { '.read': LOGIN, $id: { '.write': origWrite } },
  archive: { '.read': LOGIN, $id: { '.write': origWrite } },
  worksession: { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } },
  decisions: { '.read': LOGIN, '.write': LOGIN },
  matchfix:  { '.read': LOGIN, '.write': LOGIN }
};

/* ══ 폰 알림 열쇠 ══════════════════════════════════════════════════════
   ⚠ 서버(함수)는 관리자 SDK 로 도므로 이 규칙을 지나간다 — 그래서 본인만 읽어도
     알림 보내기가 된다. */
rules.fcm_tokens = { $uid: {
  '.read':  'auth != null && auth.uid == $uid',
  '.write': `(${LOGIN}) && auth.uid == $uid`,
  $token: {
    '.validate': "newData.hasChild('at')",
    at:   { '.validate': 'newData.isNumber()' },
    name: { '.validate': 'newData.isString() && newData.val().length <= 60' },
    ua:   { '.validate': 'newData.isString() && newData.val().length <= 200' },
    $other: { '.validate': false }
  }
} };

process.stdout.write(JSON.stringify({ rules: rules }, null, 2) + '\n');
