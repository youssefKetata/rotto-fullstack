import "server-only";

import { SEARCH_SYSTEM_PROMPT } from "./prompt";
import {
  SEARCH_LIMITS,
  validateSearchFilters,
  type SearchFilters,
  type SearchIssue,
} from "./schema";

// Pin one free-tier model. No paid fallback, tools, grounding, or candidate profiles.
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
// Include first-connection setup and provider latency, not just a warm response.
export const GEMINI_TIMEOUT_MS = 15000;

export type GeminiErrorCode =
  "configuration" | "input" | "timeout" | "unavailable" | "invalid_response";

export class GeminiError extends Error {
  constructor(
    public readonly code: GeminiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function assertGeminiConfigured() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new GeminiError(
      "configuration",
      "Search interpretation is not configured.",
    );
  }
}

const unavailableFields = [
  {
    pattern: /\b(?:remote|hybrid|work(?:ing)?\s+from\s+home|on[- ]site)\b/i,
    label: "Remote, hybrid, or on-site work requirements are not recorded.",
  },
  {
    pattern:
      /\b(?:speak(?:s|ing)?|fluency|fluent|bilingual|multilingual|language\s+proficiency)\b|\b(?:Japanese|Mandarin|French|Spanish|German|Arabic|Korean|Hindi)\s+(?:speakers?|speaking)\b/i,
    label: "Language proficiency is not recorded.",
  },
  {
    pattern:
      /\b(?:salary|salaries|compensation|wages?|earnings?|pay\s+range)\b|[$€£]\s*\d/i,
    label: "Salary and compensation requirements are not recorded.",
  },
  {
    pattern:
      /\b(?:visa|sponsorship|citizenship|citizen|work\s+authori[sz]ation)\b/i,
    label: "Visa, citizenship, and work authorization are not recorded.",
  },
  {
    pattern: /\brelocat(?:e|ion|ing)\b|\bwilling\s+to\s+move\b/i,
    label: "Willingness to relocate is not recorded.",
  },
  {
    pattern:
      /\b(?:culture\s+fit|personality|rockstar|high[- ]performing|top[- ]performer|excellent|exceptional|strong)\b/i,
    label:
      "Candidate quality, proficiency, and culture fit cannot be verified from this data.",
  },
] as const;

const hostileDirective =
  /\b(?:ignore|disregard|override|forget)\b[\s\S]{0,100}\b(?:instructions|rules|system|prompt)\b|\b(?:drop|truncate|alter)\s+table\b|\bdelete\s+from\b/i;
const optionalWording =
  /\b(?:prefer(?:red|ably)?|optional|ideally|bonus|nice\s+to\s+have)\b/i;

/** A second boundary catches common unsupported requirements omitted by the model. */
function guardRequirements(
  brief: string,
  filters: SearchFilters,
): SearchFilters {
  if (hostileDirective.test(brief)) {
    return {
      version: 1,
      anyOf: [],
      preferred: [],
      issues: [
        {
          text: "Use candidate requirements rather than instructions to change the search system.",
          kind: "ambiguous",
          required: true,
        },
      ],
    };
  }
  const issues = [...filters.issues];
  for (const field of unavailableFields) {
    const clauses = brief
      .split(/[,;\n.!?]/)
      .filter((clause) => field.pattern.test(clause));
    if (!clauses.length) continue;
    const required = clauses.some((clause) => !optionalWording.test(clause));
    if (
      issues.some(
        (issue) =>
          issue.kind === "unsupported" &&
          field.pattern.test(issue.text) &&
          (issue.required || !required),
      )
    )
      continue;
    const issue: SearchIssue = {
      text: field.label,
      kind: "unsupported",
      required,
    };
    issues.push(issue);
  }
  if (issues.length > SEARCH_LIMITS.maxIssues) {
    throw new GeminiError(
      "invalid_response",
      "The brief contains too many requirements to interpret safely.",
    );
  }
  return { ...filters, issues };
}

type InterpreterOptions = {
  fetch?: typeof globalThis.fetch;
  getApiKey?: () => string | undefined;
  timeoutMs?: number;
};

type ProviderPayload = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  promptFeedback?: { blockReason?: string };
};

/** Injection is for ordinary mocked tests; the production adapter reads the environment. */
export function createGeminiInterpreter(options: InterpreterOptions = {}) {
  return async function interpret(brief: string): Promise<SearchFilters> {
    if (
      typeof brief !== "string" ||
      !brief.trim() ||
      brief.length > SEARCH_LIMITS.maxBriefLength
    ) {
      throw new GeminiError(
        "input",
        `Enter a brief of 1–${SEARCH_LIMITS.maxBriefLength} characters.`,
      );
    }
    const apiKey = (
      options.getApiKey ? options.getApiKey() : process.env.GEMINI_API_KEY
    )?.trim();
    if (!apiKey)
      throw new GeminiError(
        "configuration",
        "Search interpretation is not configured.",
      );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? GEMINI_TIMEOUT_MS,
    );
    try {
      const response = await (options.fetch ?? globalThis.fetch)(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SEARCH_SYSTEM_PROMPT }] },
            contents: [
              {
                role: "user",
                parts: [{ text: JSON.stringify({ brief: brief.trim() }) }],
              },
            ],
            generationConfig: {
              candidateCount: 1,
              maxOutputTokens: 1536,
              thinkingConfig: {
                thinkingLevel: "MINIMAL",
                includeThoughts: false,
              },
              responseFormat: {
                text: {
                  mimeType: "APPLICATION_JSON",
                },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new GeminiError(
            "configuration",
            "The search provider could not authorize this configuration.",
          );
        }
        throw new GeminiError(
          "unavailable",
          response.status === 429
            ? "The free model quota is temporarily unavailable. Try again later."
            : "Search interpretation is temporarily unavailable. Try again later.",
        );
      }
      const text = await response.text();
      if (controller.signal.aborted)
        throw new GeminiError(
          "timeout",
          "Search interpretation timed out. Try again.",
        );
      if (text.length > 65536)
        throw new GeminiError(
          "invalid_response",
          "The search provider returned an invalid interpretation.",
        );
      let payload: ProviderPayload;
      try {
        payload = JSON.parse(text) as ProviderPayload;
      } catch {
        throw new GeminiError(
          "invalid_response",
          "The search provider returned an invalid interpretation.",
        );
      }
      const candidate = payload?.candidates?.[0];
      if (
        payload?.promptFeedback?.blockReason ||
        candidate?.finishReason !== "STOP" ||
        !Array.isArray(candidate.content?.parts) ||
        candidate.content.parts.some(
          (part) => !part || typeof part !== "object",
        )
      ) {
        throw new GeminiError(
          "invalid_response",
          "The search provider could not finish a safe interpretation.",
        );
      }
      const output = candidate.content.parts
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        throw new GeminiError(
          "invalid_response",
          "The search provider returned an invalid interpretation.",
        );
      }
      const filters = validateSearchFilters(parsed);
      if (!filters)
        throw new GeminiError(
          "invalid_response",
          "The search provider returned unsupported filter values.",
        );
      return guardRequirements(brief, filters);
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      if (controller.signal.aborted)
        throw new GeminiError(
          "timeout",
          "Search interpretation timed out. Try again.",
        );
      // Do not expose raw provider errors: URLs, request bodies and credentials can be included.
      throw new GeminiError(
        "unavailable",
        "Search interpretation is temporarily unavailable. Try again later.",
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const interpretBrief = createGeminiInterpreter();
