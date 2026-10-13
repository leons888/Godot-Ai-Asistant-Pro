package com.godotaistudio.app.ai;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class StreamClient {
    private static final String TAG = "StreamClient";
    private static final int MAX_TOKENS_OPENAI = 16384;
    private static final int MAX_TOKENS_GEMINI = 8192;

    public interface Listener {
        void onChunk(String text);
        void onDone(String full);
        void onError(String message);
    }

    public void chat(String provider, String model, String endpoint, String apiKey,
                     JSONArray messages, final Listener listener) {
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection c = null;
                try {
                    Log.d(TAG, "Starting chat with provider: " + provider + ", model: " + model);
                    boolean gemini = provider.equalsIgnoreCase("gemini");
                    String url;
                    String payload;
                    if (gemini) {
                        url = "https://generativelanguage.googleapis.com/v1beta/models/" + model
                            + ":streamGenerateContent?alt=sse&key=" + apiKey;
                        payload = buildGemini(messages).toString();
                    } else {
                        url = openAiUrl(provider, endpoint);
                        JSONObject p = buildOpenAI(model, messages);
                        p.put("stream", true);
                        payload = p.toString();
                    }
                    Log.d(TAG, "URL: " + url);
                    Log.d(TAG, "Payload length: " + payload.length());
                    
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(120000);
                    c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    c.setRequestProperty("Accept", "text/event-stream");
                    if (!gemini) c.setRequestProperty("Authorization", "Bearer " + apiKey);
                    if (provider.equalsIgnoreCase("openrouter")) {
                        c.setRequestProperty("HTTP-Referer", "https://godot-ai.studio");
                        c.setRequestProperty("X-Title", "Godot AI Studio");
                    }
                    OutputStream os = c.getOutputStream();
                    os.write(payload.getBytes("UTF-8"));
                    os.flush();
                    os.close();

                    int code = c.getResponseCode();
                    Log.d(TAG, "Response code: " + code);
                    
                    if (code < 200 || code >= 300) {
                        String errBody = readAll(c.getErrorStream());
                        Log.e(TAG, "HTTP error: " + code + " - " + errBody);
                        listener.onError("HTTP " + code + ": " + errBody);
                        return;
                    }
                    
                    BufferedReader br = new BufferedReader(
                        new InputStreamReader(c.getInputStream(), "UTF-8"));
                    StringBuilder full = new StringBuilder();
                    String line;
                    int lineCount = 0;
                    while ((line = br.readLine()) != null) {
                        lineCount++;
                        if (!line.startsWith("data:")) continue;
                        String data = line.substring(5).trim();
                        if (data.isEmpty()) continue;
                        if ("[DONE]".equals(data)) break;
                        
                        // Перехват скрытых ошибок
                        if (data.contains("\"error\"")) {
                            try {
                                JSONObject errJson = new JSONObject(data);
                                if (errJson.has("error")) {
                                    String errMsg = errJson.getJSONObject("error").optString("message", data);
                                    Log.e(TAG, "Stream error: " + errMsg);
                                    listener.onError("Ошибка провайдера: " + errMsg);
                                    br.close();
                                    return;
                                }
                            } catch (Exception e) {
                                Log.w(TAG, "Failed to parse error JSON", e);
                            }
                        }

                        String delta = extractDelta(provider, data);
                        if (delta != null) {
                            if (delta.startsWith("[SAFETY_BLOCK]")) {
                                Log.w(TAG, "Content blocked by safety filter");
                                listener.onError("Ответ заблокирован фильтрами безопасности (Safety). Попробуйте переформулировать запрос или сменить модель.");
                                br.close();
                                return;
                            }
                            if (delta.startsWith("[STREAM_ERROR:")) {
                                String errMsg = delta.substring(14, delta.length() - 1);
                                Log.e(TAG, "Stream error: " + errMsg);
                                listener.onError(errMsg);
                                br.close();
                                return;
                            }
                            if (!delta.isEmpty()) {
                                full.append(delta);
                                listener.onChunk(delta);
                            }
                        }
                    }
                    br.close();
                    Log.d(TAG, "Stream finished. Total lines: " + lineCount + ", Response length: " + full.length());
                    if (full.length() == 0) {
                        Log.w(TAG, "Empty response from API");
                        listener.onError("Провайдер вернул пустой ответ (0 токенов). Возможно, запрос был заблокирован или произошла ошибка на стороне сервера.");
                    } else {
                        listener.onDone(full.toString());
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Exception in stream", e);
                    listener.onError(e.getMessage() == null ? "stream error" : e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        });
        t.start();
    }

    private String extractDelta(String provider, String data) {
        try {
            JSONObject j = new JSONObject(data);
            if (provider.equalsIgnoreCase("gemini")) {
                JSONArray cand = j.optJSONArray("candidates");
                if (cand != null && cand.length() > 0) {
                    JSONObject first = cand.getJSONObject(0);
                    if ("SAFETY".equals(first.optString("finishReason"))) {
                        return "[SAFETY_BLOCK]";
                    }
                    JSONObject content = first.optJSONObject("content");
                    if (content != null) {
                        JSONArray parts = content.optJSONArray("parts");
                        if (parts != null && parts.length() > 0) {
                            return parts.getJSONObject(0).optString("text", "");
                        }
                    }
                }
                return "";
            }
            JSONArray choices = j.optJSONArray("choices");
            if (choices != null && choices.length() > 0) {
                JSONObject ch = choices.getJSONObject(0);
                if (ch.has("error")) {
                    return "[STREAM_ERROR:" + ch.getJSONObject("error").optString("message", "Unknown stream error") + "]";
                }
                JSONObject delta = ch.optJSONObject("delta");
                if (delta != null && delta.has("content")) return delta.optString("content", "");
                JSONObject msg = ch.optJSONObject("message");
                if (msg != null) return msg.optString("content", "");
            }
            if (j.has("error")) {
                return "[STREAM_ERROR:" + j.getJSONObject("error").optString("message", data) + "]";
            }
            return "";
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse delta: " + data, e);
            return "";
        }
    }

    private String openAiUrl(String provider, String endpoint) {
        if (provider.equalsIgnoreCase("openrouter")) return "https://openrouter.ai/api/v1/chat/completions";
        if (provider.equalsIgnoreCase("groq")) return "https://api.groq.com/openai/v1/chat/completions";
        if (provider.equalsIgnoreCase("huggingface")) return "https://router.huggingface.co/v1/chat/completions";
        if (endpoint == null || endpoint.isEmpty()) throw new RuntimeException("Не задан endpoint");
        return endpoint.endsWith("/") ? endpoint + "chat/completions" : endpoint + "/chat/completions";
    }

    private JSONObject buildOpenAI(String model, JSONArray messages) throws Exception {
        JSONObject o = new JSONObject();
        o.put("model", model);
        o.put("messages", messages);
        o.put("temperature", 0.3);
        o.put("max_tokens", MAX_TOKENS_OPENAI);
        return o;
    }

    private JSONObject buildGemini(JSONArray messages) throws Exception {
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
        gen.put("maxOutputTokens", MAX_TOKENS_GEMINI);
        root.put("generationConfig", gen);
        return root;
    }

    private String readAll(InputStream is) {
        if (is == null) return "";
        try {
            BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append('\n');
            return sb.toString();
        } catch (Exception e) { return ""; }
    }
}