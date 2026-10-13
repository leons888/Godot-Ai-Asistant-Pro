package com.godotaistudio.app.files;

import android.content.Context;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class FileWriter {
    private final Context ctx;

    public FileWriter(Context ctx) {
        this.ctx = ctx;
    }

    public void write(Uri docUri, String content) throws Exception {
        OutputStream os = ctx.getContentResolver().openOutputStream(docUri, "wt");
        if (os == null) throw new RuntimeException("Cannot open for write: " + docUri);
        os.write(content.getBytes("UTF-8"));
        os.flush();
        os.close();
    }

    public Uri createFile(Uri parentDocUri, String name, String content) throws Exception {
        // "*/*" — иначе провайдер хранилища дописывает .txt к "незнакомым" расширениям (.gd, .cfg)
        Uri created = DocumentsContract.createDocument(
            ctx.getContentResolver(), parentDocUri, "*/*", name);
        if (created == null) throw new RuntimeException("createDocument returned null");
        write(created, content);
        return created;
    }

    public boolean delete(Uri docUri) throws Exception {
        return DocumentsContract.deleteDocument(ctx.getContentResolver(), docUri);
    }

    public String read(Uri docUri) throws Exception {
        InputStream is = ctx.getContentResolver().openInputStream(docUri);
        if (is == null) throw new RuntimeException("Cannot open " + docUri);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
        is.close();
        return new String(bos.toByteArray(), "UTF-8");
    }
}