package com.godotaistudio.app.bridge;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.godotaistudio.app.ai.StreamClient;
import com.godotaistudio.app.utils.JsonHelper;

import org.json.JSONArray;
import org.json.JSONObject;

public class StreamBridge {
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final StreamClient streamClient = new StreamClient();

    public StreamBridge(Activity activity, WebView webView) {
        this.webView = webView;
    }

    @JavascriptInterface
    public void sendAiStream(String provider, String model, String endpoint,
                             String apiKey, String messagesJson, final String callbackId) {
        if (apiKey == null || apiKey.isEmpty()) {
            postResult(callbackId, false, "API-ключ не задан для " + provider);
            return;
        }
        JSONArray msgs;
        try { msgs = new JSONArray(messagesJson); }
        catch (Exception e) { postResult(callbackId, false, e.getMessage()); return; }

        streamClient.chat(provider, model, endpoint, apiKey, msgs, new StreamClient.Listener() {
            @Override public void onChunk(final String text) {
                final String esc = JsonHelper.escapeForJs(text);
                main.post(() -> webView.evaluateJavascript(
                    "window.__bridgeStream && window.__bridgeStream('" + callbackId + "','" + esc + "')", null));
            }
            @Override public void onDone(String full) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("text", full);
                    postResult(callbackId, true, o.toString());
                } catch (Exception e) {
                    postResult(callbackId, true, "{\"text\":\"\"}");
                }
            }
            @Override public void onError(String message) {
                postResult(callbackId, false, message == null ? "stream error" : message);
            }
        });
    }

    private void postResult(final String callbackId, final boolean ok, final String data) {
        if (callbackId == null) return;
        final String escaped = JsonHelper.escapeForJs(data);
        main.post(() -> webView.evaluateJavascript(
            "window.__bridgeCallback('" + callbackId + "', " + ok + ", '" + escaped + "')", null));
    }
}