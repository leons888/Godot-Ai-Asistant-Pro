package com.godotaistudio.app.godot;

import org.json.JSONArray;
import org.json.JSONObject;

public class ProjectAnalyzer {

    public static JSONObject buildMap(JSONObject tree, JSONObject info) throws Exception {
        JSONObject map = new JSONObject();
        map.put("name", info.optString("name", tree.optString("name", "")));
        map.put("godotVersion", detectVersion(info));
        map.put("engineMajor", detectMajor(info));
        map.put("mainScene", info.optString("main_scene", ""));

        JSONArray scenes = new JSONArray();
        JSONArray scripts = new JSONArray();
        JSONArray assets = new JSONArray();
        JSONArray resources = new JSONArray();
        int[] files = {0};
        walk(tree, "", scenes, scripts, assets, resources, files);

        map.put("scenes", scenes);
        map.put("scripts", scripts);
        map.put("assets", assets);
        map.put("resources", resources);
        map.put("fileCount", files[0]);
        return map;
    }

    private static void walk(JSONObject node, String path, JSONArray scenes, JSONArray scripts,
                             JSONArray assets, JSONArray resources, int[] files) throws Exception {
        String name = node.optString("name", "");
        String cur = path.isEmpty() ? name : path + "/" + name;
        if ("file".equals(node.optString("type"))) {
            files[0]++;
            JSONObject e = new JSONObject();
            e.put("path", cur);
            e.put("uri", node.optString("uri", ""));
            if (name.endsWith(".tscn")) scenes.put(e);
            else if (name.endsWith(".gd")) scripts.put(e);
            else if (cur.contains("assets/")) assets.put(e);
            else if (cur.contains("resources/")) resources.put(e);
        } else {
            JSONArray ch = node.optJSONArray("children");
            if (ch != null) {
                for (int i = 0; i < ch.length(); i++) {
                    walk(ch.getJSONObject(i), cur, scenes, scripts, assets, resources, files);
                }
            }
        }
    }

    public static String detectVersion(JSONObject info) {
        String v = info.optString("godot_version", "");
        if (!v.isEmpty()) return v;
        int cv = info.optInt("config_version", 0);
        if (cv == 5) return "4.x";
        if (cv == 4) return "3.x";
        if (cv == 3) return "2.x";
        return "unknown";
    }

    public static int detectMajor(JSONObject info) {
        try {
            return Integer.parseInt(detectVersion(info).substring(0, 1));
        } catch (Exception e) {
            return 0;
        }
    }
}