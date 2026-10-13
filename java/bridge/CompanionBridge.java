package com.godotaistudio.app.bridge;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.godotaistudio.app.utils.JsonHelper;

public class CompanionBridge {
    private final Context ctx;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());

    public CompanionBridge(Context ctx, WebView webView) {
        this.ctx = ctx;
        this.webView = webView;
    }

    @JavascriptInterface
    public void createDirectory(String parentUriStr, String name, String callbackId) {
        new Thread(() -> {
            try {
                Uri parent = Uri.parse(parentUriStr);
                Uri dir = DocumentsContract.createDocument(
                    ctx.getContentResolver(), parent,
                    DocumentsContract.Document.MIME_TYPE_DIR, name);
                if (dir == null) throw new RuntimeException("createDirectory returned null");
                sendResult(callbackId, true, dir.toString());
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        }).start();
    }

    private void sendResult(final String callbackId, final boolean ok, final String data) {
        if (callbackId == null) return;
        final String escaped = JsonHelper.escapeForJs(data);
        main.post(() -> webView.evaluateJavascript(
            "window.__bridgeCallback('" + callbackId + "', " + ok + ", '" + escaped + "')",
            null));
    }
}