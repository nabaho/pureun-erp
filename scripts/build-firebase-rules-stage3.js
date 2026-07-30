const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const basePath = path.join(root, 'docs', 'firebase-rules-2순위-권한잠금.json');
const outPath = path.join(root, 'docs', 'firebase-rules-3순위-포털권한.json');
const doc = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const rules = doc.rules;

const signedIn = "auth != null && auth.token.firebase.sign_in_provider === 'password'";
const isAdmin = "root.child('uid_roles').child(auth.uid).child('isAdmin').val() == true";
const isSubAdmin = "root.child('uid_roles').child(auth.uid).child('isSubAdmin').val() == true";
const isManager = `auth != null && (${isAdmin} || ${isSubAdmin})`;

// 모든 권한성 필드는 관리자가 사전 등록한다. 일반 사용자는 기존값 유지 또는 false만 가능하다.
const lockedBoolean =
  `${isAdmin} || newData.val() === false || (data.exists() && newData.val() === data.val())`;
for (const field of ['fin', 'hr', 'isAdmin', 'isSubAdmin', 'isFullViewer']) {
  rules.uid_roles.$uid[field] = { '.validate': lockedBoolean };
}
const lockedIdentity = `${isAdmin} || (data.exists() && newData.val() === data.val())`;
for (const field of ['sid', 'role', 'status']) {
  rules.uid_roles.$uid[field] = { '.validate': lockedIdentity };
}

// 개인 포털 설정: UID 소유자만 접근.
rules.data.portal_prefs_uid = {
  '$uid': {
    '.read': 'auth != null && auth.uid === $uid',
    '.write': 'auth != null && auth.uid === $uid',
  },
};

// 건의 원문: 로그인 사용자는 읽을 수 있고, 작성자는 신규 등록만 가능하다.
// 이후 상태·답변·삭제는 관리자만 가능하다.
rules.data.suggestions = {
  '.read': signedIn,
  '.indexOn': ['createdAt'],
  '$id': {
    '.write':
      `${signedIn} && (` +
      `${isAdmin} || (` +
      `!data.exists() && newData.child('authorUid').val() === auth.uid && ` +
      `newData.child('status').val() === 'new'` +
      `))`,
    '.validate':
      "!newData.exists() || newData.hasChildren(['cat','title','content','author','authorEmail','authorUid','status','createdAt'])",
    cat: {
      '.validate':
        "newData.isString() && newData.val().matches(/^(erp|consult|work|fund|rules|payroll|cards|docs|portal|bizwork|policy|edu|office|hrwelf|etc)$/)",
    },
    title: {
      '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 200',
    },
    content: {
      '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 10000',
    },
    authorUid: {
      '.validate': `${isAdmin} || newData.val() === auth.uid`,
    },
    status: {
      '.validate': "newData.isString() && newData.val().matches(/^(new|ing|done)$/)",
    },
  },
};

// 건의 목록용 경량 메타도 원문과 같은 작성·관리 경계를 적용한다.
rules.data.sg_meta = {
  '.read': signedIn,
  '$id': {
    '.write':
      `${signedIn} && (` +
      `${isAdmin} || (` +
      `!data.exists() && newData.child('authorUid').val() === auth.uid && ` +
      `newData.child('status').val() === 'new'` +
      `))`,
    '.validate':
      "!newData.exists() || newData.hasChildren(['author','authorEmail','authorUid','status','cat','title','createdAt'])",
    authorUid: {
      '.validate': `${isAdmin} || newData.val() === auth.uid`,
    },
    status: {
      '.validate': "newData.isString() && newData.val().matches(/^(new|ing|done)$/)",
    },
  },
};

// 해결 알림: 대상 사용자와 관리자만 접근.
rules.data.sg_resolved_uid = {
  '$uid': {
    '.read': `auth != null && (auth.uid === $uid || ${isAdmin})`,
    '.write': `auth != null && (auth.uid === $uid || ${isAdmin})`,
  },
};

// 구 경로는 UID 자동 이전 기간 동안만 유지한다.
// 데이터 이전 확인 후 4차 규칙에서 제거한다.
rules.data.portal_prefs = {
  '.read': signedIn,
  '.write': signedIn,
};
rules.data.sg_resolved = {
  '.read': signedIn,
  '.write': signedIn,
};

// 백업은 실제 생성 주체인 관리자·위임관리인에게만 허용한다.
for (const rootKey of [
  'serverBackups',
  'serverBackupsIndex',
  'serverBackupsRecent',
  'serverBackupsRecentIndex',
]) {
  rules[rootKey] = {
    '.read': isManager,
    '.write': isManager,
  };
}

const output = `${JSON.stringify(doc, null, 2)}\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(outPath, output, 'utf8');
  console.log(outPath);
} else {
  process.stdout.write(output);
}

