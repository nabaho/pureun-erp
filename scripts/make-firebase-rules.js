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
  ledger_batches: finOnly,

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
  /* 사건 기록. 여태 이름이 없어 $other 로 떨어져 있었다 — 권한은 «그대로»
     재직 직원 전원이고, 이름을 붙여 어디에 무엇이 있는지 드러낸 것뿐이다.
     (2026-09-06 메일 수집기가 이 자리의 업체 담당자 주소를 읽게 되면서 드러났다) */
  cases:          { '.read': LOGIN, '.write': LOGIN },   /* 사건 기록 */
  presence_hours: { '.read': LOGIN, '.write': LOGIN },   /* 근무 시간 */

  /* 포털 — 앱 공용 설정과 개인 타일 순서 (대표 지시 2026-08-29 「셋 좁」으로 좁혔다) */

  /* 공용 설정: 모든 앱이 읽어 쓴다 → 읽기는 직원 그대로.
     쓰기는 «포털 설정 창»에서만 나오고 그 단추는 이미 관리자에게만 보인다(cfgShowFab).
     화면에서만 감추면 1차 방어일 뿐이라, 규칙으로 한 겹 더 잠근다. */
  app_config:       { '.read': LOGIN, '.write': ADMIN },

  portal_prefs:     { '.read': LOGIN, '.write': LOGIN }, /* 옛 타일 순서(안 쓴다) */

  /* 타일 순서: «남이 내 배치를 바꾸는 것»을 막는다.
     ⚠ 부모 자리를 관리자에게 열어 두는 까닭 — 백업이 통째로 읽고, 복원이 통째로 되쓴다.
       자식 규칙만 두면 백업이 멈추고 복원이 거부된다(둘 다 조용히 실패한다). */
  portal_prefs_uid: {
    '.read': MGR, '.write': MGR,
    $uid: {
      '.read':  `auth != null && (auth.uid === $uid || ${MGR})`,
      '.write': `auth != null && (auth.uid === $uid || ${MGR})`
    }
  },

  /* 옛 건의 자리 — 관리자가 포털에 들어오면 suggestions_private 로 옮기고 여기를 «지운다»
     (enter.html 의 sgEnsurePrivateMigration). 이사가 끝나면 이 넷은 빈 자리가 된다.
     ⚠ 그때까지는 «건의 원문»이 여기 남아 있을 수 있다 — 좁힐 첫 후보다(대표 판단). */
  /* ★ 2026-08-29 대표 지시로 «관리자·위임관리인»에게만 남겼다.
     건의는 직원이 대표께 올린 글이다 — 직원끼리 볼 자리가 아니다.
     ⚠ 관리자«만»으로 하지 않은 까닭: 백업을 위임관리인도 돌리는데,
       백업은 읽기 실패를 삼키지 않아 한 자리만 막혀도 통째로 멈춘다.
     이사(enter.html sgEnsurePrivateMigration)가 끝나면 이 넷은 빈 자리가 된다. */
  suggestions:     { '.read': MGR, '.write': MGR },
  sg_meta:         { '.read': MGR, '.write': MGR },
  sg_resolved:     { '.read': MGR, '.write': MGR },
  sg_resolved_uid: { '.read': MGR, '.write': MGR },

  /* 직원 색표(사번 → 색) — 푸른이알피 법인대시보드가 «정하는 한 곳» (대표 지시 2026-08-30).
     읽기는 직원 누구나(어느 앱에서나 같은 색이어야 한다), 쓰기는 관리자·위임관리인.
     ⚠ 컨설팅일정은 «읽기만» 한다. 두 곳에서 정하면 언젠가 어긋나고,
       그때 어느 쪽이 맞는지 아무도 모른다. */
  staff_colors:    { '.read': LOGIN, '.write': MGR },

  /* 사업(컨설팅 종류) 색표(푸른이알피 유형 코드 → 색) — «컨설팅일정»이 정하는 한 곳
     (대표 결정 2026-08-30 「㉮」). 사람 색과 방향이 반대다 — 푸른이알피의 컨설팅 유형
     자료에는 색 칸이 «아예 없어» 가져올 원본이 없기 때문이다.
     ⚠ 쓰기를 관리자로 좁히지 않는다 — 종류 색은 담당 노무사가 컨설팅일정
       「컨설팅 종류 관리」에서 직접 고른다. 좁히면 색을 바꿔도 조용히 안 올라간다. */
  cons_type_colors: { '.read': LOGIN, '.write': LOGIN },

  /* 업체 고유번호 번호통 (대표 지시 2026-09-03).
     업체를 만드는 사람이 여기서 다음 번호를 «뽑아» 간다 — 그래서 쓰기는 직원 전원이다.
     ⚠⚠ 번호는 «뒤로 갈 수 없다». 되돌려 쓰면 지난 서류가 가리키던 번호가
       다른 업체에 붙는다 — 그것은 되돌릴 수 없는 사고다.
       그래서 규칙이 「지금보다 큰 수」만 받는다. 코드에 구멍이 나도 서버가 막는다. */
  co_no_seq: {
    '.read': LOGIN, '.write': LOGIN,
    '.validate': 'newData.isNumber() && newData.val() >= 10001 && newData.val() <= 99999'
      + ' && (!data.exists() || newData.val() > data.val())'
  },

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

