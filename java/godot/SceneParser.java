package com.godotaistudio.app.godot;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SceneParser {
    public static JSONObject parse(String text) throws Exception {
        Pattern nodeP = Pattern.compile(
            "\\[node\\s+name=\"([^\"]+)\"\\s+type=\"([^\"]+)\"(?:\\s+parent=\"([^\"]*)\")?");
        JSONObject root = null;
        Map<String, JSONObject> byPath = new LinkedHashMap<>();

        for (String raw : text.split("\\r?\\n")) {
            Matcher m = nodeP.matcher(raw);
            if (!m.find()) {
                continue;
            }
            String name = m.group(1);
            String type = m.group(2);
            String parent = m.group(3);
            
            JSONObject n = new JSONObject();
            n.put("name", name);
            n.put("type", type);
            n.put("children", new JSONArray());

            String path;
            if (parent == null || parent.isEmpty()) {
                root = n;
                path = name;
            } else {
                path = parent.equals(".") ? name : parent + "/" + name;
            }
            byPath.put(path, n);

            if (parent != null && !parent.isEmpty()) {
                String parentPath = parent.equals(".")
                    ? (root != null ? root.getString("name") : "")
                    : parent;
                JSONObject pNode = byPath.get(parentPath);
                if (pNode != null) {
                    pNode.getJSONArray("children").put(n);
                }
            }
        }
        
        if (root == null) {
            JSONObject empty = new JSONObject();
            empty.put("name", "(empty)");
            empty.put("type", "Node");
            empty.put("children", new JSONArray());
            return empty;
        }
        return root;
    }
}