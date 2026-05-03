import type { Provider } from "./types";
import { detectHermesConfig } from "./hermes";

// ---------------------------------------------------------------------------
// Canonical model IDs
// ---------------------------------------------------------------------------
// Main-chat tier (top-end) — user picks one of these per message.
export const CLAUDE_MAIN_MODELS = ["claude-opus-4-7", "claude-sonnet-4-6"] as const;
export const GEMINI_MAIN_MODELS = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
] as const;

// Mid-tier (used for tabular review) — user picks one in account settings.
export const CLAUDE_MID_MODELS = ["claude-sonnet-4-6"] as const;
export const GEMINI_MID_MODELS = ["gemini-3-flash-preview"] as const;

// Low-tier (used for title generation, lightweight extractions) — user picks
// one in account settings.
export const CLAUDE_LOW_MODELS = ["claude-haiku-4-5"] as const;
export const GEMINI_LOW_MODELS = ["gemini-3.1-flash-lite-preview"] as const;

// Local / Hermes (auto-detected from ~/.hermes/config.yaml)
export const HERMES_MAIN_MODELS = ["local-llm", "hermes-local"] as const;
export const HERMES_MID_MODELS = ["local-llm"] as const;
export const HERMES_LOW_MODELS = ["local-llm"] as const;

// Defaults prefer local-llm when Hermes config is detected
function _defaultModel(fallback: string): string {
    return detectHermesConfig() ? "local-llm" : fallback;
}

export const DEFAULT_MAIN_MODEL = _defaultModel("gemini-3-flash-preview");
export const DEFAULT_TITLE_MODEL = _defaultModel("gemini-3.1-flash-lite-preview");
export const DEFAULT_TABULAR_MODEL = _defaultModel("gemini-3-flash-preview");

const ALL_MODELS = new Set<string>([
    ...CLAUDE_MAIN_MODELS,
    ...GEMINI_MAIN_MODELS,
    ...CLAUDE_MID_MODELS,
    ...GEMINI_MID_MODELS,
    ...CLAUDE_LOW_MODELS,
    ...GEMINI_LOW_MODELS,
    ...HERMES_MAIN_MODELS,
    ...HERMES_MID_MODELS,
    ...HERMES_LOW_MODELS,
]);

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

export function providerForModel(model: string): Provider {
    if (model.startsWith("claude")) return "claude";
    if (model.startsWith("gemini")) return "gemini";
    return "hermes";
}

export function resolveModel(id: string | null | undefined, fallback: string): string {
    if (id && ALL_MODELS.has(id)) return id;
    return fallback;
}
