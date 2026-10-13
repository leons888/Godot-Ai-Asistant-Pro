package com.godotaistudio.app.utils;

public class JsonHelper {
    public static String escapeForJs(String s) {
        return s.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "");
    }
}