/* ── 파생 관계망(온톨로지) ── 2026-09-04, 6단계 ㉡
   ★ 이것은 «사본»이다. 원본을 대신하지 않고, 언제든 원본에서 다시 만든다.
     그래서 지워져도 자료를 잃지 않는다 — 다시 올리면 된다.

   ⚠⚠ 칸을 «권한으로» 가른다. 관계망에는 이름·금액·연락처가 안 담기지만,
     「누가 무엇과 이어져 있는가」 자체가 알려 주는 것이 있다 —
       personal   사람·근로계약·근태·휴가  → 관리자만
       financial  급여·수입·지출·청구서    → 관리자만
       internal   업체·계약·사건·사업·일정 → 재직 직원
       source     서류·사진·메일·규정·제출 → 재직 직원
     CLAUDE.md 「원본보다 넓은 권한으로 공개하지 않는다」를 자리 모양으로 못 박은 것이다.

   ⚠ 쓰기는 관리자만이다. 진단을 돌려 올리는 것은 관리자 화면(검증센터)뿐이다.
   ⚠ current 는 「지금 볼 판」 한 줄이다. 이것을 마지막에 바꿔야 반쯤 올라간 판을
     아무도 안 본다 — 규칙이 아니라 올리는 차례가 지키는 일이라 주석으로 남긴다. */
/* 관계망의 «모양»도 서버가 검사한다. 전에는 관리자 여부만 보아 관리자 화면의
   버그나 낡은 탭이 잘못된 개체를 올려도 그대로 들어갔다. 판 안의 개체·관계는
   한 번 생기면 같은 값 재시도 외에는 못 바꾼다 — 고침은 새 판을 만드는 일이다. */
