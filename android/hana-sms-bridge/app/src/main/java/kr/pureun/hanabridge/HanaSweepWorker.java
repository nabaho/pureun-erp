package kr.pureun.hanabridge;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.TimeUnit;

/* 문자함을 «스스로» 훑는다 — 알림에만 기대지 않는다 (2026-08-30).

   ■ 왜 만들었나
     이 앱은 여태 «알림»만 엿들었다(HanaNotificationListener).
     그런데 2026-08-29 밤에 연결한 뒤 하루가 지나도록 서버는 폰에게서
     «살아 있는 문자»를 한 통도 못 받았다 — lastOkAt 이 아예 비어 있었다.
     지난 문자 가져오기는 됐으니 열쇠도 그물도 멀쩡했다. 알림만 안 왔다.

   ★ 알림은 끊어질 구석이 너무 많다:
       · 앱을 다시 깔면 「알림 접근」 권한이 «꺼진다»
       · 절전이 서비스를 재운다
       · 방해금지·알림 끄기면 아예 안 뜬다
       · 알림을 손으로 지운 뒤 온 것은 되찾을 길이 없다
     그중 하나만 걸려도 사람 눈에는 「그냥 안 들어온다」로만 보인다.

   ■ 그래서
     15분마다 문자함을 훑어 최근 것을 보낸다. 알림은 «빠른 길»로 남고,
     이 훑기가 «놓친 것을 반드시 줍는 길»이 된다.

   ⚠ 같은 문자를 또 보내는 것은 괜찮다 — 서버가 원문 해시(rawHash)로
     막는다(2026-08-29에 넣었다). 그 막이가 없었다면 이 방법은 못 썼다.
   ⚠ 찾은 것이 없어도 «반드시» 서버에 한 번 알린다.
     그래야 「폰이 조용한 것」과 「문자가 없는 것」을 가를 수 있다 —
     이번에 대표가 「안 들어온다」고 했을 때 그것을 못 갈라 하루를 잃었다.
   ⚠ 문자 원문은 이 앱에 남기지 않는다 — 읽어서 곧바로 넘기고 버린다. */
public final class HanaSweepWorker extends Worker {
    /* 안드로이드가 허락하는 가장 짧은 되풀이가 15분이다. 더 짧게 적어도 15분이 된다. */
    static final long PERIOD_MINUTES = 15L;

    /* 얼마나 거슬러 보나 — 훑기가 15분마다 도니 이틀이면 넉넉하다.
       ⚠ 넓게 잡을수록 매번 읽고 보내는 양이 는다. 서버가 중복을 막아 주지만
         폰 배터리와 통신은 공짜가 아니다. 놓친 것을 줍기에는 이틀이면 충분하다
         (폰이 이틀 넘게 꺼져 있었다면 「지난 문자 가져오기」를 누르는 편이 맞다). */
    static final int SWEEP_DAYS = 2;

    private static final String UNIQUE_NAME = "hana-sms-sweep";

    public HanaSweepWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /* 훑기를 걸어 둔다. 이미 걸려 있으면 그대로 둔다(KEEP) —
       REPLACE 로 두면 앱을 열 때마다 시계가 처음부터 다시 가서 영영 안 돈다. */
    static void schedule(Context context) {
        Constraints only = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(
                HanaSweepWorker.class, PERIOD_MINUTES, TimeUnit.MINUTES)
                .setConstraints(only)
                .build();
        WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, work);
    }

    static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!SecureStore.connected(context)) {
            cancel(context);
            return Result.success();
        }
        String uid = SecureStore.uid(context);
        String token = SecureStore.token(context);
        if (uid.isEmpty() || token.isEmpty()) return Result.success();

        int sent = 0, already = 0, failed = 0;
        boolean canRead = context.checkSelfPermission(Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;

        if (canRead) {
            List<SmsHistoryReader.Item> found;
            try {
                found = SmsHistoryReader.recent(context, SWEEP_DAYS, System.currentTimeMillis());
            } catch (Exception unreadable) {
                found = null;
            }
            if (found != null) {
                for (SmsHistoryReader.Item item : found) {
                    try {
                        JSONObject body = new JSONObject();
                        body.put("action", "ingest");
                        body.put("uid", uid);
                        body.put("deviceId", SecureStore.deviceId(context));
                        /* ★ 「스스로 훑어 왔다」고 밝힌다. 알림이 아니므로 꾸러미 이름이 없고,
                             서버는 이 표를 보고 lastSweepAt 을 찍는다 —
                             알림이 도는 것(lastOkAt)과는 다른 말이다. */
                        body.put("source", "sweep");
                        body.put("packageName", "");
                        body.put("title", item.address);
                        body.put("text", item.body);
                        JSONObject response = HanaUploadWorker.post(body, token);
                        if (response.optBoolean("saved")) sent++;
                        else if (response.optBoolean("duplicate")) already++;
                    } catch (Exception error) {
                        failed++;
                    }
                }
            }
        }

        /* ⚠★ 찾은 것이 없어도 «반드시» 알린다.
           이것이 없으면 서버는 「폰이 죽었다」와 「문자가 안 왔다」를 못 가른다.
           그 둘을 못 가른 탓에 대표에게 「알림 권한을 다시 보세요」밖에 할 말이 없었다. */
        try {
            JSONObject ping = new JSONObject();
            ping.put("action", "sweepPing");
            ping.put("uid", uid);
            ping.put("deviceId", SecureStore.deviceId(context));
            ping.put("canReadSms", canRead);
            HanaUploadWorker.post(ping, token);
        } catch (Exception error) {
            /* 알림 한 번 못 보낸 것으로 다시 시도하지는 않는다 — 15분 뒤에 또 온다. */
            return Result.success();
        }

        if (!canRead) {
            SecureStore.setLastStatus(context, "문자함 읽기 권한이 없어 훑지 못했습니다. 앱을 열어 「지난 문자 가져오기」를 한 번 눌러 주세요.");
        } else if (sent > 0) {
            SecureStore.setLastStatus(context, "문자함을 훑어 " + sent + "건을 보냈습니다."
                    + (failed > 0 ? " (실패 " + failed + "건 — 다음에 다시 보냅니다)" : ""));
        }
        return Result.success();
    }
}
