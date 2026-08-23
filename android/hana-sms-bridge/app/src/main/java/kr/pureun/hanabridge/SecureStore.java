package kr.pureun.hanabridge;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {
    private static final String PREF = "pureun_hana_bridge";
    private static final String ALIAS = "pureun_hana_bridge_token_v1";
    private static final String KEY_UID = "uid";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_DEVICE = "device_id";

    private SecureStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    static String deviceId(Context context) {
        SharedPreferences p = prefs(context);
        String value = p.getString(KEY_DEVICE, "");
        if (value == null || value.isEmpty()) {
            value = UUID.randomUUID().toString();
            p.edit().putString(KEY_DEVICE, value).apply();
        }
        return value;
    }

    static void saveConnection(Context context, String uid, String token) throws Exception {
        prefs(context).edit()
                .putString(KEY_UID, uid)
                .putString(KEY_TOKEN, encrypt(token))
                .apply();
    }

    static String uid(Context context) {
        String value = prefs(context).getString(KEY_UID, "");
        return value == null ? "" : value;
    }

    static String token(Context context) {
        String value = prefs(context).getString(KEY_TOKEN, "");
        if (value == null || value.isEmpty()) return "";
        try {
            return decrypt(value);
        } catch (Exception ignored) {
            clearConnection(context);
            return "";
        }
    }

    static boolean connected(Context context) {
        return !uid(context).isEmpty() && !token(context).isEmpty();
    }

    static void clearConnection(Context context) {
        prefs(context).edit().remove(KEY_UID).remove(KEY_TOKEN).apply();
    }

    static void setLastStatus(Context context, String status) {
        prefs(context).edit().putString("last_status", status).apply();
    }

    static String lastStatus(Context context) {
        String value = prefs(context).getString("last_status", "아직 전송한 거래가 없습니다.");
        return value == null ? "" : value;
    }

    private static SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        KeyStore.Entry entry = ks.getEntry(ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private static String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getKey());
        byte[] body = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
                Base64.encodeToString(body, Base64.NO_WRAP);
    }

    private static String decrypt(String stored) throws Exception {
        String[] parts = stored.split("\\.", 2);
        if (parts.length != 2) throw new IllegalArgumentException("invalid token");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getKey(),
                new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
                StandardCharsets.UTF_8);
    }
}