const ontImmutable = `(${ADMIN}) && (!data.exists() || newData.val() === data.val())`;
const ontEntity = {
  '.write': ontImmutable,
  '.validate': "newData.hasChildren(['id','type','program','source','schemaVersion'])"
    + " && newData.child('id').isString() && newData.child('id').val().length > 0"
    + " && newData.child('type').isString() && newData.child('type').val().length > 0"
    + " && newData.child('program').isString() && newData.child('source').isString()"
    + " && newData.child('schemaVersion').isNumber()",
  id:{'.validate':'newData.isString()'}, type:{'.validate':'newData.isString()'},
  program:{'.validate':'newData.isString()'}, source:{'.validate':'newData.isString()'},
  schemaVersion:{'.validate':'newData.isNumber()'},
  no:{'.validate':'newData.isNumber() && newData.val() >= 10001 && newData.val() <= 99999'},
  $other:{'.validate':false}
};
const ontEdge = {
  '.write': ontImmutable,
  '.validate': "newData.hasChildren(['id','subject','predicate','object','sourceStore','sourceId','confidence','schemaVersion'])"
    + " && newData.child('id').isString() && newData.child('subject').isString()"
    + " && newData.child('predicate').isString() && newData.child('object').isString()"
    + " && newData.child('sourceStore').isString() && newData.child('sourceId').isString()"
    + " && newData.child('confidence').val() === 1 && newData.child('schemaVersion').isNumber()",
  id:{'.validate':'newData.isString()'}, subject:{'.validate':'newData.isString()'},
  predicate:{'.validate':'newData.isString()'}, object:{'.validate':'newData.isString()'},
  sourceStore:{'.validate':'newData.isString()'}, sourceId:{'.validate':'newData.isString()'},
  confidence:{'.validate':'newData.isNumber() && newData.val() === 1'},
  schemaVersion:{'.validate':'newData.isNumber()'}, $other:{'.validate':false}
};
function ontPartition(read){ return {
  '.read':read, '.write':ADMIN,
  entities:{$id:ontEntity}, edges:{$id:ontEdge}, $other:{'.validate':false}
}; }
rules.ontology = {
  v1: {
    current: { '.read': LOGIN, '.write': ADMIN,
      '.validate': 'newData.isString() && newData.val().length <= 64' },
    gen: {
      $gen: {
        meta:      { '.read': LOGIN, '.write': ADMIN,
          '.validate': "newData.hasChildren(['schema','schemaVersion','generationId','generatedAt','fingerprint','readOnlyDerived','sourceMutation','confirmedEdges','excludedCandidates'])"
            + " && newData.child('schema').val() === 'ontology/v1'"
            + " && newData.child('schemaVersion').isNumber() && newData.child('generationId').val() === $gen"
            + " && newData.child('readOnlyDerived').val() === true && newData.child('sourceMutation').val() === 'never'" },
        internal:  ontPartition(LOGIN),
        source:    ontPartition(LOGIN),
        /* ★ 여기 둘은 «재직 직원»에게도 안 보인다 */
        personal:  ontPartition(ADMIN),
        financial: ontPartition(ADMIN),
        $other: { '.validate': false }
      }
    }
  }
};

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
 'scal_conflictMatrix','scal_roundlog','scal_erpConsHold','scal_erpTypeMap','scal_erpTypeRun',
 /* 사진 변경 이력 — 회차 이력과 같은 «한 줄씩 쌓는» 자리 (2026-08-29 대표 결정 「가」).
    직원은 남길 수 있고, 지우기는 관리자만. */
 'scal_photoLog']
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
    items:  { $year: { $id: {
      '.read': `(${LOGIN}) && data.child('shareWith').child(auth.uid).exists()`,
      /* ── 되전달 (대표 지시 2026-08-30 ㉮) ──
         "다른 사람들끼리도 서로 공유를 쉽게 해야된다"
         지금까지 「열어 주기」는 올린 사람과 총괄관리자만이었다. 그래서 받은 사람이
         동료에게 넘기려면 올린 사람에게 다시 부탁해야 했고 — 걸음이 하나 더 끼니까
         **실제로는 카톡으로 보내고 만다.** 그게 훨씬 위험하다.
         ⚠ 여는 것은 **명단 칸 둘뿐**이다. 사진·글·분류에는 손도 못 댄다.
         ⚠ **더하기만** 된다(newData.val() === true). 빼는 것은 위의 주인·관리자
           규칙만 할 수 있다 — 아니면 한 직원이 남의 사진을 동료에게서 거둬 간다.
         ⚠ 조건은 「**내가 이미 이 사진을 보고 있는가**」다. 안 그러면 아무 사진에나
           명단을 붙일 수 있게 된다. */
      shareWith: { $who: {
        '.write': `(${LOGIN}) && newData.val() === true && ` +
          `root.child('puphotos').child('u').child($uid).child('items').child($year)` +
          `.child($id).child('shareWith').child(auth.uid).exists()`
      } },
      /* 「누가 넘겼는지」 한 줄 — 있어야 한 다리 건너 퍼져도 자취가 남는다 */
      shareBy: { $who: {
        '.write': `(${LOGIN}) && newData.isString() && newData.val().length <= 60 && ` +
          `root.child('puphotos').child('u').child($uid).child('items').child($year)` +
          `.child($id).child('shareWith').child(auth.uid).exists()`
      } }
    } } },
    blobs:  { $year: { $id: { '.read': `(${LOGIN}) && root.child('puphotos').child('u').child($uid).child('items').child($year).child($id).child('shareWith').child(auth.uid).exists()` } } },
    thumbs: { $year: { $id: { '.read': `(${LOGIN}) && root.child('puphotos').child('u').child($uid).child('items').child($year).child($id).child('shareWith').child(auth.uid).exists()` } } }
  } },
  /* ── 열람 기록 (대표 지시 2026-09-01) ──
     민감 서류 원본을 «누가 언제» 열었나. 근로자 신분증을 담기 시작하면 이 물음에
     답할 수 있어야 한다(급여데이터함에는 이미 있다 — paydata/access_log).
     ⚠ **읽기는 총괄관리자만.** 「누가 누구 서류를 봤나」는 그 자체로 민감하다 —
       이름 없는 자리($other)에 두면 전 직원이 읽는다.
     ⚠ **아무도 못 쓴다(.write:false).** 적는 것은 서버 함수(photoView) 하나뿐이고
       그것은 Admin SDK 라 규칙을 지나지 않는다. 화면에서 쓸 길을 열어 두면
       **기록을 꾸며 낼 수 있다** — 꾸밀 수 있는 기록은 기록이 아니다. */
  access_log: { '.read': `auth != null && ${ADMIN}`, '.write': false },
  customKinds: { '.read': LOGIN, '.write': LOGIN },
  kindLabels:  { '.read': LOGIN, '.write': `(${LOGIN}) && ${ADMIN}` },
  kindHidden:  { '.read': LOGIN, '.write': `(${LOGIN}) && ${ADMIN}` },
  retention:   { '.read': LOGIN, '.write': `(${LOGIN}) && (${ADMIN} || data.child('uid').val() === auth.uid)` },
  /* ⚠ 받는 사람 쪽 「가리키는 표」. 여기가 안 열리면 화면은 「공유했습니다」라고
     말해 놓고 받는 사람 목록에는 아무것도 안 뜬다 — 가장 나쁜 실패다. */
  sharedTo: { $uid: {
    '.read': `(${LOGIN}) && (auth.uid === $uid || ${ADMIN})`,
    $pid: {
      /* ⑤ 되전달(2026-08-30 ㉮): **내가 이미 보고 있는 사진**이면 동료를 가리켜 줄 수
         있다. 위의 shareWith 규칙과 «똑같은 조건»이라, 한쪽만 열려 반쪽으로 끝나는
         일이 없다. 지우는 것은 여기서 안 넓혔다 — 주인과 본인만 뗀다. */
      '.write': `(${LOGIN}) && (${ADMIN}`
        + ` || (newData.exists() && newData.child('owner').val() === auth.uid)`
        + ` || (newData.exists() && root.child('puphotos').child('u')`
        + `.child(newData.child('owner').val()).child('items')`
        + `.child(newData.child('year').val()).child($pid)`
        + `.child('shareWith').child(auth.uid).exists())`
        + ` || (!newData.exists() && (data.child('owner').val() === auth.uid || auth.uid === $uid)))`,
      '.validate': "!newData.exists() || newData.hasChildren(['owner','year','at'])"
    }
  } },
  $other: { '.read': LOGIN, '.write': `(${LOGIN}) && ${ADMIN}` }
};

