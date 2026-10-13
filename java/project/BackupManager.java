package com.godotaistudio.app.project;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

public class BackupManager {
    private final File root;

    public BackupManager(Context ctx) {
        root = new File(ctx.getFilesDir(), "backups");
        if (!root.exists()) root.mkdirs();
    }

    public String startSession(String description, String projectUri) {
        String id = String.valueOf(System.currentTimeMillis());
        JSONObject meta = new JSONObject();
        try {
            meta.put("at", System.currentTimeMillis());
            meta.put("desc", description);
            meta.put("projectUri", projectUri == null ? "" : projectUri);
            meta.put("rolled", false);
            meta.put("entries", new JSONArray());
        } catch (Exception ignored) {}
        write(new File(root, id + "/meta.json"), meta.toString());
        return id;
    }

    public void backupFile(String sessionId, String relPath, String content, JSONObject entry) {
        try {
            write(new File(root, sessionId + "/" + safeName(relPath) + ".bak"), content);
            entry.put("path", relPath);
            entry.put("file", safeName(relPath) + ".bak");
            File metaFile = new File(root, sessionId + "/meta.json");
            JSONObject meta = new JSONObject(read(metaFile));
            meta.getJSONArray("entries").put(entry);
            write(metaFile, meta.toString());
        } catch (Exception ignored) {}
    }

    public void saveNewContent(String sessionId, String relPath, String content) {
        write(new File(root, sessionId + "/" + safeName(relPath) + ".new"), content);
    }

    public String getBackupContent(String sessionId, String relPath) {
        File f = new File(root, sessionId + "/" + safeName(relPath) + ".bak");
        if (!f.exists()) return null;
        try { return read(f); } catch (Exception e) { return null; }
    }

    public String getNewContent(String sessionId, String relPath) {
        File f = new File(root, sessionId + "/" + safeName(relPath) + ".new");
        if (!f.exists()) return null;
        try { return read(f); } catch (Exception e) { return null; }
    }

    public JSONArray getSessionEntries(String sessionId) throws Exception {
        JSONObject meta = new JSONObject(read(new File(root, sessionId + "/meta.json")));
        JSONArray e = meta.optJSONArray("entries");
        return e != null ? e : new JSONArray();
    }

    public JSONArray listSessions() {
        JSONArray out = new JSONArray();
        File[] dirs = root.listFiles();
        if (dirs == null) return out;
        for (File d : dirs) {
            if (!d.isDirectory()) continue;
            File metaFile = new File(d, "meta.json");
            if (!metaFile.exists()) continue;
            try {
                JSONObject meta = new JSONObject(read(metaFile));
                meta.put("id", d.getName());
                out.put(meta);
            } catch (Exception ignored) {}
        }
        return out;
    }

    public int clearSessions(String projectUri) {
        int n = 0;
        File[] dirs = root.listFiles();
        if (dirs == null) return 0;
        for (File d : dirs) {
            if (!d.isDirectory()) continue;
            String pu = "";
            try {
                JSONObject meta = new JSONObject(read(new File(d, "meta.json")));
                pu = meta.optString("projectUri", "");
            } catch (Exception e) { pu = ""; }
            // удаляем сессии этого проекта и старые сессии без привязки
            if (pu.equals(projectUri == null ? "" : projectUri) || pu.isEmpty()) {
                deleteRec(d);
                n++;
            }
        }
        return n;
    }

    public void markRolledBack(String sessionId) {
        try {
            File metaFile = new File(root, sessionId + "/meta.json");
            JSONObject meta = new JSONObject(read(metaFile));
            meta.put("rolled", true);
            write(metaFile, meta.toString());
        } catch (Exception ignored) {}
    }

    private void deleteRec(File f) {
        if (f.isDirectory()) {
            File[] c = f.listFiles();
            if (c != null) for (File x : c) deleteRec(x);
        }
        f.delete();
    }

    private String safeName(String path) {
        return path.replace('/', '_').replace('\\', '_');
    }

    private void write(File f, String data) {
        FileOutputStream fos = null;
        try {
            f.getParentFile().mkdirs();
            fos = new FileOutputStream(f);
            fos.write(data.getBytes("UTF-8"));
        } catch (Exception ignored) {
        } finally {
            try { if (fos != null) fos.close(); } catch (Exception ignored) {}
        }
    }

    private String read(File f) throws Exception {
        FileInputStream fis = new FileInputStream(f);
        byte[] buf = new byte[(int) f.length()];
        int off = 0;
        while (off < buf.length) {
            int n = fis.read(buf, off, buf.length - off);
            if (n < 0) break;
            off += n;
        }
        fis.close();
        return new String(buf, 0, off, "UTF-8");
    }
}