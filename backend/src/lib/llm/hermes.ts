import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import OpenAI from "openai";
import type {
    StreamChatParams,
    StreamChatResult,
    NormalizedToolCall,
} from "./types";

// ---------------------------------------------------------------------------
// Detect Hermes config (~/.hermes/config.yaml) and derive a local
// OpenAI-compatible client from it.
// ---------------------------------------------------------------------------

export interface HermesModelConfig {
    defaultModel: string;
    baseUrl: string;
    apiKey: string;
}

function findHermesConfigPath(): string | null {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return null;
    const p = path.join(home, ".hermes", "config.yaml");
    return fs.existsSync(p) ? p : null;
}

function readHermesEnv(configDir: string): Record<string, string> {
    const envPath = path.join(configDir, ".env");
    const env: Record<string, string> = {};
    if (!fs.existsSync(envPath)) return env;
    const text = fs.readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
        const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
        if (m) env[m[1]] = m[2].trim();
    }
    return env;
}

function extractApiKeyFromConfig(provider: string, env: Record<string, string>): string {
    switch (provider) {
        case "openrouter": return env.OPENROUTER_API_KEY || env.OPENAI_API_KEY || "";
        case "anthropic": return env.ANTHROPIC_API_KEY || "";
        case "openai": return env.OPENAI_API_KEY || "";
        case "gemini": return env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "";
        case "deepseek": return env.DEEPSEEK_API_KEY || "";
        case "xai":
        case "grok":
            return env.XAI_API_KEY || "";
        default:
            break;
    }
    // Generic lookup by provider name
    const keyVar = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
    return env[keyVar] || env["LOCAL_LLM_API_KEY"] || env["OPENAI_API_KEY"] || "";
}

export function detectHermesConfig(): HermesModelConfig | null {
    const configPath = findHermesConfigPath();
    if (!configPath) return null;

    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const doc = yaml.load(raw) as Record<string, unknown> | null;
        if (!doc || typeof doc !== "object") return null;

        const modelSection = (doc["model"] as Record<string, unknown>) || {};
        // Accept model.default or model.model
        const defaultModel = String(
            modelSection["default"] || modelSection["model"] || "local-llm",
        );
        const baseUrl =
            String(modelSection["base_url"] || "") ||
            process.env.LOCAL_LLM_BASE_URL ||
            process.env.HERMES_BASE_URL ||
            "http://localhost:8000/v1";

        const provider = String(modelSection["provider"] || "custom");
        const env = readHermesEnv(path.dirname(configPath));
        const apiKey =
            String(modelSection["api_key"] || "") ||
            extractApiKeyFromConfig(provider, env) ||
            process.env.LOCAL_LLM_API_KEY ||
            process.env.HERMES_API_KEY ||
            "no-api-key";

        return { defaultModel, baseUrl, apiKey };
    } catch {
        return null;
    }
}

function createClient(config?: Partial<HermesModelConfig>): OpenAI {
    const detected = detectHermesConfig();
    const baseURL = config?.baseUrl ?? detected?.baseUrl ?? "http://localhost:8000/v1";
    const apiKey = config?.apiKey ?? detected?.apiKey ?? "no-api-key";
    return new OpenAI({ baseURL, apiKey, dangerouslyAllowBrowser: false, timeout: 60000, maxRetries: 1 });
}

const HERMES_PLACEHOLDERS = new Set(["local-llm", "hermes-local", ""]);

function resolveModelName(given: string, _config?: Partial<HermesModelConfig>): string {
    const detected = detectHermesConfig();
    if (HERMES_PLACEHOLDERS.has(given)) {
        return detected?.defaultModel || "local-llm";
    }
    return given;
}

function toOpenAITools(tools: { type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((t) => ({
        type: "function" as const,
        function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters as Record<string, unknown>,
        },
    }));
}

export async function streamHermes(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    const {
        model,
        systemPrompt,
        tools = [],
        callbacks = {},
        runTools,
        maxIterations = 10,
    } = params;

    const client = createClient();
    const resolvedModel = resolveModelName(model);
    const openaiTools = tools.length ? toOpenAITools(tools) : undefined;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        ...params.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        })),
    ];

    console.log("[hermes] stream start — model:", resolvedModel, "tools:", openaiTools?.length ?? 0);

    let fullText = "";

    for (let iter = 0; iter < maxIterations; iter++) {
        let stream;
        try {
            stream = await client.chat.completions.create({
                model: resolvedModel,
                messages,
                tools: openaiTools,
                tool_choice: openaiTools ? "auto" : undefined,
                stream: true,
            });
        } catch (err: any) {
            console.error("[hermes] chat.completions.create failed:", err?.message || err);
            throw err;
        }

        let reasoningText = "";
        let contentText = "";

        // Accumulate tool-call deltas keyed by index
        const toolCallAcc: Map<
            number,
            { id: string; name: string; args: string }
        > = new Map();

        try {
            for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta;
                if (delta?.content) {
                    contentText += delta.content;
                    callbacks.onContentDelta?.(delta.content);
                }
                const rc = (delta as Record<string, unknown>)?.reasoning_content;
                if (typeof rc === "string") {
                    reasoningText += rc;
                    callbacks.onReasoningDelta?.(rc);
                }
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCallAcc.has(idx)) {
                            toolCallAcc.set(idx, { id: tc.id || "", name: "", args: "" });
                        }
                        const acc = toolCallAcc.get(idx)!;
                        if (tc.id) acc.id = tc.id;
                        if (tc.function?.name) acc.name += tc.function.name;
                        if (tc.function?.arguments) acc.args += tc.function.arguments;
                    }
                }
            }
        } catch (err: any) {
            console.error("[hermes] stream iteration failed:", err?.message || err);
            throw err;
        }

        fullText += contentText;

        if (callbacks.onReasoningBlockEnd && reasoningText) {
            callbacks.onReasoningBlockEnd?.();
        }

        const toolCalls: NormalizedToolCall[] = [];
        for (const [, acc] of Array.from(toolCallAcc.entries()).sort((a, b) => a[0] - b[0])) {
            if (!acc.name) continue;
            let parsedArgs: Record<string, unknown> = {};
            try {
                parsedArgs = JSON.parse(acc.args || "{}");
            } catch {
                parsedArgs = {};
            }
            const call: NormalizedToolCall = {
                id: acc.id || `call-${toolCalls.length}`,
                name: acc.name,
                input: parsedArgs,
            };
            callbacks.onToolCallStart?.(call);
            toolCalls.push(call);
        }

        if (!toolCalls.length || !runTools) {
            break;
        }

        const results = await runTools(toolCalls);

        // Push assistant turn with tool_calls
        messages.push({
            role: "assistant",
            content: contentText || null,
            tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam);

        for (const r of results) {
            messages.push({
                role: "tool",
                tool_call_id: r.tool_use_id,
                content: r.content,
            } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
        }

        // Continue loop for next model turn.
    }

    console.log("[hermes] stream finished — chars:", fullText.length);
    return { fullText };
}

export async function completeHermesText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
}): Promise<string> {
    const client = createClient();
    const resolvedModel = resolveModelName(params.model);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...(params.systemPrompt ? [{ role: "system" as const, content: params.systemPrompt }] : []),
        { role: "user", content: params.user },
    ];

    console.log("[hermes] completeText — model:", resolvedModel);

    const resp = await client.chat.completions.create({
        model: resolvedModel,
        messages,
        max_tokens: params.maxTokens ?? 512,
    });

    return resp.choices?.[0]?.message?.content || "";
}