/* 급여데이터함 — 대리인(deputy)은 «기간 안에만» 쓴다.

   ★★ 읽기가 전 직원인 것은 «일부러» 그렇다 (대표 결정 2026-08-30). 조이지 말 것.

   2026-08-30 에 바깥 검토가 이 자리를 「높음·보안 구멍」으로 짚었다. 실제로 화면을
   열어 보니 구멍이 아니라 **기능**이었다 — 급여데이터함 「🔁 담당자」 단추가
   ① 다른 담당자를 고르고 ② 「왜 보시나요」를 적게 하고 ③ 그 사유를 access_log 에
   남긴 뒤 ④ 그 자리를 «보기만» 하게 해 준다 (대표 지시 2026-08-17).
   한 업체를 둘이 맡을 때 상대가 담아 둔 서류를 보는 것도 이 읽기로 된다.

   조이면 이 셋이 함께 사라진다:
     · 직원의 「🔁 담당자」 — 관리자만 남는다
     · 공동 담당 서랍 — 「줄에는 3장, 서랍은 0건」이 돌아온다
     · 대리 여부 확인 — pickStaff 가 상대의 deputy 칸을 읽어야 한다

   ⚠ 솔직한 한계: 「사유를 적어야 본다」를 지키는 것은 **화면뿐**이다. 규칙은
     못 지킨다 — 읽기 규칙이 「먼저 기록을 남겨라」를 요구할 수 없다. 화면을 거치지
     않으면 기록 없이 읽힌다. 이것까지 막으려면 자리마다 「같이 보는 사람」 명단을
     둬야 하는데, 명단이 낡으면 서류가 안 보이는 옛 사고가 돌아온다.
     그래서 대표께 물었고, 「지금대로 둔다」로 정해졌다 (2026-08-30).

   tests/paydata-seat-open.test.js 가 이 결정을 지킨다. */
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

