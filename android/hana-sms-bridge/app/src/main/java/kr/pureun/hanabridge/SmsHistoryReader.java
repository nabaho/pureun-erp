package kr.pureun.hanabridge;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

import java.util.ArrayList;
import java.util.List;

/* 폰 «문자함»에 이미 쌓여 있는 지난 문자를 읽는다 (대표 지시 2026-08-29).

   왜 필요한가: 이 앱은 «알림»을 엿듣는다. 알림은 지나가면 사라지므로,
   앱을 깔기 «전»에 온 문자는 아무리 기다려도 오지 않는다.
   대표 물음이 그것이었다 — 「이미 문자로 온 거 확인할 수 없나, 최근 1개월」.

   ★ 알아보는 규칙은 HanaMessageFilter «하나»를 쓴다. 여기에 따로 적으면
     알림 길과 문자함 길이 서로 다른 것을 걸러 내게 된다 — 2026-08-29 에
     폰과 서버가 갈라져 카드 문자를 통째로 버린 사고가 바로 그것이었다.
   ⚠ 문자 원문은 이 앱에 남기지 않는다. 읽어서 곧바로 다리로 넘기고 버린다. */
final class SmsHistoryReader {
    /* 한 번에 너무 많이 올리지 않는다 — 문자함에 수천 통이 있는 폰이 있다.
       거른 뒤(하나 거래문자만) 남는 것은 보통 한 달에 수십 통이다. */
    static final int MAX_MESSAGES = 300;

    private SmsHistoryReader() {}

    static final class Item {
        final String address;
        final String body;
        final long receivedAt;

        Item(String address, String body, long receivedAt) {
            this.address = address;
            this.body = body;
            this.receivedAt = receivedAt;
        }
    }

    static long cutoffFor(int days, long now) {
        return now - (long) days * 24L * 60L * 60L * 1000L;
    }

    /* 최근 days 일치 «하나 거래문자»만 골라 새것부터 돌려준다. */
    static List<Item> recent(Context context, int days, long now) {
        List<Item> out = new ArrayList<>();
        /* ⚠ 기간을 반드시 건다. 조건 없이 읽으면 몇 해치 문자를 전부 훑는다. */
        long cutoff = cutoffFor(days, now);
        Uri inbox = Telephony.Sms.Inbox.CONTENT_URI;
        String[] columns = { Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE };
        try (Cursor cursor = context.getContentResolver().query(
                inbox, columns,
                Telephony.Sms.DATE + " >= ?", new String[]{ String.valueOf(cutoff) },
                Telephony.Sms.DATE + " DESC")) {
            if (cursor == null) return out;
            int addressAt = cursor.getColumnIndex(Telephony.Sms.ADDRESS);
            int bodyAt = cursor.getColumnIndex(Telephony.Sms.BODY);
            int dateAt = cursor.getColumnIndex(Telephony.Sms.DATE);
            while (cursor.moveToNext() && out.size() < MAX_MESSAGES) {
                String address = addressAt < 0 ? "" : safe(cursor.getString(addressAt));
                String body = bodyAt < 0 ? "" : safe(cursor.getString(bodyAt));
                long at = dateAt < 0 ? 0L : cursor.getLong(dateAt);
                /* ★ 알림 길과 «같은» 잣대. 보낸 번호를 제목 자리에 둔다 —
                   알림에서도 제목+본문을 함께 보기 때문이다. */
                if (!HanaMessageFilter.isTransaction(address, body)) continue;
                out.add(new Item(address, body, at));
            }
        }
        return out;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
