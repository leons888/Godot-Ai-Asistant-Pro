package com.godotaistudio.app.ai.providers;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class GeminiProvider {
    private static final int MAX_OUTPUT_TOKENS = 8192;

    public String chat(String model, String apiKey, JSONArray messages) throws Exception {
        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                   + model + ":generateContent?key=" + apiKey;

        JSONObject payload = buildPayload(messages);

        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(120000);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setRequestProperty("Accept", "application/json");

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

    private JSONObject buildPayload(JSONArray messages) throws Exception {
        JSONObject root = new JSONObject();
        StringBuilder sys = new StringBuilder();
        JSONArray contents = new JSONArray();
        String lastRole = "";

        for (int i = 0; i < messages.length(); i++) {
            JSONObject m = messages.getJSONObject(i);
            String role = m.optString("role");
            String text = m.optString("content", "");
            if ("system".equals(role)) {
                if (sys.length() > 0) sys.append('\n');
                sys.append(text);
                continue;
            }
            String r = "user".equals(role) ? "user" : "model";
            if (r.equals(lastRole) && contents.length() > 0) {
                JSONObject prev = contents.getJSONObject(contents.length() - 1);
                JSONArray parts = prev.getJSONArray("parts");
                parts.getJSONObject(0).put("text", parts.getJSONObject(0).optString("text", "") + "\n" + text);
                continue;
            }
            JSONObject cc = new JSONObject();
            cc.put("role", r);
            JSONArray parts = new JSONArray();
            JSONObject p = new JSONObject();
            p.put("text", text);
            parts.put(p);
            cc.put("parts", parts);
            contents.put(cc);
            lastRole = r;
        }

        if (contents.length() == 0 || !"user".equals(contents.getJSONObject(0).optString("role"))) {
            JSONArray fixed = new JSONArray();
            JSONObject first = new JSONObject();
            first.put("role", "user");
            JSONArray fp = new JSONArray();
            JSONObject fp0 = new JSONObject();
            fp0.put("text", "Продолжи работу над проектом.");
            fp.put(fp0);
            first.put("parts", fp);
            fixed.put(first);
            for (int i = 0; i < contents.length(); i++) fixed.put(contents.get(i));
            contents = fixed;
        }

        root.put("contents", contents);
        if (sys.length() > 0) {
            JSONObject si = new JSONObject();
            JSONArray sp = new JSONArray();
            JSONObject sp0 = new JSONObject();
            sp0.put("text", sys.toString());
            sp.put(sp0);
            si.put("parts", sp);
            root.put("system_instruction", si);
        }
        JSONObject gen = new JSONObject();
        gen.put("temperature", 0.3);
        gen.put("maxOutputTokens", MAX_OUTPUT_TOKENS);
        root.put("generationConfig", gen);
        return root;
    }

    private String normalizeResponse(String raw) throws Exception {
        JSONObject out = new JSONObject();
        JSONObject j = new JSONObject(raw);
        JSONArray cand = j.optJSONArray("candidates");
        String text = "";
        if (cand != null && cand.length() > 0) {
            JSONObject first = cand.getJSONObject(0);
            JSONObject content = first.optJSONObject("content");
            if (content != null) {
                JSONArray parts = content.optJSONArray("parts");
                if (parts != null && parts.length() > 0) {
                    text = parts.getJSONObject(0).optString("text", "");
                }
            }
        }
        out.put("text", text);
        out.put("raw", j);
        return out.toString();
    }
}