/* ══ 뉴스레터 (대표 지시 2026-09-02 「푸른내외관리에 뉴스레터관리를 넣고 매주 관리하고 싶다」) ══
   화면: pu-news.html · 판단: js/pu-news-core.js · 편지: js/pu-news-tpl.js

   ⚠ homepage 와 «같은 잣대»(총괄관리자만)로 둔다. 셋 다 그럴 까닭이 있다.
     · recipients — 거래처 담당자 이름·이메일이 든 명단이다. 밖으로 나가면 안 된다.
     · issues     — 법인 이름으로 나갈 편지의 초안이다. 남이 고치면 그대로 나간다.
     · config     — 여기의 「범위」가 (광고) 표기를 켜고 끈다. 곧 법 판단이라 더 그렇다.

   ⚠ 직원에게 열지 말 것. 열려면 homepage 읽기도 함께 열어야 하는데
     (자동으로 담을 밑감이 homepage/newsBrief 에 있다) 그러면 홈페이지 관리의 문이
     함께 열린다. 여는 것이 옳다고 판단되면 «두 곳을 같이» 보고 정할 것.

   ★ 서버(sendBulkMail)는 관리자 SDK 로 돌아 이 규칙을 지나지 않는다 —
     보내기가 막히지 않는다. */
rules.newsletter = { '.read': `auth != null && ${ADMIN}`, '.write': `auth != null && ${ADMIN}` };

/* ══ 공인노무사회에서 받아 둔 자료 (ilabor) ════════════════════════════
   ★ 서버(ilaborPull)가 관리자 SDK 로 «담기만» 하던 자리다. 규칙이 아예 없어서
     기본 거절에 걸렸고, 뉴스레터 화면이 읽으려 하자
     「permission_denied at /ilabor/items」 로 막혔다(2026-09-05 대표 화면).
     받아 놓고도 아무도 못 보는 상태였다.
   ⚠ 읽기만 연다. 담는 것은 서버가 한다 — 화면이 쓰게 열어 두면
     받아 온 자료를 사람이 실수로 지울 수 있고, 그러면 원본이 없다.
   ⚠ 총괄관리자만 — 남의 회원 계정으로 받아 온 자료다. */
rules.ilabor = { '.read': `auth != null && ${ADMIN}`, '.write': false };
rules.kcareer  = { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } };

/* ══ 경력관리 «직원 공개용 사본» ═══════════════════════════════════════
   대표 지시 2026-09-02: 「경력관리 이부분만 다른 직원들이 볼 수 있게」 → 방식 「나」 승인.

   ★ 왜 사본을 따로 두나 — 대표 칸(kcareer/{uid})을 직원에게 열어 주면 경력관리만이
     아니라 실적·비용·개인정보·신분증까지 «같은 칸»이라 함께 열린다.
     그래서 대표가 «경력관리 세 통만» 골라 올린 사본을 두고, 직원은 그것만 읽는다.

   ⚠ 읽기: 재직 직원 전원. 쓰기: 관리자(대표)만 —
     직원이 쓸 수 있으면 대표 경력 기록을 남이 고칠 수 있다.
   ⚠ 담는 것은 위촉장·자격·학력 세 통뿐이다(앱의 kcPubStores 가 정한다).
     여기에 개인정보·계좌·신분증·비용을 올리는 코드를 만들지 말 것. */
