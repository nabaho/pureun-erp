package kr.pureun.hanabridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
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

    private ScrollView buildView() {
        int pad = dp(22);
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView title = text("푸른 하나문자 연결", 25, Color.rgb(30, 58, 138));
        title.setTypeface(null, 1);
        root.addView(title);
        /* 판 번호를 화면에 적는다 — 새로 깐 것이 맞는지 폰에서 바로 가릴 수 있어야 한다.
           2026-08-29 에 「깔았는데 그대로다」를 확인할 길이 없어 DEX 를 풀어 봤다. */
        TextView intro = text("권형하 휴대폰에 도착하는 하나은행·하나카드 거래 알림을 푸른ERP 거래내역 대기함으로 보냅니다.\n(앱 판 " + BuildConfig.VERSION_NAME + ")", 15, Color.DKGRAY);
        intro.setPadding(0, dp(10), 0, dp(18));
        root.addView(intro);

        status = text("", 15, Color.DKGRAY);
        status.setBackgroundColor(Color.rgb(239, 246, 255));
        status.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.addView(status, matchWrap());

        /* 연결 상태 «바로 아래»에 둔다 — 「연결됨」만 보고 안심하는 자리가 여기다 */
        sweepWarn = text("", 14, Color.rgb(146, 64, 14));
        sweepWarn.setBackgroundColor(Color.rgb(255, 251, 235));
        sweepWarn.setPadding(dp(14), dp(14), dp(14), dp(14));
        sweepWarn.setVisibility(android.view.View.GONE);
        root.addView(sweepWarn, withTop(matchWrap(), 8));

        TextView guide = text("1. PC의 푸른ERP 거래내역에서 ‘휴대폰 연결’을 누릅니다.\n2. 표시된 8자리 연결번호를 아래에 입력합니다.\n3. 연결 후 ‘알림 접근 허용’을 눌러 이 앱을 허용합니다.", 14, Color.DKGRAY);
        guide.setPadding(0, dp(20), 0, dp(10));
        root.addView(guide);

        code = new EditText(this);
        code.setHint("8자리 연결번호");
        code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(8)});
        code.setTextSize(21);
        code.setGravity(Gravity.CENTER);
        root.addView(code, matchWrap());

        connect = button("연결", Color.rgb(37, 99, 235));
        connect.setOnClickListener(v -> pair());
        root.addView(connect, withTop(matchWrap(), 10));

        Button access = button("알림 접근 허용", Color.rgb(21, 128, 61));
        access.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        root.addView(access, withTop(matchWrap(), 10));

        /* 알림은 지나가면 사라진다 — 앱을 깔기 «전»에 온 문자는 여기서만 끌어올 수 있다. */
        history = button("지난 문자 가져오기 (최근 " + HISTORY_DAYS + "일)", Color.rgb(180, 83, 9));
        history.setOnClickListener(v -> askThenImport());
        root.addView(history, withTop(matchWrap(), 10));
        TextView historyNote = text("이 앱을 깔기 전에 온 하나 거래문자를 문자함에서 찾아 보냅니다. 이미 보낸 것은 두 번 쌓이지 않으니 여러 번 눌러도 됩니다.", 13, Color.rgb(120, 53, 15));
        historyNote.setPadding(dp(2), dp(6), dp(2), 0);
        root.addView(historyNote);

        Button clear = button("이 휴대폰의 연결정보 지우기", Color.rgb(100, 116, 139));
        clear.setOnClickListener(v -> {
            SecureStore.clearConnection(this);
            /* ⚠ 훑기도 함께 멈춘다 — 안 멈추면 연결을 지운 폰이 15분마다 서버를 두드린다. */
            HanaSweepWorker.cancel(this);
            SecureStore.setLastStatus(this, "이 휴대폰의 연결정보를 지웠습니다.");
            refresh();
        });
        root.addView(clear, withTop(matchWrap(), 10));

        /* ⚠ 예전에는 「문자 읽기 권한은 사용하지 않습니다」라고 적혀 있었다.
             지난 문자 가져오기를 넣으면서 그 말이 «거짓»이 되었다 —
             화면의 약속과 앱이 하는 일이 어긋나면 그 안내는 안 하느니만 못하다.
             언제 쓰는지까지 그대로 적는다. */
        /* ⚠ 「15분마다 훑습니다」라고 잘라 적었더니 «권한이 없을 때는 거짓»이 됐다.
             훑기는 문자 읽기 권한이 있어야만 돈다(HanaSweepWorker: if (canRead)).
             화면의 약속과 하는 일이 어긋나면 그 안내는 안 하느니만 못하다 —
             2026-08-30 「문자 안 온다」가 정확히 이 자리에서 났다. */
        TextView security = text("보안 안내\n• 알림을 엿봅니다.\n• 문자 읽기를 허용하시면, 그때부터 " + HanaSweepWorker.PERIOD_MINUTES + "분마다 문자함의 최근 " + HanaSweepWorker.SWEEP_DAYS + "일치도 훑습니다 (허용 전에는 훑지 않습니다).\n• 알림이 막히거나 꺼져도 놓치지 않기 위해서입니다.\n• 어느 쪽이든 하나 거래문자만 골라 보냅니다.\n• 삼성 메시지/Google 메시지의 하나 거래 알림만 골라 처리합니다.\n• 인증번호·OTP·비밀번호는 전송하지 않습니다.\n• 서버에는 문자 원문 대신 날짜·금액·입출금·가맹점만 저장됩니다.", 13, Color.rgb(71, 85, 105));
        security.setPadding(dp(14), dp(14), dp(14), dp(14));
        security.setBackgroundColor(Color.rgb(248, 250, 252));
        root.addView(security, withTop(matchWrap(), 20));
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

    private void importHistory() {
        if (importing) return;
        importing = true;
        history.setEnabled(false);
        status.setText("문자함에서 지난 " + HISTORY_DAYS + "일치를 찾는 중입니다…");
        executor.execute(() -> {
            List<SmsHistoryReader.Item> found;
            try {
                found = SmsHistoryReader.recent(this, HISTORY_DAYS, System.currentTimeMillis());
            } catch (Exception error) {
                importing = false;
                runOnUiThread(() -> {
                    status.setText("문자함을 읽지 못했습니다.");
                    history.setEnabled(true);
                });
                return;
            }
            if (found.isEmpty()) {
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
                    (failed > 0 ? "\n• 실패 " + failed + "건 — 다시 눌러 주세요" : "");
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
        status.setText((linked ? "● 연결됨\n" : "○ 연결 안 됨\n") + SecureStore.lastStatus(this));
        status.setTextColor(linked ? Color.rgb(21, 128, 61) : Color.rgb(185, 28, 28));
        connect.setEnabled(true);
        if (history != null) history.setEnabled(true);
        showSweepWarning();
    }

    /* ★ 15분 훑기는 «문자 읽기 권한이 있어야만» 돈다 (HanaSweepWorker: if (canRead)).
         그런데 그 권한은 「지난 문자 가져오기」를 눌러야 물어본다. 안 누르면
         훑기가 조용히 아무것도 안 하는데, 화면 아래 안내는 「15분마다 훑습니다」라고
         적혀 있다 — 화면이 거짓말을 하고, 사람은 「연결됐는데 문자가 안 온다」만 본다.

       2026-08-30 대표: 「핸드폰과 계속 연결 안 된다, 문자 안 온다」.
       연결은 멀쩡했다. 훑기가 권한이 없어 돌지 않고 있었고, 그 사실이 «어디에도
       안 보였다». 조용한 실패를 시끄럽게 만든다. */
    private void showSweepWarning() {
        if (sweepWarn == null) return;
        boolean canRead = checkSelfPermission(Manifest.permission.READ_SMS)
                == PackageManager.PERMISSION_GRANTED;
        if (canRead) {
            sweepWarn.setVisibility(android.view.View.GONE);
            return;
        }
        sweepWarn.setVisibility(android.view.View.VISIBLE);
        sweepWarn.setText("⚠ 문자 읽기가 꺼져 있습니다\n\n" +
                "지금은 «알림이 뜰 때만» 문자를 보냅니다. 알림이 막히거나 절전이 앱을 재우면 " +
                "아무것도 안 옵니다.\n\n" +
                "위 「지난 문자 가져오기」를 한 번 눌러 허용하시면, 그때부터 " +
                HanaSweepWorker.PERIOD_MINUTES + "분마다 문자함을 스스로 훑어 놓치지 않습니다.");
    }

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
