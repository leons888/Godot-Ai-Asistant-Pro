package com.godotaistudio.app.ai;

import com.godotaistudio.app.ai.providers.GeminiProvider;
import com.godotaistudio.app.ai.providers.OpenAiCompatibleProvider;
import com.godotaistudio.app.ai.providers.OpenRouterProvider;

import org.json.JSONArray;

public class AiClient {
    private final OpenRouterProvider openRouter = new OpenRouterProvider();
    private final GeminiProvider gemini = new GeminiProvider();
    private final OpenAiCompatibleProvider openAi = new OpenAiCompatibleProvider();

    public String chat(String provider, String model, String endpoint,
                       String apiKey, JSONArray messages) throws Exception {
        switch (provider.toLowerCase()) {
            case "openrouter":
                return openRouter.chat(model, apiKey, messages);
            case "gemini":
                return gemini.chat(model, apiKey, messages);
            case "groq":
            case "custom":
            case "huggingface":
                return openAi.chat(provider, model, endpoint, apiKey, messages);
            default:
                throw new RuntimeException("Unknown provider: " + provider);
        }
    }
}