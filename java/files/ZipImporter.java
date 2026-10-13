package com.godotaistudio.app.files;

import android.content.Context;
import android.net.Uri;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class ZipImporter {
    private final Context ctx;

    public ZipImporter(Context ctx) {
        this.ctx = ctx;
    }

    public String importFromUri(Uri zipUri, Uri targetTreeUri) throws Exception {
        File tempZip = File.createTempFile("gas_import_", ".zip", ctx.getCacheDir());
        try {
            copyUriToFile(zipUri, tempZip);
            return extractToTree(tempZip, targetTreeUri);
        } finally {
            tempZip.delete();
        }
    }

    public String importFromUrl(String urlStr, Uri targetTreeUri) throws Exception {
        File tempZip = File.createTempFile("gas_url_", ".zip", ctx.getCacheDir());
        HttpURLConnection c = null;
        InputStream is = null;
        OutputStream os = null;
        try {
            c = (HttpURLConnection) new URL(urlStr).openConnection();
            c.setConnectTimeout(30000);
            c.setReadTimeout(120000);
            c.setRequestProperty("User-Agent", "GodotAIStudio/0.7");
            is = c.getInputStream();
            os = new FileOutputStream(tempZip);
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) os.write(buf, 0, n);
            os.close(); is.close(); c.disconnect();
            return extractToTree(tempZip, targetTreeUri);
        } finally {
            try { if (os != null) os.close(); } catch (Exception ignored) {}
            try { if (is != null) is.close(); } catch (Exception ignored) {}
            if (c != null) c.disconnect();
            tempZip.delete();
        }
    }

    private void copyUriToFile(Uri uri, File out) throws Exception {
        InputStream is = ctx.getContentResolver().openInputStream(uri);
        if (is == null) throw new RuntimeException("Cannot open " + uri);
        OutputStream os = new FileOutputStream(out);
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) os.write(buf, 0, n);
        is.close();
        os.close();
    }

    private String extractToTree(File zipFile, Uri targetTreeUri) throws Exception {
        FileManager fm = new FileManager(ctx);
        FileWriter fw = new FileWriter(ctx);
        ZipInputStream zis = new ZipInputStream(new java.io.FileInputStream(zipFile));
        ZipEntry entry;
        int files = 0;
        String rootName = null;
        while ((entry = zis.getNextEntry()) != null) {
            String name = entry.getName();
            if (name.startsWith("/") || name.contains("..")) continue;
            if (rootName == null) {
                int slash = name.indexOf('/');
                rootName = slash > 0 ? name.substring(0, slash) : name;
            }
            if (entry.isDirectory()) continue;
            // читаем содержимое
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = zis.read(buf)) != -1) bos.write(buf, 0, n);
            String content = bos.toString("UTF-8");
            // путь относительно корня архива
            String rel = name;
            if (rel.startsWith(rootName + "/")) rel = rel.substring(rootName.length() + 1);
            if (rel.isEmpty()) { zis.closeEntry(); continue; }
            // создаём папки по пути
            Uri parentUri = targetTreeUri;
            String[] parts = rel.split("/");
            for (int i = 0; i < parts.length - 1; i++) {
                Uri existing = findChildUri(fm, parentUri, parts[i], true);
                if (existing != null) {
                    parentUri = existing;
                } else {
                    parentUri = fw.createFile(parentUri, parts[i], "");
                }
            }
            String fileName = parts[parts.length - 1];
            Uri existing = findChildUri(fm, parentUri, fileName, false);
            if (existing != null) {
                fw.write(existing, content);
            } else {
                fw.createFile(parentUri, fileName, content);
            }
            files++;
            zis.closeEntry();
        }
        zis.close();
        return "Импортировано файлов: " + files;
    }

    private Uri findChildUri(FileManager fm, Uri parentUri, String name, boolean folder) {
        // FileManager не даёт списка детей — используем DocumentsContract напрямую
        try {
            String docId = android.provider.DocumentsContract.getTreeDocumentId(parentUri);
            Uri childrenUri = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(parentUri, docId);
            android.database.Cursor cursor = ctx.getContentResolver().query(
                childrenUri,
                new String[]{
                    android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE
                }, null, null, null);
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String childName = cursor.getString(1);
                    String mime = cursor.getString(2);
                    boolean isDir = android.provider.DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
                    if (name.equals(childName) && isDir == folder) {
                        String childId = cursor.getString(0);
                        Uri childUri = android.provider.DocumentsContract.buildDocumentUriUsingTree(parentUri, childId);
                        cursor.close();
                        return childUri;
                    }
                }
                cursor.close();
            }
        } catch (Exception ignored) {}
        return null;
    }
}