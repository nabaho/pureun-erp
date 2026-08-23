package kr.pureun.hanabridge;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.work.BackoffPolicy;
import androidx.work.Data;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public final class HanaNotificationListener extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !SecureStore.connected(this)) return;
        String packageName = sbn.getPackageName();
        if (!HanaMessageFilter.supportedPackage(packageName)) return;
        Bundle extras = sbn.getNotification().extras;
        String title = chars(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = bestText(extras);
        if (!HanaMessageFilter.isTransaction(title, text)) return;

        Data data = new Data.Builder()
                .putString("packageName", packageName)
                .putString("title", limit(title, 200))
                .putString("text", limit(text, 1200))
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(HanaUploadWorker.class)
                .setInputData(data)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(this).enqueue(request);
    }

    private static String bestText(Bundle extras) {
        String big = chars(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (!big.isEmpty()) return big;
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null && lines.length > 0) {
            StringBuilder value = new StringBuilder();
            for (CharSequence line : lines) {
                if (value.length() > 0) value.append('\n');
                value.append(chars(line));
            }
            if (value.length() > 0) return value.toString();
        }
        return chars(extras.getCharSequence(Notification.EXTRA_TEXT));
    }

    private static String chars(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static String limit(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }
}
