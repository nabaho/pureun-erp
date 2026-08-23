package kr.pureun.hanabridge;

import android.app.Activity;
import android.content.Intent;
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

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView status;
    private EditText code;
    private Button connect;

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
        TextView intro = text("권형하 휴대폰에 도착하는 하나은행·하나카드 거래 알림을 푸른ERP 거래내역 대기함으로 보냅니다.", 15, Color.DKGRAY);
        intro.setPadding(0, dp(10), 0, dp(18));
        root.addView(intro);

        status = text("", 15, Color.DKGRAY);
        status.setBackgroundColor(Color.rgb(239, 246, 255));
        status.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.addView(status, matchWrap());

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

        Button clear = button("이 휴대폰의 연결정보 지우기", Color.rgb(100, 116, 139));
        clear.setOnClickListener(v -> {
            SecureStore.clearConnection(this);
            SecureStore.setLastStatus(this, "이 휴대폰의 연결정보를 지웠습니다.");
            refresh();
        });
        root.addView(clear, withTop(matchWrap(), 10));

        TextView security = text("보안 안내\n• 문자 읽기 권한은 사용하지 않습니다.\n• 삼성 메시지/Google 메시지의 하나 거래 알림만 골라 처리합니다.\n• 인증번호·OTP·비밀번호는 전송하지 않습니다.\n• 서버에는 문자 원문 대신 날짜·금액·입출금·가맹점만 저장됩니다.", 13, Color.rgb(71, 85, 105));
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
                runOnUiThread(() -> {
                    code.setText("");
                    refresh();
                    Toast.makeText(this, "연결되었습니다. 알림 접근을 허용해 주세요.", Toast.LENGTH_LONG).show();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    status.setText("연결하지 못했습니다. ERP에서 새 연결번호를 받아 다시 입력해 주세요.");
                    connect.setEnabled(true);
                });
            }
        });
    }

    private void refresh() {
        if (status == null) return;
        boolean linked = SecureStore.connected(this);
        status.setText((linked ? "● 연결됨\n" : "○ 연결 안 됨\n") + SecureStore.lastStatus(this));
        status.setTextColor(linked ? Color.rgb(21, 128, 61) : Color.rgb(185, 28, 28));
        connect.setEnabled(true);
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
