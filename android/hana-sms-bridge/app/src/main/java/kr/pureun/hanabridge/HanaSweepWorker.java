package kr.pureun.hanabridge;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.PowerManager;

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

    /* 절전 예외가 되어 있나 — 안 되어 있으면 이 훑기가 무기한 미뤄진다.
       ⚠ 못 물어봤으면 «된 것»으로 친다. 알 수 없는 것으로 화면이 겁주면 안 된다. */
    static boolean batteryFree(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            return pm == null || pm.isIgnoringBatteryOptimizations(context.getPackageName());
        } catch (Exception unknown) {
            return true;
        }
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

        int sent = 0, already = 0, failed = 0, foundCount = 0;
        /* ★★ 「폰에 하나 문자가 있기는 한가」 — 폰만 아는 것이라 폰이 말해야 한다.
           2026-08-30 에 대기함이 비었을 때 «폰이 못 보낸 것»인지 «폰에 아예 없는 것»인지
           가릴 길이 없어 하루를 헤맸다. 고칠 곳이 아주 다른데도 그랬다 —
           앞은 앱·권한 문제이고, 뒤는 은행 문자가 안 오는 것이다. */
        long newestAt = 0L;
        boolean canRead = context.checkSelfPermission(Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;

        /* ★★ 「봤는데 없다」와 「못 봤다」는 «다른 말»이다 (코덱스 지적 2026-08-30).
             예전에는 문자함 조회가 튕겨도 foundCount 가 0 으로 나갔고,
             화면은 그걸 「폰에 하나 문자가 아예 없습니다」로 단정해 읽었다.
             그러면 대표는 은행 쪽을 뒤지게 된다 — 정작 고칠 곳은 폰인데. */
        boolean readOk = false;
        boolean capped = false;

        if (canRead) {
            List<SmsHistoryReader.Item> found;
            try {
                found = SmsHistoryReader.recent(context, SWEEP_DAYS, System.currentTimeMillis());
            } catch (Exception unreadable) {
                found = null;
            }
            readOk = found != null && !SmsHistoryReader.lastFailed;
            capped = SmsHistoryReader.lastCapped;
            if (found != null) {
                foundCount = found.size();
                for (SmsHistoryReader.Item item : found) {
                    if (item.receivedAt > newestAt) newestAt = item.receivedAt;
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
            /* ⚠ 판 번호를 «반드시» 보낸다 — 이것이 없어서 2026-08-30 에
               「새 앱을 깔긴 하신 건가」를 물어볼 수조차 없었다. */
            ping.put("appVersion", BridgeConfig.APP_VERSION);
            /* 폰이 문자함에서 «본» 것. 0 이면 폰에 하나 문자가 아예 없다는 뜻이다 —
               그때는 앱을 아무리 고쳐도 소용없고, 은행 문자 쪽을 봐야 한다.
               ⚠ 단, 그 말은 readOk 가 참일 때만 할 수 있다. */
            ping.put("foundCount", foundCount);
            /* ★ 「문자함을 끝까지 읽었나」. 거짓이면 foundCount 0 은 «모름»이다. */
            ping.put("readOk", readOk);
            /* 절전이 풀렸나 — 이 훑기가 «돌기는 했다»는 뜻이므로 대개 참이지만,
               한 번 돌고 다시 재워지는 폰도 있어 그대로 적어 둔다. */
            ping.put("batteryFree", batteryFree(context));
            /* ★ 상한(MAX_MESSAGES)에 닿았나 — 닿았으면 더 오래된 거래가 남아 있다. */
            ping.put("capped", capped);
            ping.put("newestAt", newestAt);
            HanaUploadWorker.post(ping, token);
        } catch (Exception error) {
            /* 알림 한 번 못 보낸 것으로 다시 시도하지는 않는다 — 15분 뒤에 또 온다. */
            return Result.success();
        }

        if (!canRead) {
            SecureStore.setLastStatus(context, "문자함 읽기 권한이 없어 훑지 못했습니다. 앱을 열어 「지난 문자 가져오기」를 한 번 눌러 주세요.");
        } else if (!readOk) {
            /* ⚠ 여기를 «0건»으로 말하면 안 된다 — 세어 보지도 못한 것이다. */
            SecureStore.setLastStatus(context, "문자함을 읽지 못했습니다. 폰을 한 번 껐다 켠 뒤 앱을 열어 주세요.");
        } else if (sent > 0) {
            SecureStore.setLastStatus(context, "문자함을 훑어 " + sent + "건을 보냈습니다."
                    + (failed > 0 ? " (실패 " + failed + "건 — 다음에 다시 보냅니다)" : ""));
        }
        return Result.success();
    }
}
