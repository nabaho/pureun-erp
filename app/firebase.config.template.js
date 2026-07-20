// ============================================================
//  Firebase 연결 설정 — 템플릿 (3단계 3-6)
//  대표님이 Firebase 콘솔에서 만든 값을 아래에 붙여넣기만 하면 됩니다.
//  ※ 이 값들은 "공개 설정값"이라 비밀이 아닙니다(보안은 규칙으로).
//  ※ 실제 사용 시 파일명을 firebase.config.js 로 복사해서 값 채우기.
// ============================================================

// [개발용 프로젝트] 예: pu-payroll-dev
window.FIREBASE_CONFIG_DEV = {
  apiKey:            "여기에_붙여넣기",
  authDomain:        "pu-payroll-dev.firebaseapp.com",
  databaseURL:       "https://pu-payroll-dev-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "pu-payroll-dev",
  storageBucket:     "pu-payroll-dev.appspot.com",
  messagingSenderId: "여기에_붙여넣기",
  appId:             "여기에_붙여넣기"
};

// [운영용 프로젝트] 예: pu-payroll
window.FIREBASE_CONFIG_PROD = {
  apiKey:            "여기에_붙여넣기",
  authDomain:        "pu-payroll.firebaseapp.com",
  databaseURL:       "https://pu-payroll-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "pu-payroll",
  storageBucket:     "pu-payroll.appspot.com",
  messagingSenderId: "여기에_붙여넣기",
  appId:             "여기에_붙여넣기"
};

// 값을 채운 뒤 저에게 알려주시면:
//  1) payroll_app.html 의 dbGet/dbSet 내부를 Firebase RTDB 호출로 교체
//  2) 구글 로그인 연결(권한 2단계)
//  3) firebase.rules.json 을 콘솔 규칙에 업로드
// 하면 서버 연동이 완료됩니다. (화면·로직은 그대로)
