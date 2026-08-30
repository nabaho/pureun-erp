package kr.pureun.hanabridge;

final class BridgeConfig {
    static final String ENDPOINT =
            "https://asia-northeast3-pureun-erp.cloudfunctions.net/hanaMessageBridge";

    /* ⚠ build.gradle.kts 의 versionName 과 «같아야» 한다 —
       tests/hana-sweep.test.js 가 어긋나면 잡는다.
       한쪽만 올리면 폰이 거짓 판 번호를 보내고, 그것을 믿고 엉뚱한 데를 뒤진다. */
    static final String APP_VERSION = "1.9.0";

    static final String SAMSUNG_MESSAGES = "com.samsung.android.messaging";
    static final String GOOGLE_MESSAGES = "com.google.android.apps.messaging";

    private BridgeConfig() {}
}
