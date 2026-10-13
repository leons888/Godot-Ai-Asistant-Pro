package com.godotaistudio.app.ai.providers;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class OpenAiCompatibleProvider {
    private static final int MAX_TOKENS = 16384;

    public String chat(String provider, String model, String endpoint,
                       String apiKey, JSONArray messages) throws Exception {

        String url = buildUrl(provider, endpoint);
        JSONObject payload = buildPayload(model, messages);

        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(120000);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Authorization", "Bearer " + apiKey);

        if (provider.equalsIgnoreCase("openrouter")) {
            c.setRequestProperty("HTTP-Referer", "https://godot-ai.studio");
            c.setRequestProperty("X-Title", "Godot AI Studio");
        }

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

    private String buildUrl(String provider, String endpoint) {
        switch (provider.toLowerCase()) {
            case "openrouter":
                return "https://openrouter.ai/api/v1/chat/completions";
            case "groq":
                return "https://api.groq.com/openai/v1/chat/completions";
            case "huggingface":
                return "https://router.huggingface.co/v1/chat/completions";
            case "custom":
                if (endpoint == null || endpoint.isEmpty()) {
                    throw new RuntimeException("Не задан endpoint");
                }
                return endpoint.endsWith("/") ? endpoint + "chat/completions"
                                             : endpoint + "/chat/completions";
            default:
                throw new RuntimeException("Unsupported provider: " + provider);
        }
    }

    private JSONObject buildPayload(String model, JSONArray messages) throws Exception {
        JSONObject o = new JSONObject();
        o.put("model", model);
        o.put("messages", messages);
        o.put("temperature", 0.3);
        o.put("stream", false);
        o.put("max_tokens", MAX_TOKENS);
        return o;
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