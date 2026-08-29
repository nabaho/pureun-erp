plugins {
    id("com.android.application")
}

android {
    namespace = "kr.pureun.hanabridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.pureun.hanabridge"
        minSdk = 26
        targetSdk = 35
        /* 올릴 때마다 «반드시» 올린다 — 폰에 이미 깔린 것과 견줘야
           「새로 깐 것이 맞나」를 앱 화면에서 가릴 수 있다.
           1.0.0 = 알림 다리 · 1.1.0 = 카드 문자 거르개 고침 + PC 붙여넣기
           1.2.0 = 지난 문자 가져오기 (2026-08-29) */
        versionCode = 3
        versionName = "1.2.0"
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
