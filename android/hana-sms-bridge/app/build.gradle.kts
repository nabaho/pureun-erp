plugins {
    id("com.android.application")
}

android {
    namespace = "kr.pureun.hanabridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.pureun.hanabridge.s25"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1"
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
