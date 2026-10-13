package com.godotaistudio.app.project;

import android.content.Context;

import com.godotaistudio.app.utils.Logger;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

public class ProjectCache {
    private final File cacheDir;
    private JSONObject memTree;
    private JSONObject memMap;

    public ProjectCache(Context ctx) {
        cacheDir = new File(ctx.getFilesDir(), "project_cache");
        if (!cacheDir.exists()) cacheDir.mkdirs();
    }

    public void saveTree(String uri, JSONObject tree) {
        memTree = tree;
        write(fileFor(uri, "tree.json"), tree.toString());
    }

    public JSONObject loadTree(String uri) {
        if (memTree != null) return memTree;
        String s = read(fileFor(uri, "tree.json"));
        if (s == null) return null;
        try { memTree = new JSONObject(s); } catch (Exception e) { memTree = null; }
        return memTree;
    }

    public void saveMap(String uri, JSONObject map) {
        memMap = map;
        write(fileFor(uri, "map.json"), map.toString());
    }

    public JSONObject loadMap(String uri) {
        if (memMap != null) return memMap;
        String s = read(fileFor(uri, "map.json"));
        if (s == null) return null;
        try { memMap = new JSONObject(s); } catch (Exception e) { memMap = null; }
        return memMap;
    }

    public void clear(String uri) {
        fileFor(uri, "tree.json").delete();
        fileFor(uri, "map.json").delete();
        memTree = null;
        memMap = null;
    }

    private File fileFor(String uri, String suffix) {
        return new File(cacheDir, Math.abs(uri.hashCode()) + "_" + suffix);
    }

    private void write(File f, String data) {
        FileOutputStream fos = null;
        try {
            fos = new FileOutputStream(f);
            fos.write(data.getBytes("UTF-8"));
        } catch (Exception e) {
            Logger.e("Cache", "write failed", e);
        } finally {
            try { if (fos != null) fos.close(); } catch (Exception ignored) {}
        }
    }

    private String read(File f) {
        if (!f.exists()) return null;
        FileInputStream fis = null;
        try {
            fis = new FileInputStream(f);
            byte[] buf = new byte[(int) f.length()];
            int off = 0;
            while (off < buf.length) {
                int n = fis.read(buf, off, buf.length - off);
                if (n < 0) break;
                off += n;
            }
            return new String(buf, 0, off, "UTF-8");
        } catch (Exception e) {
            Logger.e("Cache", "read failed", e);
            return null;
        } finally {
            try { if (fis != null) fis.close(); } catch (Exception ignored) {}
        }
    }
}