// =============================================================================
// @neo/shared — Claude extraction engine for knowledge synthesis
// =============================================================================
// Builds prompts and extracts structured claims from research text using
// Anthropic's Claude API. Primary method: Structured Outputs (output_config
// with JSON schema). Fallback: tool_choice forcing. Two-layer Zod validation.
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  ExtractedClaimSchema,
  ExtractedClaimLenientSchema,
} from "../schemas.js";
import type {
  SynthesisInput,
  SynthesisPrompt,
  ExtractedClaim,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 16000;

// ---------------------------------------------------------------------------
// JSON Schema for ExtractedClaim[] (used by both structured outputs and tools)
// ---------------------------------------------------------------------------

const EVIDENCE_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false as const,
  properties: {
    source: { type: "string" as const },
    year: { type: "number" as const },
    type: { type: "string" as const },
    strength: {
      type: "string" as const,
      enum: ["strong", "moderate", "weak", "anecdotal"],
    },
    citation: { type: "string" as const },
    methodology_summary: { type: "string" as const },
  },
  required: ["source", "year", "type", "strength", "citation"],
};

const RELATIONSHIP_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false as const,
  properties: {
    targetTitle: { type: "string" as const },
    category: {
      type: "string" as const,
      enum: ["CAUSAL", "EPISTEMIC", "CONTEXTUAL", "STRUCTURAL"],
    },
    type: { type: "string" as const },
    stance: { type: "string" as const },
    strength: { type: "number" as const },
  },
  required: ["targetTitle", "category", "type", "stance", "strength"],
};

const CLAIM_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false as const,
  properties: {
    title: { type: "string" as const },
    definition: { type: "string" as const },
    summary: { type: "string" as const },
    claimType: {
      type: "string" as const,
      enum: [
        "definition",
        "causal_claim",
        "trend",
        "comparison",
        "recommendation",
        "prediction",
        "framework",
        "metric",
        "case_study",
      ],
    },
    confidence: { type: "number" as const },
    evidence: {
      type: "array" as const,
      items: EVIDENCE_JSON_SCHEMA,
    },
    relationships: {
      type: "array" as const,
      items: RELATIONSHIP_JSON_SCHEMA,
    },
  },
  required: [
    "title",
    "definition",
    "summary",
    "claimType",
    "confidence",
    "evidence",
    "relationships",
  ],
};

const CLAIMS_WRAPPER_JSON_SCHEMA = {
  type: "object" as const,
  additionalProperties: false as const,
  properties: {
    claims: {
      type: "array" as const,
      items: CLAIM_JSON_SCHEMA,
    },
  },
  required: ["claims"],
};

// ---------------------------------------------------------------------------
// buildSynthesisPrompt
// ---------------------------------------------------------------------------

/**
 * Constructs Claude messages with system prompt, user text, and output structure.
 *
 * Returns an object containing `system` (string), `messages` (array), and
 * `output_config` (JSON schema format) suitable for passing to the Anthropic API.
 */
