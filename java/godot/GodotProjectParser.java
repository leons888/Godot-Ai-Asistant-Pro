package com.godotaistudio.app.godot;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class GodotProjectParser {
    public static JSONObject parse(String text) throws Exception {
        JSONObject out = new JSONObject();
        Map<String, Map<String, String>> sections = new LinkedHashMap<>();
        String current = "";
        sections.put(current, new LinkedHashMap<>());

        for (String raw : text.split("\\r?\\n")) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith(";")) {
                continue;
            }
            if (line.startsWith("[") && line.endsWith("]")) {
                current = line.substring(1, line.length() - 1);
                sections.put(current, new LinkedHashMap<>());
                continue;
            }
            int eq = line.indexOf('=');
            if (eq < 0) {
                continue;
            }
            String k = line.substring(0, eq).trim();
            String v = line.substring(eq + 1).trim();
            sections.get(current).put(k, v);
        }

        Map<String, String> app = sections.get("application");
        if (app != null) {
            out.put("name", unquote(app.getOrDefault("config/name", "")));
            out.put("main_scene", unquote(app.getOrDefault("run/main_scene", "")));
            String features = app.getOrDefault("config/features", "");
            Matcher m = Pattern.compile("\"([^\"]+)\"").matcher(features);
            JSONArray arr = new JSONArray();
            while (m.find()) {
                arr.put(m.group(1));
            }
            out.put("features", arr);
            for (int i = 0; i < arr.length(); i++) {
                String f = arr.getString(i);
                if (f.matches("\\d+\\.\\d+(\\.\\d+)?")) {
                    out.put("godot_version", f);
                    break;
                }
            }
        }
        
        String cvRaw = sections.get("").get("config_version");
        if (cvRaw != null) {
            try { out.put("config_version", Integer.parseInt(cvRaw.trim())); }
            catch (Exception ignored) {}
        }
        
        out.put("sections", new JSONArray(sections.keySet()));
        return out;
    }

    private static String unquote(String s) {
        if (s == null) {
            return "";
        }
        s = s.trim();
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            return s.substring(1, s.length() - 1);
        }
        return s;
    }
}