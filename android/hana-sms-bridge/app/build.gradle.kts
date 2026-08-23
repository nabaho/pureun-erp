plugins {
    id("com.android.application")
}

val hanaReleaseKeystorePath = System.getenv("HANA_RELEASE_KEYSTORE_PATH")
val hanaReleaseStorePassword = System.getenv("HANA_RELEASE_STORE_PASSWORD")
val hanaReleaseKeyAlias = System.getenv("HANA_RELEASE_KEY_ALIAS")
val hanaReleaseKeyPassword = System.getenv("HANA_RELEASE_KEY_PASSWORD")
val hasHanaReleaseSigning = listOf(
    hanaReleaseKeystorePath,
    hanaReleaseStorePassword,
    hanaReleaseKeyAlias,
    hanaReleaseKeyPassword
).all { !it.isNullOrBlank() }

android {
    namespace = "kr.pureun.hanabridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.pureun.hanabridge.s25"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.2"
    }

    signingConfigs {
        if (hasHanaReleaseSigning) {
            create("hanaRelease") {
                storeFile = file(hanaReleaseKeystorePath!!)
                storePassword = hanaReleaseStorePassword
                keyAlias = hanaReleaseKeyAlias
                keyPassword = hanaReleaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // 사내 배포 앱은 설치 안정성을 우선하고, GitHub Actions에서 정식 서명 여부를 검증합니다.
            isMinifyEnabled = false
            if (hasHanaReleaseSigning) {
                signingConfig = signingConfigs.getByName("hanaRelease")
            }
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
