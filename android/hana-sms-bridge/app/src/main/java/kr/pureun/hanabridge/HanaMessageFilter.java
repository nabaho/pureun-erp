package kr.pureun.hanabridge;

import java.util.Locale;
import java.util.regex.Pattern;

final class HanaMessageFilter {
    private static final Pattern MONEY = Pattern.compile("\\d[\\d,]*\\s*원");
    private static final Pattern DATE = Pattern.compile("\\d{1,2}[./-]\\d{1,2}(?:\\s+\\d{1,2}:\\d{2})?");
    private static final String[] SECURITY = {
            "인증번호", "인증 번호", "otp", "일회용비밀번호", "일회용 비밀번호",
            "보안카드", "비밀번호", "로그인 승인", "본인확인", "본인 확인",
            "verification code", "authentication code"
    };

    private HanaMessageFilter() {}

    static boolean supportedPackage(String packageName) {
        return BridgeConfig.SAMSUNG_MESSAGES.equals(packageName) ||
                BridgeConfig.GOOGLE_MESSAGES.equals(packageName);
    }

    static boolean isTransaction(String title, String text) {
        String value = ((title == null ? "" : title) + "\n" +
                (text == null ? "" : text)).toLowerCase(Locale.ROOT);
        for (String blocked : SECURITY) {
            if (value.contains(blocked)) return false;
        }
        boolean hana = value.contains("하나카드") || value.contains("하나은행") ||
                value.contains("keb하나") || value.contains("하나 ");
        boolean movement = value.contains("승인") || value.contains("취소") ||
                value.contains("입금") || value.contains("출금") || value.contains("이체");
        return hana && movement && MONEY.matcher(value).find() && DATE.matcher(value).find();
    }
}
