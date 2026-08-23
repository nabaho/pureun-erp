package kr.pureun.hanabridge;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class HanaUploadWorker extends Worker {
    public HanaUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String uid = SecureStore.uid(context);
        String token = SecureStore.token(context);
        if (uid.isEmpty() || token.isEmpty()) return Result.failure();
        try {
            JSONObject body = new JSONObject();
            body.put("action", "ingest");
            body.put("uid", uid);
            body.put("deviceId", SecureStore.deviceId(context));
            body.put("packageName", getInputData().getString("packageName"));
            body.put("title", safe(getInputData().getString("title"), 200));
            body.put("text", safe(getInputData().getString("text"), 1200));
            JSONObject response = post(body, token);
            if (response.optBoolean("saved")) {
                SecureStore.setLastStatus(context, "하나 거래 1건을 푸른ERP 대기함에 보냈습니다.");
            } else if (response.optBoolean("duplicate")) {
                SecureStore.setLastStatus(context, "이미 받은 거래라 중복 전송하지 않았습니다.");
            }
            return Result.success();
        } catch (UnauthorizedException unauthorized) {
            SecureStore.clearConnection(context);
            SecureStore.setLastStatus(context, "연결이 해제되었습니다. ERP에서 다시 연결해 주세요.");
            return Result.failure();
        } catch (Exception retryable) {
            return Result.retry();
        }
    }

    static JSONObject post(JSONObject body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BridgeConfig.ENDPOINT).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (token != null && !token.isEmpty()) {
            connection.setRequestProperty("Authorization", "Device " + token);
        }
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(bytes);
        }
        int status = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream(),
                StandardCharsets.UTF_8));
        StringBuilder json = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) json.append(line);
        reader.close();
        connection.disconnect();
        if (status == 401 || status == 403) throw new UnauthorizedException();
        if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
        JSONObject response = new JSONObject(json.toString());
        if (!response.optBoolean("ok")) throw new IllegalStateException(response.optString("error"));
        return response;
    }

    private static String safe(String value, int limit) {
        if (value == null) return "";
        return value.length() > limit ? value.substring(0, limit) : value;
    }

    private static final class UnauthorizedException extends Exception {}
}
