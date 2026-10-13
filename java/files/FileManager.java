package com.godotaistudio.app.files;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

public class FileManager {
    private final Context ctx;

    public FileManager(Context ctx) {
        this.ctx = ctx;
    }

    public String readProjectTree(Uri treeUri) throws Exception {
        return readTreeRecursive(treeUri, null, 0).toString();
    }

    private JSONObject readTreeRecursive(Uri treeUri, String documentId, int depth) throws Exception {
        // ИСПРАВЛЕНИЕ: корень тоже строится как document-URI
        if (documentId == null) {
            documentId = DocumentsContract.getTreeDocumentId(treeUri);
        }
        Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);

        JSONObject obj = new JSONObject();
        String name = queryColumn(docUri, DocumentsContract.Document.COLUMN_DISPLAY_NAME);
        obj.put("name", name != null ? name : "");
        obj.put("uri", docUri.toString());

        String mime = queryColumn(docUri, DocumentsContract.Document.COLUMN_MIME_TYPE);
        boolean isDir = DocumentsContract.Document.MIME_TYPE_DIR.equals(mime);
        obj.put("type", isDir ? "folder" : "file");

        if (isDir && depth < 6) {
            JSONArray children = new JSONArray();
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId);
            Cursor cursor = ctx.getContentResolver().query(childrenUri, null, null, null, null);
            if (cursor != null) {
                int idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
                int nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                while (cursor.moveToNext()) {
                    String childId = cursor.getString(idCol);
                    String childName = cursor.getString(nameCol);
                    if (childName != null && !childName.startsWith(".")) {
                        children.put(readTreeRecursive(treeUri, childId, depth + 1));
                    }
                }
                cursor.close();
            }
            obj.put("children", children);
        } else if (!isDir) {
            String size = queryColumn(docUri, DocumentsContract.Document.COLUMN_SIZE);
            obj.put("size", size != null ? size : "0");
        }
        return obj;
    }

    private String queryColumn(Uri docUri, String column) {
        Cursor cursor = ctx.getContentResolver().query(
            docUri, new String[]{column}, null, null, null);
        if (cursor != null && cursor.moveToFirst()) {
            String v = cursor.getString(0);
            cursor.close();
            return v;
        }
        return null;
    }

    public String readUri(Uri uri) throws Exception {
        InputStream is = ctx.getContentResolver().openInputStream(uri);
        if (is == null) throw new RuntimeException("Cannot open " + uri);
        BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line).append('\n');
        br.close();
        return sb.toString();
    }
}