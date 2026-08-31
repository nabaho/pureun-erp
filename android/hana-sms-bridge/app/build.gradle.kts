plugins {
    id("com.android.application")
}

/* ★ 서명키를 «고정»한다 (대표 결정 2026-08-29: 「안전하게」).

   왜 필요한가: 안드로이드는 «같은 도장으로 서명된 앱»만 덮어쓰기를 허락한다.
   여태 CI 는 러너가 그때그때 만든 임시 debug 키로 서명해서 «빌드마다 도장이 달랐다».
   그래서 판을 올릴 때마다 지웠다 다시 깔아야 했고, 그때마다 폰 안의 연결정보가
   사라져 8자리 연결번호를 다시 넣어야 했다 (2026-08-29 대표: 「연결번호 계속 요청들어온다」).

   ⚠ 키는 «저장소에 두지 않는다». GitHub Secret 에 넣고 CI 가 파일로 풀어 준다.
     경로·비밀번호는 환경변수로만 들어온다 — 여기에 값을 적어 넣지 말 것.
   ⚠ 키가 없어도 «빌드는 된다»(옛날처럼 임시 키로 서명된다). 다만 그 APK 는
     덮어쓰기가 안 되므로, 조용히 넘어가지 말고 빌드 로그에 크게 적는다. */
val hanaStore: String? = System.getenv("HANA_KEYSTORE_FILE")
val hanaStorePw: String? = System.getenv("HANA_KEYSTORE_PASSWORD")
val hanaAlias: String? = System.getenv("HANA_KEY_ALIAS")
val hanaKeyPw: String? = System.getenv("HANA_KEY_PASSWORD")
val hanaFixedKey: Boolean =
    !hanaStore.isNullOrBlank() && file(hanaStore!!).exists() &&
    !hanaStorePw.isNullOrBlank() && !hanaAlias.isNullOrBlank() && !hanaKeyPw.isNullOrBlank()

println(
    if (hanaFixedKey) "[하나문자] 고정 서명키로 서명합니다 — 덮어쓰기 설치가 됩니다."
    else "[하나문자] ⚠ 고정 서명키가 없습니다 — 임시 키로 서명됩니다. " +
         "이 APK 는 «덮어쓰기 설치가 안 되고», 깔면 연결이 지워져 연결번호를 다시 넣어야 합니다. " +
         "GitHub Secret(HANA_KEYSTORE_B64 · HANA_KEYSTORE_PASSWORD · HANA_KEY_ALIAS · HANA_KEY_PASSWORD)을 넣어 주세요."
)

android {
    /* debug 서명만 바꾼다 — 빌드 자체는 여태와 «똑같이» assembleDebug 로 돈다.
       release 로 갈아타면 축소(minify)까지 함께 켜져 딴 것이 깨질 수 있다.
       지금 고치려는 것은 «도장 하나»뿐이다. */
    signingConfigs {
        getByName("debug") {
            if (hanaFixedKey) {
                storeFile = file(hanaStore!!)
                storePassword = hanaStorePw
                keyAlias = hanaAlias
                keyPassword = hanaKeyPw
            }
        }
    }
    namespace = "kr.pureun.hanabridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.pureun.hanabridge"
        minSdk = 26
        targetSdk = 35
        /* 올릴 때마다 «반드시» 올린다 — 폰에 이미 깔린 것과 견줘야
           「새로 깐 것이 맞나」를 앱 화면에서 가릴 수 있다.
           1.0.0 = 알림 다리 · 1.1.0 = 카드 문자 거르개 고침 + PC 붙여넣기
           1.2.0 = 지난 문자 가져오기 (2026-08-29)
           1.3.0 = 은행 입출금 문자를 폰에서 버리던 것 고침 (2026-08-29)
           1.5.0 = 훑기가 «권한이 없어 안 돈다»는 것을 화면에 크게 알림 (2026-08-30)
           1.6.0 = 연결되자마자 문자 읽기를 «바로» 묻는다 (2026-08-30)
           1.7.0 = 화면을 «한 번에 하나»로 — 설명 걷어내기 (2026-08-30)
           1.9.0 = 「못 읽었다」를 「0건」이라 말하던 것 고침 + 지난 문자 상한 300→3000 (2026-08-30)
           2.0.0 = 절전 예외 단추 — 훑기가 «한 번도» 안 돌던 것 + 판 번호를 모든 말에 실음 (2026-08-30)
           2.1.0 = 「눌렀다」를 반드시 서버에 알린다 — 찾을 것이 없으면 조용히 되돌아갔다 (2026-08-31)
           2.2.0 = 「절전이 풀렸나」를 폰이 직접 말한다 — 사람에게 두 번 묻고 두 번 못 받았다 (2026-08-31) */
        versionCode = 13
        versionName = "2.2.0"
    }

    /* 화면에 판 번호를 적으려면 BuildConfig 가 있어야 한다.
       AGP 8 부터는 켜 주지 않으면 안 만들어진다 — 안 켜면 그 자리에서 컴파일이 깨진다. */
    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.work:work-runtime:2.10.1")
}