export function buildSynthesisPrompt(
  input: SynthesisInput,
  synthesisPrompt: SynthesisPrompt,
): {
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  output_config: {
    format: { type: "json_schema"; schema: Record<string, unknown> };
  };
} {
  const domainContext = input.masterDomainSlug
    ? `Master domain: ${input.masterDomainSlug}, Domain: ${input.domainSlug}`
    : `Domain: ${input.domainSlug}`;

  const sourceContext = input.source ? `\nSource: ${input.source}` : "";

  const systemPrompt = [
    synthesisPrompt.prompt_text,
    "",
    `Schema version: ${synthesisPrompt.target_schema_version}`,
    domainContext,
    "",
    "You MUST respond with a JSON object containing a single key 'claims' whose value is an array of extracted claim objects.",
    "Each claim must have: title, definition, summary, claimType, confidence, evidence (array), relationships (array).",
  ].join("\n");

  const userText = [
    "Extract knowledge claims from the following research text.",
    sourceContext,
    "",
    "---",
    input.text,
    "---",
  ].join("\n");

  return {
    system: systemPrompt,
    messages: [{ role: "user", content: userText }],
    output_config: {
      format: {
        type: "json_schema",
        schema: CLAIMS_WRAPPER_JSON_SCHEMA,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Claim validation (two-layer Zod)
// ---------------------------------------------------------------------------

interface ValidatedClaimsResult {
  claims: ExtractedClaim[];
  warnings: string[];
}

function validateClaims(rawClaims: unknown[]): ValidatedClaimsResult {
  const claims: ExtractedClaim[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < rawClaims.length; i++) {
    const raw = rawClaims[i];

    // First try: strict parse
    const strict = ExtractedClaimSchema.safeParse(raw);
    if (strict.success) {
      claims.push(strict.data);
      continue;
    }

    // Second try: lenient parse (with defaults)
    const lenient = ExtractedClaimLenientSchema.safeParse(raw);
    if (lenient.success) {
      warnings.push(
        `Claim ${i}: passed lenient validation only (strict errors: ${strict.error.message})`,
      );
      claims.push(lenient.data);
      continue;
    }

    // Both failed: skip and warn
    warnings.push(
      `Claim ${i}: skipped — failed both strict and lenient validation. ` +
        `Strict: ${strict.error.message}. Lenient: ${lenient.error.message}`,
    );
  }

  return { claims, warnings };
}

// ---------------------------------------------------------------------------
// Response parsing helpers
// ---------------------------------------------------------------------------

function parseStructuredOutputResponse(
  response: Anthropic.Message,
): unknown[] | null {
  for (const block of response.content) {
    if (block.type === "text") {
      try {
        const parsed = JSON.parse(block.text) as Record<string, unknown>;
        if (Array.isArray(parsed.claims)) {
          return parsed.claims as unknown[];
        }
        // If the response is directly an array, treat it as claims
        if (Array.isArray(parsed)) {
          return parsed as unknown[];
        }
      } catch {
        // JSON parse failed, continue to next block
      }
    }
  }
  return null;
}

function parseToolChoiceResponse(
  response: Anthropic.Message,
): unknown[] | null {
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "extract_claims") {
      const input = block.input as Record<string, unknown>;
      if (Array.isArray(input.claims)) {
        return input.claims as unknown[];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// extractClaims
// ---------------------------------------------------------------------------

/**
 * Calls Claude to extract knowledge claims from research text.
 *
 * Primary method: Structured Outputs (output_config with JSON schema).
 * Fallback: tool_choice forcing with equivalent schema.
 *
 * Each extracted claim goes through two-layer Zod validation:
 * 1. ExtractedClaimSchema.safeParse() (strict)
 * 2. ExtractedClaimLenientSchema.safeParse() (with defaults)
 * Claims failing both layers are skipped with warnings.
 */
export async function extractClaims(
  client: Anthropic,
  input: SynthesisInput,
  synthesisPrompt: SynthesisPrompt,
  model?: string,
): Promise<ExtractedClaim[]> {
  const resolvedModel = model ?? DEFAULT_MODEL;
  const prompt = buildSynthesisPrompt(input, synthesisPrompt);
  const warnings: string[] = [];

  // -----------------------------------------------------------------------
  // Extract claims via tool_choice forcing
  // -----------------------------------------------------------------------
  let rawClaims: unknown[] | null = null;

  try {
    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: MAX_TOKENS,
      system: prompt.system,
      messages: prompt.messages,
      tools: [
        {
          name: "extract_claims",
          description:
            "Extract knowledge claims from research text. Return all claims found.",
          input_schema: {
            type: "object" as const,
            properties: CLAIMS_WRAPPER_JSON_SCHEMA.properties,
            required: CLAIMS_WRAPPER_JSON_SCHEMA.required,
          },
        },
      ],
      tool_choice: { type: "tool", name: "extract_claims" },
    });

    rawClaims = parseToolChoiceResponse(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(`Extraction failed: ${errorMessage}`);
  }

  // -----------------------------------------------------------------------
  // No claims from either method
  // -----------------------------------------------------------------------
  if (rawClaims === null || rawClaims.length === 0) {
    if (warnings.length > 0) {
      console.warn("[synthesis] extraction warnings:", warnings.join("; "));
    }
    return [];
  }

  // -----------------------------------------------------------------------
  // Validate with two-layer Zod
  // -----------------------------------------------------------------------
  const validated = validateClaims(rawClaims);

  // Log all warnings (from extraction + validation)
  for (const w of [...warnings, ...validated.warnings]) {
    console.warn(`[synthesis] ${w}`);
  }

  return validated.claims;
}
