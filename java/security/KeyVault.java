package com.godotaistudio.app.security;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class KeyVault {
    private static final String ALIAS = "godot_ai_master";
    private static final String PREFS = "godot_ai_keys";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    private final Context ctx;

    public KeyVault(Context ctx) {
        this.ctx = ctx;
        ensureKey();
    }

    private void ensureKey() {
        try {
            java.security.KeyStore ks = java.security.KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(ALIAS)) {
                return;
            }

            KeyGenerator kg = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
            kg.init(new KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
            kg.generateKey();
        } catch (Exception e) {
            throw new RuntimeException("Keystore init failed", e);
        }
    }

    private SecretKey loadKey() throws Exception {
        java.security.KeyStore ks = java.security.KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    public boolean put(String provider, String plainText) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, loadKey());
            byte[] iv = c.getIV();
            byte[] enc = c.doFinal(plainText.getBytes("UTF-8"));
            String stored = Base64.encodeToString(iv, Base64.NO_WRAP) + "|"
                          + Base64.encodeToString(enc, Base64.NO_WRAP);
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
               .edit().putString(provider, stored).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public String get(String provider) {
        try {
            String stored = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                               .getString(provider, null);
            if (stored == null) {
                return null;
            }
            String[] parts = stored.split("\\|");
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] enc = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, loadKey(), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(enc), "UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    public boolean remove(String provider) {
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
               .edit().remove(provider).apply();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public List<String> listProviders() {
        List<String> out = new ArrayList<>();
        Map<String, ?> all = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll();
        out.addAll(all.keySet());
        return out;
    }
}