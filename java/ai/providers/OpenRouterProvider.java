package com.godotaistudio.app.ai.providers;

import com.godotaistudio.app.utils.Logger;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class OpenRouterProvider {
    private static final String ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
    private static final int MAX_TOKENS = 16384;

    public String chat(String model, String apiKey, JSONArray messages) throws Exception {
        Logger.d("OpenRouter", "Запрос к модели: " + model);

        JSONObject payload = new JSONObject();
        payload.put("model", model);
        payload.put("messages", messages);
        payload.put("temperature", 0.3);
        payload.put("stream", false);
        payload.put("max_tokens", MAX_TOKENS);

        HttpURLConnection c = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(120000);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setRequestProperty("Authorization", "Bearer " + apiKey);
        c.setRequestProperty("HTTP-Referer", "https://godot-ai.studio");
        c.setRequestProperty("X-Title", "Godot AI Studio");

        OutputStream os = c.getOutputStream();
        os.write(payload.toString().getBytes("UTF-8"));
        os.flush();
        os.close();

        int code = c.getResponseCode();
        BufferedInputStream in = new BufferedInputStream(
            (code >= 200 && code < 300) ? c.getInputStream() : c.getErrorStream());
        byte[] buf = new byte[4096];
        StringBuilder sb = new StringBuilder();
        int n;
        while ((n = in.read(buf)) != -1) sb.append(new String(buf, 0, n, "UTF-8"));
        in.close();
        c.disconnect();

        if (code < 200 || code >= 300) {
            throw new RuntimeException("HTTP " + code + ": " + sb.toString());
        }
        return normalizeResponse(sb.toString());
    }

    private String normalizeResponse(String raw) throws Exception {
        JSONObject out = new JSONObject();
        JSONObject j = new JSONObject(raw);
        JSONArray choices = j.optJSONArray("choices");
        String text = "";
        if (choices != null && choices.length() > 0) {
            JSONObject msg = choices.getJSONObject(0).optJSONObject("message");
            if (msg != null) text = msg.optString("content", "");
        }
        out.put("text", text);
        out.put("usage", j.opt("usage"));
        out.put("raw", j);
        return out.toString();
    }
}