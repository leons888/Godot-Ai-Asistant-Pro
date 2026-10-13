package com.godotaistudio.app.project;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

public class ProjectStore {
    private static final String PREFS = "godot_ai_projects";
    private static final String KEY_RECORDS = "records";
    private static final String KEY_LAST_URI = "last_uri";
    private static final int MAX_RECORDS = 10;

    private final SharedPreferences prefs;

    public ProjectStore(Context ctx) {
        prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public void saveRecord(String uri, String name, String godotVersion) {
        try {
            JSONArray recs = new JSONArray(prefs.getString(KEY_RECORDS, "[]"));
            JSONArray out = new JSONArray();
            JSONObject rec = new JSONObject();
            rec.put("uri", uri);
            rec.put("name", name);
            rec.put("godotVersion", godotVersion);
            rec.put("at", System.currentTimeMillis());
            out.put(rec);
            for (int i = 0; i < recs.length() && out.length() < MAX_RECORDS; i++) {
                JSONObject r = recs.getJSONObject(i);
                if (!r.optString("uri").equals(uri)) out.put(r);
            }
            prefs.edit()
                 .putString(KEY_RECORDS, out.toString())
                 .putString(KEY_LAST_URI, uri)
                 .apply();
        } catch (Exception ignored) {}
    }

    public String getRecordsJson() {
        return prefs.getString(KEY_RECORDS, "[]");
    }

    public String getLastUri() {
        return prefs.getString(KEY_LAST_URI, "");
    }

    public void removeRecord(String uri) {
        try {
            JSONArray recs = new JSONArray(prefs.getString(KEY_RECORDS, "[]"));
            JSONArray out = new JSONArray();
            for (int i = 0; i < recs.length(); i++) {
                JSONObject r = recs.getJSONObject(i);
                if (!r.optString("uri").equals(uri)) out.put(r);
            }
            SharedPreferences.Editor e = prefs.edit().putString(KEY_RECORDS, out.toString());
            if (uri.equals(getLastUri())) e.remove(KEY_LAST_URI);
            e.apply();
        } catch (Exception ignored) {}
    }
}