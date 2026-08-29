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

    /* ★ 「하나」를 알아보는 규칙 — 서버(functions/hana-message.js)와 «같아야» 한다.
       ⚠ 2026-08-29 에 잡은 일: 카드 문자는 「하나9950 승인 …」 처럼 «하나+숫자» 로 온다.
         예전에는 하나카드·하나은행·keb하나·「하나 」(하나+빈칸) 넷만 봤는데,
         「하나9950」 은 빈칸이 아니라 숫자가 붙어 그 어느 것에도 안 걸렸다.
         그래서 카드 문자는 «폰에서» 통째로 버려졌고, 서버는 아무것도 못 들었다 —
         화면에는 「연결 뒤 문자 0건」 으로만 보였다.
         서버는 2026-08-23 에 같은 문제를 고쳤는데(「서버가 조용히 버리고 있었다」)
         폰에는 그 고침이 안 왔다. 이제 양쪽 규칙을 맞춘다.
       ⚠ 여기를 고치면 tests/hana-phone-filter.test.js 가 서버와 견줘 본다. */
    private static final Pattern HANA = Pattern.compile(
            "하나\\s*카드|하나카드|하나\\s*은행|하나은행|하나\\s*뱅크|하나1q|keb\\s*하나|하나원큐" +
            "|하나\\s*\\d{3,4}\\s*(?:승인|취소)");

    static boolean isTransaction(String title, String text) {
        String value = ((title == null ? "" : title) + "\n" +
                (text == null ? "" : text)).toLowerCase(Locale.ROOT);
        for (String blocked : SECURITY) {
            if (value.contains(blocked)) return false;
        }
        boolean hana = HANA.matcher(value).find();
        boolean movement = value.contains("승인") || value.contains("취소") ||
                value.contains("입금") || value.contains("출금") || value.contains("이체");
        return hana && movement && MONEY.matcher(value).find() && DATE.matcher(value).find();
    }
}
