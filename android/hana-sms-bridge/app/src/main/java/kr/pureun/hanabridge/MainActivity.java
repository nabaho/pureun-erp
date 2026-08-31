package kr.pureun.hanabridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputFilter;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    /* 지난 문자 가져오기 — 최근 며칠치를 볼 것인가 (대표 지시 2026-08-29: 「최근 1개월」) */
    static final int HISTORY_DAYS = 30;
    private static final int ASK_READ_SMS = 4301;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView status;
    private EditText code;
    private Button connect;
    private Button history;
    /* 훑기가 «돌지 않는다»는 것을 크게 알리는 자리 — 조용한 실패를 시끄럽게 만든다 */
    private TextView sweepWarn;
    /* 「한 번에 하나만」을 위한 조각들 (대표 2026-08-30) */
    private LinearLayout stepPair;   // 번호칸 + 연결하기
    private Button grantSms;         // 문자 읽기 켜기
    private Button battery;          // 절전 예외로 두기 (없으면 15분 훑기가 안 돈다)
    private Button more;             // ⋯ 더보기
    private LinearLayout moreBox;    // 평소엔 쓸 일 없는 것들
    private boolean moreOpen = false;
    /* ⚠ 권한 창이 닫히면 onResume → refresh() 가 돈다. 그때 가져오는 중이면
         화면 글이 지워지고 단추가 다시 눌리게 된다 — 두 번 돌지 않게 막는다. */
    private volatile boolean importing = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildView());
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
        /* ★ 훑기를 걸어 둔다 (2026-08-30). 알림이 막혀도 15분마다 문자함을 줍는다.
           ⚠ 앱을 열 때마다 부르는 까닭: WorkManager 예약은 앱을 다시 깔면 사라진다.
             KEEP 이라 이미 걸려 있으면 그대로 둔다 — 열 때마다 시계를 되감지 않는다.
           ⚠ 연결 안 된 폰에는 안 건다 — 보낼 곳이 없다. */
        if (SecureStore.connected(this)) HanaSweepWorker.schedule(this);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    /* ══ 화면은 «한 번에 하나»만 보여 준다 (대표 2026-08-30) ══════════════════
       「폰에서 팝업과 다운 번호 입력등을 아주 쉽고 연결되기 쉽게 해라
         그리고 불필요한 설명 모두 없애라」

       고치기 전에는 한 화면에 단추 넷·안내글 넉 덩이가 늘 함께 떠 있었다.
       연결도 안 된 사람에게 「지난 문자 가져오기」와 「연결정보 지우기」가 같이 보였고,
       보안 안내 여덟 줄이 화면 절반을 먹었다. 무엇부터 눌러야 할지 알 수 없다.

       ★ 이제 지금 «하실 일 하나»만 큰 단추로 낸다.
         ① 연결 안 됨      → 번호칸 + 「연결하기」
         ② 연결됨·권한 없음 → 「문자 읽기 켜기」
         ③ 다 됨           → 「● 다 됐습니다」 + 지난 문자 가져오기(작게)
       나머지(알림 접근·연결 지우기·보안 안내)는 「⋯ 더보기」 뒤로 넣는다 —
       ⚠ 지우지 «않는다». 보안 안내는 사실이라 어디엔가는 있어야 한다. */
    private ScrollView buildView() {
        int pad = dp(20);
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView title = text("푸른 하나문자", 24, Color.rgb(30, 58, 138));
        title.setTypeface(null, 1);
        root.addView(title);
        /* 지금 어떤 상태인가 — 한 줄 */
        status = text("", 16, Color.DKGRAY);
        status.setPadding(0, dp(8), 0, dp(18));
        root.addView(status, matchWrap());

        /* ── ① 연결 (연결 안 됐을 때만) ── */
        stepPair = new LinearLayout(this);
        stepPair.setOrientation(LinearLayout.VERTICAL);
        root.addView(stepPair, matchWrap());

        code = new EditText(this);
        code.setHint("8자리 숫자");
        code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(8)});
        code.setTextSize(30);
        code.setGravity(Gravity.CENTER);
        stepPair.addView(code, matchWrap());

        connect = button("연결하기", Color.rgb(37, 99, 235));
        connect.setTextSize(17);
        connect.setMinHeight(dp(58));
        connect.setOnClickListener(v -> pair());
        stepPair.addView(connect, withTop(matchWrap(), 10));

        /* 대표가 「어디에 있나」를 물은 자리다 — 폰 앱이 스스로 답한다 */
        TextView where = text("번호는 PC 푸른이알피 → 재무관리 → 거래내역 → 📱 하나문자 → 🔗 휴대폰 연결", 13, Color.rgb(100, 116, 139));
        where.setPadding(dp(2), dp(10), dp(2), 0);
        stepPair.addView(where);

        /* ── ② 문자 읽기 켜기 (연결됐는데 권한 없을 때만) ── */
        sweepWarn = text("", 15, Color.rgb(146, 64, 14));
        sweepWarn.setBackgroundColor(Color.rgb(255, 251, 235));
        sweepWarn.setPadding(dp(14), dp(14), dp(14), dp(12));
        root.addView(sweepWarn, matchWrap());

        grantSms = button("문자 읽기 켜기", Color.rgb(180, 83, 9));
        grantSms.setTextSize(17);
        grantSms.setMinHeight(dp(58));
        grantSms.setOnClickListener(v -> askThenImport());
        root.addView(grantSms, withTop(matchWrap(), 8));

        /* ── ②-b 절전 예외 (2026-08-30) ──
           문자 읽기까지 켰는데도 15분 훑기가 «한 번도» 안 도는 폰이 있다.
           절전이 WorkManager 를 무기한 미루기 때문이다 — 앱도 권한도 멀쩡한데
           그렇다. 20:42 에 연결한 폰이 두 시간 가까이 안 훑은 것이 그 경우다.
           ⚠ 설명으로 적어 두는 것으로는 아무도 안 한다(예전엔 안내글만 있었다).
             지금 안 되어 있을 때만 «단추 하나»로 낸다. */
        battery = button("절전 예외로 두기", Color.rgb(190, 24, 93));
        battery.setTextSize(17);
        battery.setMinHeight(dp(58));
        battery.setOnClickListener(v -> askBattery());
        root.addView(battery, withTop(matchWrap(), 8));

        /* ── ③ 다 됐을 때 — 가끔 쓰는 것 하나만 ── */
        history = button("지난 문자 가져오기", Color.rgb(100, 116, 139));
        history.setOnClickListener(v -> askThenImport());
        root.addView(history, withTop(matchWrap(), 8));

        /* ── ⋯ 더보기 — 평소에 쓸 일 없는 것들 ── */
        more = button("⋯ 더보기", Color.rgb(148, 163, 184));
        more.setTextSize(13);
        more.setMinHeight(dp(42));
        more.setOnClickListener(v -> {
            moreOpen = !moreOpen;
            moreBox.setVisibility(moreOpen ? android.view.View.VISIBLE : android.view.View.GONE);
            more.setText(moreOpen ? "⋯ 접기" : "⋯ 더보기");
        });
        root.addView(more, withTop(matchWrap(), 22));

        moreBox = new LinearLayout(this);
        moreBox.setOrientation(LinearLayout.VERTICAL);
        moreBox.setVisibility(android.view.View.GONE);
        root.addView(moreBox, matchWrap());

        Button access = button("알림 접근 허용", Color.rgb(21, 128, 61));
        access.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        moreBox.addView(access, withTop(matchWrap(), 8));

        Button clear = button("연결 지우기", Color.rgb(100, 116, 139));
        clear.setOnClickListener(v -> {
            SecureStore.clearConnection(this);
            /* ⚠ 훑기도 함께 멈춘다 — 안 멈추면 연결을 지운 폰이 15분마다 서버를 두드린다. */
            HanaSweepWorker.cancel(this);
            SecureStore.setLastStatus(this, "연결을 지웠습니다.");
            refresh();
        });
        moreBox.addView(clear, withTop(matchWrap(), 8));

        /* ⚠ 예전에는 「문자 읽기 권한은 사용하지 않습니다」라고 적혀 있었다.
             지난 문자 가져오기를 넣으면서 그 말이 «거짓»이 되었다 —
             화면의 약속과 앱이 하는 일이 어긋나면 그 안내는 안 하느니만 못하다.
             언제 쓰는지까지 그대로 적는다. */
        /* ⚠ 「15분마다 훑습니다」라고 잘라 적었더니 «권한이 없을 때는 거짓»이 됐다.
             훑기는 문자 읽기 권한이 있어야만 돈다(HanaSweepWorker: if (canRead)).
             화면의 약속과 하는 일이 어긋나면 그 안내는 안 하느니만 못하다 —
             2026-08-30 「문자 안 온다」가 정확히 이 자리에서 났다. */
        TextView security = text("• 하나 거래문자만 골라 보냅니다.\n"
                + "• 문자 읽기를 켜면 " + HanaSweepWorker.PERIOD_MINUTES + "분마다 문자함도 훑습니다 (켜기 전에는 안 훑습니다).\n"
                + "• 인증번호·비밀번호는 보내지 않습니다.\n"
                + "• 서버에 문자 원문은 저장하지 않습니다.\n"
                + "앱 판 " + BuildConfig.VERSION_NAME, 12, Color.rgb(100, 116, 139));
        security.setPadding(dp(12), dp(12), dp(12), dp(12));
        security.setBackgroundColor(Color.rgb(248, 250, 252));
        moreBox.addView(security, withTop(matchWrap(), 12));
        return scroll;
    }

    private void pair() {
        String pairCode = code.getText().toString().replaceAll("\\D", "");
        if (pairCode.length() != 8) {
            Toast.makeText(this, "8자리 연결번호를 입력해 주세요.", Toast.LENGTH_SHORT).show();
            return;
        }
        connect.setEnabled(false);
        status.setText("연결하는 중입니다…");
        executor.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("action", "pairClaim");
                body.put("code", pairCode);
                body.put("deviceId", SecureStore.deviceId(this));
                body.put("deviceName", "권형하 휴대폰");
                JSONObject response = HanaUploadWorker.post(body, "");
                SecureStore.saveConnection(this,
                        response.getString("uid"), response.getString("deviceToken"));
                SecureStore.setLastStatus(this, "연결 완료 — 하나 거래 알림을 기다리고 있습니다.");
                HanaSweepWorker.schedule(this);
                runOnUiThread(() -> {
                    code.setText("");
                    refresh();
                    Toast.makeText(this, "연결되었습니다. 알림 접근을 허용해 주세요.", Toast.LENGTH_LONG).show();
                    /* ★★ 연결되자마자 문자 읽기를 «바로» 묻는다 (2026-08-30 대표: 「휴대폰
                         문자 연결할 수 있게 해라」 — 연결은 됐는데 문자가 0건이었다).
                       왜 여기인가: 15분 훑기는 이 권한이 있어야만 돈다. 그런데 여태는
                       「지난 문자 가져오기」를 눌러야만 물어봤고, 그 한 번을 안 누르면
                       훑기가 조용히 아무것도 안 했다 — 연결만 해 놓고 며칠을 기다린 것이
                       그래서다. 방금 «스스로 연결한» 참이라 무엇에 쓰는 권한인지도 가장 분명하다.
                       ⚠ 거절해도 앱은 그대로 돈다(알림 길은 이 권한과 무관). 거절하면
                         화면에 노란 띠가 남아 언제든 다시 켤 수 있다. */
                    askThenImport();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    status.setText("연결하지 못했습니다. ERP에서 새 연결번호를 받아 다시 입력해 주세요.");
                    connect.setEnabled(true);
                });
            }
        });
    }

    /* ── 지난 문자 가져오기 ────────────────────────────────────────────
       권한 창은 «누를 때» 뜬다. 앱을 열자마자 물으면 무엇에 쓰는지 모른 채
       거절하게 되고, 한 번 거절하면 다시 묻기가 번거로워진다. */
    private void askThenImport() {
        if (!SecureStore.connected(this)) {
            Toast.makeText(this, "먼저 연결번호로 연결해 주세요.", Toast.LENGTH_LONG).show();
            return;
        }
        if (checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.READ_SMS }, ASK_READ_SMS);
            return;
        }
        importHistory();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != ASK_READ_SMS) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            importHistory();
        } else {
            /* 거절해도 앱은 그대로 돈다 — 알림 길은 이 권한과 상관이 없다. */
            status.setText("문자함을 못 읽어 지난 문자는 가져오지 못했습니다.\n새로 오는 문자는 그대로 보냅니다.");
        }
    }

    /* ★★ 「눌렀다」는 것을 «반드시» 서버에 알린다 (2026-08-31).
         2026-08-31 아침에 이 자리에서 하루를 잃을 뻔했다 — 대표가 단추를 눌렀는데
         서버 기록이 꿈쩍도 안 했다. 찾을 것이 없거나 문자함을 못 열면 아래 갈래들이
         «그냥 되돌아갔고», 서버는 아무것도 못 들었다. 그러면 판 번호도, 권한 상태도,
         「사람이 눌렀다」는 사실도 영영 안 올라온다 — 정작 그때가 가장 궁금한 때다.

       ⚠ lastSweepAt 은 찍지 않는다(byHand). 그것은 「폰이 «스스로» 15분마다 돈다」는
         뜻이라, 사람이 누른 것으로 찍으면 절전에 재워진 폰이 멀쩡해 보인다. */
    private void tellServer(boolean canRead, int foundCount, boolean readOk, boolean capped) {
        try {
            if (!SecureStore.connected(this)) return;
            JSONObject ping = new JSONObject();
            ping.put("action", "sweepPing");
            ping.put("uid", SecureStore.uid(this));
            ping.put("deviceId", SecureStore.deviceId(this));
            ping.put("byHand", true);          /* 사람이 눌렀다 — 스스로 돈 것이 아니다 */
            ping.put("canReadSms", canRead);
            ping.put("foundCount", foundCount);
            ping.put("readOk", readOk);
            ping.put("capped", capped);
            HanaUploadWorker.post(ping, SecureStore.token(this));
        } catch (Exception ignored) {
            /* 알리기 하나 실패했다고 가져오기를 막지 않는다 */
        }
    }

    private void importHistory() {
        if (importing) return;
        importing = true;
        history.setEnabled(false);
        status.setText("문자함에서 지난 " + HISTORY_DAYS + "일치를 찾는 중입니다…");
        executor.execute(() -> {
            boolean canRead = checkSelfPermission(Manifest.permission.READ_SMS)
                    == PackageManager.PERMISSION_GRANTED;
            List<SmsHistoryReader.Item> found;
            try {
                found = SmsHistoryReader.recent(this, HISTORY_DAYS, System.currentTimeMillis());
            } catch (Exception error) {
                tellServer(canRead, 0, false, false);
                importing = false;
                runOnUiThread(() -> {
                    status.setText("문자함을 읽지 못했습니다.");
                    history.setEnabled(true);
                });
                return;
            }
            /* ⚠★ 문자함을 «열지도 못한» 경우가 있다 — 그때 0통은 「없다」가 아니라
                 「모른다」다. 예전에는 둘을 같은 말로 알려 「문자를 지우셨나」를
                 물었고, 대표는 멀쩡한 문자함을 뒤졌다 (코덱스 지적 2026-08-30). */
            if (SmsHistoryReader.lastFailed) {
                tellServer(canRead, 0, false, SmsHistoryReader.lastCapped);
                importing = false;
                runOnUiThread(() -> {
                    status.setText("문자함을 읽지 못했습니다.\n" +
                            "문자가 없는 것이 아니라 열지 못한 것입니다 — 폰을 껐다 켠 뒤 다시 눌러 주세요.");
                    history.setEnabled(true);
                });
                return;
            }
            if (found.isEmpty()) {
                tellServer(canRead, 0, true, SmsHistoryReader.lastCapped);
                importing = false;
                runOnUiThread(() -> {
                    status.setText("최근 " + HISTORY_DAYS + "일 문자함에서 하나 거래문자를 찾지 못했습니다.\n" +
                            "문자를 지우셨거나, 알림이 문자가 아닌 앱 푸시로 오는 경우입니다.");
                    history.setEnabled(true);
                });
                return;
            }

            String uid = SecureStore.uid(this);
            String token = SecureStore.token(this);
            int sent = 0, already = 0, skipped = 0, failed = 0;
            for (int i = 0; i < found.size(); i++) {
                SmsHistoryReader.Item item = found.get(i);
                final int done = i + 1;
                final int total = found.size();
                runOnUiThread(() -> status.setText("지난 문자를 보내는 중입니다… " + done + "/" + total));
                try {
                    JSONObject body = new JSONObject();
                    body.put("action", "ingest");
                    body.put("uid", uid);
                    body.put("deviceId", SecureStore.deviceId(this));
                    /* ★ 문자함에서 왔다고 밝힌다 — 알림이 아니므로 꾸러미 이름이 없다.
                         서버가 이 표를 보고 「폰이 살아 있다」로 잘못 찍지 않는다. */
                    body.put("source", "history");
                    body.put("packageName", "");
                    body.put("title", item.address);
                    body.put("text", item.body);
                    JSONObject response = HanaUploadWorker.post(body, token);
                    if (response.optBoolean("saved")) sent++;
                    else if (response.optBoolean("duplicate")) already++;
                    else skipped++;
                } catch (Exception error) {
                    failed++;
                }
            }

            final String report = "지난 문자 " + found.size() + "통을 살펴봤습니다.\n" +
                    "• 새로 보낸 것 " + sent + "건\n" +
                    "• 이미 있던 것 " + already + "건" +
                    (skipped > 0 ? "\n• 거래로 안 읽힌 것 " + skipped + "건" : "") +
                    (failed > 0 ? "\n• 실패 " + failed + "건 — 다시 눌러 주세요" : "") +
                    /* ⚠ 잘렸으면 «잘렸다»고 말한다. 예전에는 조용히 300통에서 끊고
                         「300통을 살펴봤습니다」로만 알려, 남은 것을 아무도 몰랐다.
                       ⚠ 새것부터 읽으므로 다시 눌러도 같은 자리에서 끊긴다 —
                         「다시 눌러 보세요」라고 하면 안 된다. 사람 손이 필요하다. */
                    (SmsHistoryReader.lastCapped
                            ? "\n\n⚠ 한 번에 " + SmsHistoryReader.MAX_MESSAGES
                              + "통까지만 봅니다. 더 오래된 문자는 못 가져왔으니 푸른에 알려 주세요."
                            : "");
            /* 잘 가져온 경우에도 알린다 — 전부 중복이면 ingest 는 자국을 남기지만,
               판 번호·권한·본 통수는 이 한 줄로만 올라간다. */
            tellServer(canRead, found.size(), true, SmsHistoryReader.lastCapped);
            SecureStore.setLastStatus(this, report);
            importing = false;
            runOnUiThread(() -> {
                status.setText(report);
                history.setEnabled(true);
            });
        });
    }

    private void refresh() {
        if (status == null) return;
        /* 가져오는 중에는 손대지 않는다 — 권한 창이 닫히며 onResume 이 도는데,
           그때 화면 글을 갈아치우면 진행 상황이 사라진다. */
        if (importing) return;
        boolean linked = SecureStore.connected(this);
        boolean canRead = checkSelfPermission(Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;
        connect.setEnabled(true);
        if (history != null) history.setEnabled(true);

        if (!linked) {
            /* ① 아직 연결 전 — 번호칸 하나만 */
            status.setText("연결번호를 넣어 주세요");
            status.setTextColor(Color.rgb(185, 28, 28));
            show(stepPair, true);
            show(sweepWarn, false);
            show(grantSms, false);
            show(battery, false);
            show(history, false);
            return;
        }
        show(stepPair, false);

        if (!canRead) {
            /* ② 연결은 됐는데 문자 읽기가 꺼짐 — 이것 하나만 크게 */
            status.setText("● 연결됨 — 한 가지만 더");
            status.setTextColor(Color.rgb(146, 64, 14));
            sweepWarn.setText("문자 읽기가 꺼져 있어 문자가 안 들어옵니다.\n"
                    + "아래를 누르고 «허용»만 눌러 주세요.");
            show(sweepWarn, true);
            show(grantSms, true);
            show(battery, false);
            show(history, false);
            return;
        }

        if (!batteryFree()) {
            /* ②-b 절전이 켜져 있다 — 훑기가 «한 번도» 안 돈다.
               ⚠ 여기서 「다 됐습니다」라고 하면 안 된다. 실제로 2026-08-30 에
                 연결·권한이 다 됐는데도 두 시간 가까이 한 번도 안 훑었다.
                 그때 앱은 「다 됐습니다」라고 적고 있었다 — 그 말이 거짓이었다. */
            status.setText("● 연결됨 — 한 가지만 더");
            status.setTextColor(Color.rgb(146, 64, 14));
            sweepWarn.setText("절전이 켜져 있어 " + HanaSweepWorker.PERIOD_MINUTES
                    + "분마다 문자함 훑는 일이 미뤄집니다.\n"
                    + "아래를 누르고 «허용»만 눌러 주세요.");
            show(sweepWarn, true);
            show(grantSms, false);
            show(battery, true);
            show(history, true);
            return;
        }

        /* ③ 다 됐다 — 상태 한 줄과, 가끔 쓰는 단추 하나 */
        status.setText("● 다 됐습니다\n" + SecureStore.lastStatus(this));
        status.setTextColor(Color.rgb(21, 128, 61));
        show(sweepWarn, false);
        show(grantSms, false);
        show(battery, false);
        show(history, true);
    }

    /* 절전 예외가 되어 있나. 안 되어 있으면 15분 훑기가 무기한 미뤄진다. */
    private boolean batteryFree() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
        } catch (Exception unknown) {
            /* 못 물어봤으면 «된 것으로» 친다 — 알 수 없는 것 때문에 다 된 화면을
               「한 가지만 더」로 붙잡아 두면, 할 일이 없는데 할 일이 있어 보인다. */
            return true;
        }
    }

    /* 절전 예외를 «한 번 눌러» 끝낸다. 설정 앱을 헤매게 하면 아무도 안 한다.
       ⚠ 기기에 따라 이 창이 아예 안 뜬다 — 그때는 설정 화면으로 데려다준다. */
    private void askBattery() {
        try {
            Intent ask = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            ask.setData(Uri.parse("package:" + getPackageName()));
            startActivity(ask);
        } catch (Exception noDialog) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                Toast.makeText(this, "목록에서 «푸른 하나문자»를 찾아 «허용»으로 바꿔 주세요.",
                        Toast.LENGTH_LONG).show();
            } catch (Exception noSettings) {
                Toast.makeText(this, "이 폰에서는 설정 → 배터리에서 «푸른 하나문자»를 "
                        + "«제한 없음»으로 바꿔 주세요.", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void show(android.view.View v, boolean on) {
        if (v != null) v.setVisibility(on ? android.view.View.VISIBLE : android.view.View.GONE);
    }

    /* ★ 15분 훑기는 «문자 읽기 권한이 있어야만» 돈다 (HanaSweepWorker: if (canRead)).
         그런데 그 권한은 「지난 문자 가져오기」를 눌러야 물어본다. 안 누르면
         훑기가 조용히 아무것도 안 하는데, 화면 아래 안내는 「15분마다 훑습니다」라고
         적혀 있다 — 화면이 거짓말을 하고, 사람은 「연결됐는데 문자가 안 온다」만 본다.

       2026-08-30 대표: 「핸드폰과 계속 연결 안 된다, 문자 안 온다」.
       연결은 멀쩡했다. 훑기가 권한이 없어 돌지 않고 있었고, 그 사실이 «어디에도
       안 보였다». 조용한 실패를 시끄럽게 만든다. */
    /* ⚠ showSweepWarning 은 없앴다 (2026-08-30). 하던 일은 refresh 가 «갈래 ②»로
         그대로 이어받았다 — 오히려 더 세다: 경고문만 띄우던 것을, 이제는 그 상태에서
         «다른 것을 다 감추고» 「문자 읽기 켜기」 한 단추만 남긴다.
       한 일을 두 곳에서 하면 한쪽만 고쳐지는 날이 온다. */

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setLineSpacing(0, 1.25f);
        return view;
    }

    private Button button(String value, int color) {
        Button view = new Button(this);
        view.setText(value);
        view.setTextSize(15);
        view.setTextColor(Color.WHITE);
        view.setBackgroundColor(color);
        view.setMinHeight(dp(50));
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams withTop(LinearLayout.LayoutParams value, int dp) {
        value.topMargin = this.dp(dp);
        return value;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
