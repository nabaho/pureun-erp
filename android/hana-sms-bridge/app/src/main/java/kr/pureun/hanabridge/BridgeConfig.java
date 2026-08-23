package kr.pureun.hanabridge;

final class BridgeConfig {
    static final String ENDPOINT =
            "https://asia-northeast3-pureun-erp.cloudfunctions.net/hanaMessageBridge";

    static final String SAMSUNG_MESSAGES = "com.samsung.android.messaging";
    static final String GOOGLE_MESSAGES = "com.google.android.apps.messaging";

    private BridgeConfig() {}
}
