package com.godotaistudio.app.bridge;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.godotaistudio.app.ai.AiClient;
import com.godotaistudio.app.files.FileManager;
import com.godotaistudio.app.files.FileWriter;
import com.godotaistudio.app.files.ZipImporter;
import com.godotaistudio.app.godot.GodotProjectParser;
import com.godotaistudio.app.godot.ProjectAnalyzer;
import com.godotaistudio.app.godot.SceneParser;
import com.godotaistudio.app.project.BackupManager;
import com.godotaistudio.app.project.ProjectCache;
import com.godotaistudio.app.project.ProjectStore;
import com.godotaistudio.app.security.KeyVault;
import com.godotaistudio.app.utils.JsonHelper;
import com.godotaistudio.app.utils.Logger;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class JsBridge {
    private static final int REQ_PICK_FOLDER = 1001;
    private static final int REQ_PICK_ZIP = 1002;

    private final Activity activity;
    private final WebView webView;
    private final ExecutorService exec = Executors.newFixedThreadPool(3);
    private final Handler main = new Handler(Looper.getMainLooper());

    private final KeyVault keyStore;
    private final FileManager fileManager;
    private final FileWriter fileWriter;
    private final ZipImporter zipImporter;
    private final BackupManager backupManager;
    private final AiClient aiClient;
    private final ProjectStore projectStore;
    private final ProjectCache projectCache;

    private String pendingCallbackId = null;

    public JsBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.keyStore = new KeyVault(activity);
        this.fileManager = new FileManager(activity);
        this.fileWriter = new FileWriter(activity);
        this.zipImporter = new ZipImporter(activity);
        this.backupManager = new BackupManager(activity);
        this.aiClient = new AiClient();
        this.projectStore = new ProjectStore(activity);
        this.projectCache = new ProjectCache(activity);
    }

    /* ---------- служебное ---------- */

    @JavascriptInterface
    public String getPlatformInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("platform", "android");
            o.put("sdk", android.os.Build.VERSION.SDK_INT);
            o.put("versionName", "0.7.0");
            o.put("hasBridge", true);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void showToast(final String msg) {
        main.post(() -> Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show());
    }

    /* ---------- проекты ---------- */

    @JavascriptInterface
    public void pickProjectFolder(String callbackId) {
        pendingCallbackId = callbackId;
        main.post(() -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                     | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                     | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            activity.startActivityForResult(i, REQ_PICK_FOLDER);
        });
    }

    @JavascriptInterface
    public void pickProjectFolderForNew(String callbackId) {
        // alias — используется визардом при создании новой игры
        pickProjectFolder(callbackId);
    }

    @JavascriptInterface
    public void pickZipFile(String callbackId) {
        pendingCallbackId = callbackId;
        main.post(() -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip"});
            activity.startActivityForResult(i, REQ_PICK_ZIP);
        });
    }

    @JavascriptInterface
    public void reopenProject(String uriStr, String callbackId) {
        exec.execute(() -> {
            try {
                Uri tree = Uri.parse(uriStr);
                if (!hasPermission(tree)) {
                    JSONObject cached = projectCache.loadTree(uriStr);
                    if (cached == null) {
                        sendResult(callbackId, false, "NO_PERMISSION");
                        return;
                    }
                    JSONObject res = new JSONObject();
                    res.put("fromCache", true);
                    res.put("treeUri", uriStr);
                    res.put("tree", cached);
                    JSONObject m = projectCache.loadMap(uriStr);
                    if (m != null) res.put("map", m);
                    sendResult(callbackId, true, res.toString());
                    return;
                }
                JSONObject treeJson = new JSONObject(fileManager.readProjectTree(tree));
                sendResult(callbackId, true, openAndAnalyze(uriStr, treeJson).toString());
            } catch (Exception e) {
                Logger.e("Bridge", "reopen failed", e);
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public String getLastProjectUri() {
        return projectStore.getLastUri();
    }

    @JavascriptInterface
    public String getSavedProjects() {
        return projectStore.getRecordsJson();
    }

    @JavascriptInterface
    public void removeProjectRecord(String uri) {
        projectStore.removeRecord(uri);
        projectCache.clear(uri);
    }

    @JavascriptInterface
    public String getProjectMap(String uriStr) {
        JSONObject m = projectCache.loadMap(uriStr);
        return m == null ? "" : m.toString();
    }

    public void handleActivityResult(int req, int res, Intent data) {
        if (req == REQ_PICK_ZIP && res == Activity.RESULT_OK && data != null) {
            Uri zipUri = data.getData();
            if (zipUri == null) {
                sendResult(pendingCallbackId, false, "Отменено");
                return;
            }
            try {
                activity.getContentResolver().takePersistableUriPermission(
                    zipUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) {}
            final String cb = pendingCallbackId;
            main.post(() -> webView.evaluateJavascript(
                "window.importZipCb('" + zipUri.toString() + "')", null));
            sendResult(cb, true, "OK");
            return;
        }

        if (req != REQ_PICK_FOLDER) return;
        if (res != Activity.RESULT_OK || data == null || data.getData() == null) {
            sendResult(pendingCallbackId, false, "Отменено");
            return;
        }
        final Uri tree = data.getData();
        try {
            activity.getContentResolver().takePersistableUriPermission(
                tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) {}
        final String cb = pendingCallbackId;
        exec.execute(() -> {
            try {
                JSONObject treeJson = new JSONObject(fileManager.readProjectTree(tree));
                sendResult(cb, true, openAndAnalyze(tree.toString(), treeJson).toString());
            } catch (Exception e) {
                sendResult(cb, false, "Ошибка чтения: " + e.getMessage());
            }
        });
    }

    private boolean hasPermission(Uri tree) {
        for (android.content.UriPermission p
                : activity.getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isReadPermission()) return true;
        }
        return false;
    }

    private JSONObject openAndAnalyze(String uriStr, JSONObject treeJson) throws Exception {
        JSONObject info = new JSONObject();
        String godotUri = findChildFile(treeJson, "project.godot");
        if (godotUri != null) {
            info = GodotProjectParser.parse(fileManager.readUri(Uri.parse(godotUri)));
        }
        JSONObject map = ProjectAnalyzer.buildMap(treeJson, info);
        projectCache.saveTree(uriStr, treeJson);
        projectCache.saveMap(uriStr, map);
        projectStore.saveRecord(uriStr, map.optString("name", ""),
                                        map.optString("godotVersion", ""));
        JSONObject res = new JSONObject();
        res.put("fromCache", false);
        res.put("treeUri", uriStr);
        res.put("tree", treeJson);
        res.put("map", map);
        return res;
    }

    private String findChildFile(JSONObject tree, String name) {
        JSONArray ch = tree.optJSONArray("children");
        if (ch == null) return null;
        for (int i = 0; i < ch.length(); i++) {
            JSONObject c = ch.optJSONObject(i);
            if (c != null && name.equals(c.optString("name"))
                    && "file".equals(c.optString("type"))) {
                return c.optString("uri");
            }
        }
        return null;
    }

    /* ---------- файлы: чтение и парсинг ---------- */

    @JavascriptInterface
    public void readFile(String uriStr, String callbackId) {
        exec.execute(() -> {
            try {
                sendResult(callbackId, true, fileManager.readUri(Uri.parse(uriStr)));
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void parseGodotProject(String uriStr, String callbackId) {
        exec.execute(() -> {
            try {
                JSONObject info = GodotProjectParser.parse(
                    fileManager.readUri(Uri.parse(uriStr)));
                sendResult(callbackId, true, info.toString());
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void parseScene(String uriStr, String callbackId) {
        exec.execute(() -> {
            try {
                JSONObject tree = SceneParser.parse(
                    fileManager.readUri(Uri.parse(uriStr)));
                sendResult(callbackId, true, tree.toString());
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    /* ---------- файлы: запись ---------- */

    @JavascriptInterface
    public void writeFile(String uriStr, String content, String callbackId) {
        exec.execute(() -> {
            try {
                fileWriter.write(Uri.parse(uriStr), content);
                sendResult(callbackId, true, "OK");
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void createFile(String parentUriStr, String name, String content, String callbackId) {
        exec.execute(() -> {
            try {
                Uri u = fileWriter.createFile(Uri.parse(parentUriStr), name, content);
                sendResult(callbackId, true, u.toString());
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void deleteFile(String uriStr, String callbackId) {
        exec.execute(() -> {
            try {
                boolean ok = fileWriter.delete(Uri.parse(uriStr));
                sendResult(callbackId, ok, ok ? "OK" : "Не удалось удалить");
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    /* ---------- импорт ZIP ---------- */

    @JavascriptInterface
    public void importZip(String zipUriStr, String targetTreeUriStr, String callbackId) {
        exec.execute(() -> {
            try {
                String msg = zipImporter.importFromUri(
                    Uri.parse(zipUriStr), Uri.parse(targetTreeUriStr));
                sendResult(callbackId, true, msg);
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void importFromUrl(String urlStr, String targetTreeUriStr, String callbackId) {
        exec.execute(() -> {
            try {
                String msg = zipImporter.importFromUrl(urlStr, Uri.parse(targetTreeUriStr));
                sendResult(callbackId, true, msg);
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    /* ---------- изменения: бэкап + снапшот + привязка к проекту ---------- */

    @JavascriptInterface
    public void applyChanges(String changesJson, String callbackId) {
        exec.execute(() -> {
            try {
                JSONArray changes;
                String projectUri = "";
                try {
                    JSONObject wrap = new JSONObject(changesJson);
                    changes = wrap.optJSONArray("changes");
                    projectUri = wrap.optString("projectUri", "");
                    if (changes == null) changes = new JSONArray(changesJson);
                } catch (Exception e) {
                    changes = new JSONArray(changesJson);
                }
                String session = backupManager.startSession(
                    "Изменения: " + changes.length() + " файл(ов)", projectUri);
                for (int i = 0; i < changes.length(); i++) {
                    JSONObject c = changes.getJSONObject(i);
                    String action = c.optString("action");
                    String path = c.optString("path");
                    String uriStr = c.optString("uri");
                    String newContent = c.optString("content");
                    if ("modify".equals(action)) {
                        String old = fileWriter.read(Uri.parse(uriStr));
                        backupManager.backupFile(session, path, old, meta(uriStr, "", "modify"));
                        fileWriter.write(Uri.parse(uriStr), newContent);
                        backupManager.saveNewContent(session, path, newContent);
                    } else if ("create".equals(action)) {
                        Uri nu = fileWriter.createFile(Uri.parse(c.optString("parentUri")),
                            c.optString("name"), newContent);
                        backupManager.backupFile(session, path, "",
                            meta(nu.toString(), c.optString("parentUri"), "create"));
                        backupManager.saveNewContent(session, path, newContent);
                    } else if ("delete".equals(action)) {
                        String old = fileWriter.read(Uri.parse(uriStr));
                        backupManager.backupFile(session, path, old,
                            meta(uriStr, c.optString("parentUri"), "delete"));
                        fileWriter.delete(Uri.parse(uriStr));
                        backupManager.saveNewContent(session, path, "");
                    }
                }
                sendResult(callbackId, true, session);
            } catch (Exception e) {
                Logger.e("Bridge", "applyChanges failed", e);
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    private JSONObject meta(String uri, String parentUri, String action) throws Exception {
        JSONObject m = new JSONObject();
        m.put("uri", uri);
        m.put("parentUri", parentUri);
        m.put("action", action);
        return m;
    }

    @JavascriptInterface
    public void getHistory(String callbackId) {
        exec.execute(() -> {
            try {
                sendResult(callbackId, true, backupManager.listSessions().toString());
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void clearHistory(String projectUri, String callbackId) {
        exec.execute(() -> {
            try {
                int n = backupManager.clearSessions(projectUri);
                sendResult(callbackId, true, String.valueOf(n));
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void getSessionDiff(String sessionId, String callbackId) {
        exec.execute(() -> {
            try {
                JSONArray entries = backupManager.getSessionEntries(sessionId);
                JSONArray out = new JSONArray();
                for (int i = 0; i < entries.length(); i++) {
                    JSONObject e = entries.getJSONObject(i);
                    String path = e.optString("path");
                    String oldC = backupManager.getBackupContent(sessionId, path);
                    String newC = backupManager.getNewContent(sessionId, path);
                    JSONObject o = new JSONObject();
                    o.put("path", path);
                    o.put("action", e.optString("action"));
                    o.put("uri", e.optString("uri"));
                    o.put("old", oldC == null ? "" : oldC);
                    o.put("neu", newC == null ? "" : newC);
                    o.put("hasNew", newC != null);
                    out.put(o);
                }
                sendResult(callbackId, true, out.toString());
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void rollback(String sessionId, String callbackId) {
        exec.execute(() -> {
            try {
                JSONArray entries = backupManager.getSessionEntries(sessionId);
                for (int i = entries.length() - 1; i >= 0; i--) {
                    JSONObject e = entries.getJSONObject(i);
                    String action = e.optString("action");
                    String uriStr = e.optString("uri");
                    String path = e.optString("path");
                    if ("modify".equals(action)) {
                        String content = backupManager.getBackupContent(sessionId, path);
                        if (content == null) content = "";
                        fileWriter.write(Uri.parse(uriStr), content);
                    } else if ("delete".equals(action)) {
                        String content = backupManager.getBackupContent(sessionId, path);
                        if (content == null) content = "";
                        String name = path;
                        int slash = name.lastIndexOf('/');
                        if (slash >= 0) name = name.substring(slash + 1);
                        fileWriter.createFile(Uri.parse(e.optString("parentUri")), name, content);
                    } else if ("create".equals(action)) {
                        fileWriter.delete(Uri.parse(uriStr));
                    }
                }
                backupManager.markRolledBack(sessionId);
                sendResult(callbackId, true, "OK");
            } catch (Exception e) {
                sendResult(callbackId, false, e.getMessage());
            }
        });
    }

    /* ---------- ключи ---------- */

    @JavascriptInterface
    public boolean saveApiKey(String provider, String key) {
        try { return keyStore.put(provider, key); }
        catch (Exception e) { return false; }
    }

    @JavascriptInterface
    public String getApiKey(String provider) {
        try {
            String k = keyStore.get(provider);
            return k == null ? "" : k;
        } catch (Exception e) { return ""; }
    }

    @JavascriptInterface
    public boolean deleteApiKey(String provider) {
        try { return keyStore.remove(provider); }
        catch (Exception e) { return false; }
    }

    @JavascriptInterface
    public String listProviders() {
        try {
            JSONArray arr = new JSONArray();
            for (String p : keyStore.listProviders()) arr.put(p);
            return arr.toString();
        } catch (Exception e) { return "[]"; }
    }

    /* ---------- ИИ (fallback не-стриминг) ----------
       КЛЮЧ ПРИХОДИТ ПРЯМО ОТ JS, т.к. JS знает реальный p.id,
       а Java-метод знает только provider=type. */

    @JavascriptInterface
    public void sendAiRequest(String provider, String model, String endpoint,
                              String apiKey, String messagesJson, String callbackId) {
        if (apiKey == null || apiKey.isEmpty()) {
            sendResult(callbackId, false, "API-ключ не задан для " + provider);
            return;
        }
        exec.execute(() -> {
            try {
                JSONArray msgs = new JSONArray(messagesJson);
                String response = aiClient.chat(provider, model, endpoint, apiKey, msgs);
                sendResult(callbackId, true, response);
            } catch (Exception e) {
                sendResult(callbackId, false, "AI error: " + e.getMessage());
            }
        });
    }

    /* ---------- ответ в JS ---------- */

    private void sendResult(final String callbackId, final boolean ok, final String data) {
        if (callbackId == null) return;
        final String escaped = JsonHelper.escapeForJs(data);
        main.post(() -> webView.evaluateJavascript(
            "window.__bridgeCallback('" + callbackId + "', " + ok + ", '" + escaped + "')",
            null));
    }
}