rules.kcareer_pub = { '.read': STAFF, '.write': `auth != null && ${ADMIN}` };

/* ══ 경력관리 «받은 함» — 직원이 올리고 대표가 들인다 ══════════
   대표 지시 2026-09-03: 「다른직원이 고치거나 지울수 없어도 pdf 위촉장을
   업로드해서 등록할 수 있게」.

   ★ 왜 사본(kcareer_pub)에 바로 안 쓰나 — 그쪽은 대표 기록 그 자실이다.
     직원이 쓰게 하면 «새로 올리는 것»과 «있는 것을 고치는 것»을 갈럴 말릴 수 없다.
     그래서 따로 받은 함을 둔다 — 직원은 «더하기»만, 대표가 보고 들인다.

   ⚠ 직원은 «자기 자리»에만 쓰고, «지우는 것»은 관리자만 한다
     (newData.exists() — scal_* 와 같은 집 모양). 지울 수 있으면 올렸던 것을
     지워 없어지게 할 수 있어 «난 올렸다»를 다툴 수 없다.
   ⚠ 대표는 전부 읽는다 — 들이려면 모든 직원의 올린 것을 봐야 한다. */
rules.kcareer_inbox = {
  '.read': `auth != null && ${ADMIN}`,
  $uid: {
    '.read':  'auth != null && auth.uid === $uid',
    '.write': `(${STAFF}) && auth.uid === $uid && (newData.exists() || ${ADMIN})`
  }
};

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
  matchfix:  { '.read': LOGIN, '.write': LOGIN },

  /* ── 서고(사례집) ─ 2026-09-07 · 설계서 §3·§6 ───────────────────────────
     ⚠ 보관함과 «일부러» 갈리는 자리다. 보관함은 「내 것 + 남의 완료본」인데
       서고는 «직원 전체가 남의 사업장까지» 본다 — 사례집이 목적이라 맞다.
       그래서 올리는 화면에 「서고에 올리면 직원 전체가 볼 수 있습니다」를 적었다
       (rules.html 의 떨어뜨리기 창 · tests/rules-casebook-ui.test.js 가 지킨다).

     무게별로 네 층이라 규칙도 층마다 다르다:
       index  가벼운 목록  — 쓰기 LOGIN. ⚠ 여기만 ownerUid 로 안 잠근다.
                             한 사업장에 여러 담당자가 회차를 더하는데 첫 사람에게
                             잠그면 둘째 담당자의 회차가 «목록에 안 뜬다».
                             대신 넣을 수 있는 칸을 못 박아 아무거나 못 쌓게 한다.
       rev    회차 상세    — ownerUid 방식(orig·done 과 같은 모양).
       text   본문         — 쓰는 순서가 text→rev 라 «rev 가 아직 없다».
                             그래서 본문 자리에 ownerUid 를 함께 적어 두고 그것을 본다.
       idx    검색 색인    — 값이 1 뿐이라 임자를 적을 데가 없다. 쓰기는 LOGIN 이되
                             칸 이름과 값을 좁게 못 박는다(설계서 §3-④). */
  casebook: {
    index: { '.read': LOGIN, $site: {
      '.write': LOGIN,
      '.validate': "newData.hasChildren(['site'])",
      site:      { '.validate': 'newData.isString() && newData.val().length <= 120' },
      bizno:     { '.validate': 'newData.isString() && newData.val().length <= 20' },
      industry:  { '.validate': 'newData.isString() && newData.val().length <= 60' },
      size:      { '.validate': 'newData.isNumber() && newData.val() >= 0' },
      revCount:  { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000' },
      lastYear:  { '.validate': 'newData.isString() && newData.val().length <= 10' },
      updatedAt: { '.validate': 'newData.isString() && newData.val().length <= 30' },
      updatedBy: { '.validate': 'newData.isString() && newData.val().length <= 40' },
      $other: { '.validate': false }
    } },
    rev: { '.read': LOGIN, $site: { $rev: {
      '.write': revWrite,
      '.validate': "newData.hasChildren(['year','ownerUid'])",
      ownerUid: { '.validate': 'newData.val() === auth.uid' },
      year: { '.validate': 'newData.isString() && newData.val().length <= 10' },
      at:   { '.validate': 'newData.isString() && newData.val().length <= 10' },
      by:   { '.validate': 'newData.isString() && newData.val().length <= 40' },
      note: { '.validate': 'newData.isString() && newData.val().length <= 500' },
      site: { '.validate': 'newData.isString() && newData.val().length <= 120' },
      savedAt: { '.validate': 'newData.isString() && newData.val().length <= 30' },
      docs: { $role: {
        '.validate': "newData.hasChildren(['name','sha'])",
        name: { '.validate': 'newData.isString() && newData.val().length <= 260' },
        ext:  { '.validate': 'newData.isString() && newData.val().length <= 10' },
        size: { '.validate': 'newData.isNumber() && newData.val() >= 0' },
        path: { '.validate': 'newData.isString() && newData.val().length <= 300' },
        artCount: { '.validate': 'newData.isNumber() && newData.val() >= 0' },
        /* ⚠ 본문이 없는 것(스캔 PDF 등)은 조용히 빼지 않고 «없다»고 적어 둔다 — 설계서 §8 */
        noText: { '.validate': 'newData.isBoolean()' },
        /* ㉢ OCR 로 읽어냈다는 «딱지» (2026-09-07). 글 자체는 casebook/ocr 층에 있다.
           ⚠ 읽어내도 noText 는 «참으로 남는다» — 그것은 「원본에 글자층이 없었다」는
             사실이고, 읽어냈다고 사실이 바뀌지 않는다. 지우면 나중에 「이건 원문인가
             추정인가」를 아무도 못 가리고, 「검토 시작」이 추정 글로 열려 버린다.
           ⚠⚠ 이 «세 칸만» 로그인한 직원 누구나 쓴다(다른 칸은 그대로 임자만).
             까닭 — 서고는 사례집이라 «남의 사업장 회차»를 다 같이 본다. 그런데 회차를
             담은 사람만 글자를 읽을 수 있으면, 옛 담당자가 퇴사한 회차는 영영 못 읽는다.
             넓히는 것은 «딱지 셋»뿐이다: 참·거짓 하나, 글자 수 하나, 시각 하나.
             이름·해시·원본 자리(name·sha·path)는 여전히 임자만 건드린다. */
        ocr:   { '.write': LOGIN, '.validate': 'newData.isBoolean()' },
        ocrN:  { '.write': LOGIN, '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 600000' },
        ocrAt: { '.write': LOGIN, '.validate': 'newData.isString() && newData.val().length <= 30' },
        sha:  { '.validate': 'newData.isString() && newData.val().length <= 80' },
        /* ── 제출 정보 ─ 2026-09-07 대표 지시 「ㄴ」 ────────────────────────
           ★ 왜 OCR 이 아니라 손으로 적나 — 신고서·의견청취·동의서에서 정작 필요한 것은
             「언제·어느 노동청에·몇 명 동의로」인데, 그건 도장과 손글씨라 OCR 이 못 읽는다.
             본문을 뽑아 봐야 쓸 데가 없다. 사람이 3초면 적고, 그것이 실적 증빙에 쓰인다.
           ★ 서류마다 칸을 따로 두지 않는다 — 셋이 결국 같은 것을 적는다.
             언제(at) · 무슨 번호로(no) · 어디에(office) · 몇 명이(n) · 전체 몇 중(nAll). */
        sub: {
          at:     { '.validate': "newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)" },
          no:     { '.validate': 'newData.isString() && newData.val().length <= 40' },
          office: { '.validate': 'newData.isString() && newData.val().length <= 60' },
          n:      { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000' },
          nAll:   { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000' },
          $other: { '.validate': false }
        },
        $other: { '.validate': false }
      } },
      $other: { '.validate': false }
    } } },
    text: { '.read': LOGIN, $site: { $rev: { $role: {
      '.write': revWrite,
      '.validate': "newData.hasChildren(['t','ownerUid'])",
      ownerUid: { '.validate': 'newData.val() === auth.uid' },
      /* 취업규칙 전문 한 벌. 100KB 를 넘는 것이 흔해 넉넉히 두되, 한 번 쓰기가
         실시간DB 한도(16MB)를 건드리지 않게 막는다. */
      t: { '.validate': 'newData.isString() && newData.val().length <= 600000' },
      at: { '.validate': 'newData.isString() && newData.val().length <= 30' },
      $other: { '.validate': false }
    } } } },
    /* ㉢ OCR 추정 본문 — 원문 층(text)과 «딴 자리»다 (대표 결정 2026-09-07 「읽혀 검색에 걸리게」).
       ★ 왜 층을 가르나 — 기계가 「제10조」를 「제1O조」로 읽은 것이 원문 자리에 앉으면
         되돌릴 길이 없다. 딴 자리에 두면 지우기만 해도 그냥 「글 없음」으로 돌아간다.
       ⚠ kind 를 «못 박는다» — 값만 보고도 어느 층에서 온 글인지 알 수 있어야 한다.
         이것이 없으면 옮기다 섞였을 때 추정을 원문으로 읽는다. */
    ocr: { '.read': LOGIN, $site: { $rev: { $role: {
      /* ⚠ 임자(revWrite)가 아니라 «로그인»이다 — 위 docs 의 딱지 셋과 같은 까닭이다.
           옛 담당자가 담은 회차도 지금 사람이 읽을 수 있어야 한다.
         ⚠ 대신 «누가 읽었는지»를 못 박는다(ownerUid === auth.uid) — 남의 이름으로
           추정 글을 앉힐 수는 없다. 다시 읽으면 읽은 사람 이름으로 바뀐다. */
      '.write': LOGIN,
      '.validate': "newData.hasChildren(['t','kind','ownerUid'])",
      ownerUid: { '.validate': 'newData.val() === auth.uid' },
      kind: { '.validate': "newData.val() === 'ocr'" },
      t: { '.validate': 'newData.isString() && newData.val().length <= 600000' },
      at: { '.validate': 'newData.isString() && newData.val().length <= 30' },
      by: { '.validate': 'newData.isString() && newData.val().length <= 40' },
      engine: { '.validate': 'newData.isString() && newData.val().length <= 40' },
      pages: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 5000' },
      $other: { '.validate': false }
    } } } },
    idx: { k: { '.read': LOGIN, $kw: { $ref: {
      '.write': LOGIN,
      '.validate': 'newData.isNumber() || newData.isBoolean()'
    } } } }
  }
};

/* ══ ⑤ 판독을 몇 번 불렀나 — 앱별 셈 (대표 물음 2026-09-08) ═════════════════
   여태 세는 곳이 «아예 없어» 「사진첩이 다 썼나 경력관리가 다 썼나」를 알 수 없었다.
   열쇠 하나를 사진첩·기업정보함·경력관리·급여가 나눠 쓰는데, 어디가 몫을 태우는지
   모르면 어디를 손볼지도 모른다.

   ★ 담는 것은 «숫자뿐»이다 — 사진·글·사람 이름은 한 글자도 없다. 그래서 읽기를
     재직 직원 전체에 열었다(화면이 「오늘 판독 203번」을 보여 준다).
   ⚠ 쓰기는 «아무도 못 한다»(false). 서버(함수)는 관리자 SDK 로 도므로 이 규칙을
     지나간다 — 브라우저가 셈을 부풀려 「많이 썼다」로 꾸미지 못하게 막는 것이다. */
rules.ai_read_tally = {
  '.read': LOGIN,
  '.write': false,
  $ymd: { $app: {
    /* n = 부른 수 · quota = 하루 몫에 막힌 수. 둘을 가른다 —
       합치면 「많이 썼다」와 「막혔다」가 섞여 아껴 쓴 날과 걸린 날이 같아 보인다. */
    n:     { '.validate': 'newData.isNumber() && newData.val() >= 0' },
    quota: { '.validate': 'newData.isNumber() && newData.val() >= 0' },
    /* vision = Google Vision 으로 «글자만» 뽑은 수 (2026-09-08).
       ⚠ n 에 합치지 말 것 — Gemini 는 «하루» 몫이고 Vision 은 «달마다» 1,000장이다.
         합치면 어느 쪽이 남았는지 알 수가 없다. */
    vision: { '.validate': 'newData.isNumber() && newData.val() >= 0' },
    $other: { '.validate': false }
  } }
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
