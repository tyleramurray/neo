// =============================================================================
// @neo/shared — Zod schemas for MCP tool input validation
// =============================================================================
// Each schema validates input for a specific MCP tool operation. All
// constraints (max lengths, ranges, patterns) are enforced here so that
// downstream code can trust validated data.
// =============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable field schemas
// ---------------------------------------------------------------------------

/** Lowercase alphanumeric + hyphens, 1-100 chars */
const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)",
  );

/** Hex color string, e.g. "#ff00aa" or "#FFF" */
const hexColorSchema = z
  .string()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Must be a valid hex color (e.g. #ff00aa)",
  );

/** Claim type enum */
const claimTypeSchema = z.enum([
  "definition",
  "causal_claim",
  "trend",
  "comparison",
  "recommendation",
  "prediction",
  "framework",
  "metric",
  "case_study",
]);

/** Evidence strength enum */
const evidenceStrengthSchema = z.enum([
  "strong",
  "moderate",
  "weak",
  "anecdotal",
]);

/** Evidence object schema */
const evidenceSchema = z.object({
  source: z.string().min(1).max(500),
  year: z.number().int().min(1900).max(2100),
  type: z.string().min(1).max(200),
  strength: evidenceStrengthSchema,
  citation: z.string().min(1).max(2000),
  methodology_summary: z.string().max(5000).optional(),
});

// ---------------------------------------------------------------------------
// MasterDomain
// ---------------------------------------------------------------------------

export const CreateMasterDomainInput = z.object({
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().min(1).max(2000),
  color: hexColorSchema.optional(),
});
export type CreateMasterDomainInput = z.infer<typeof CreateMasterDomainInput>;

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export const CreateDomainInput = z.object({
  title: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().min(1).max(2000),
  master_domain_slug: slugSchema,
});
export type CreateDomainInput = z.infer<typeof CreateDomainInput>;

// ---------------------------------------------------------------------------
// KnowledgeNode
// ---------------------------------------------------------------------------

export const CreateKnowledgeNodeInput = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  definition: z.string().min(1).max(5000),
  deep_content: z.string().max(50000).optional(),
  claim_type: claimTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
  domain_slug: slugSchema,
  evidence: z.array(evidenceSchema).optional(),
  conditions: z.string().max(2000).optional(),
  temporal_range: z.string().max(500).optional(),
  geographic_scope: z.string().max(500).optional(),
});
export type CreateKnowledgeNodeInput = z.infer<typeof CreateKnowledgeNodeInput>;

export const UpdateKnowledgeNodeInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(1000).optional(),
  definition: z.string().min(1).max(5000).optional(),
  deep_content: z.string().max(50000).optional(),
  claim_type: claimTypeSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  domain_slug: slugSchema.optional(),
  evidence: z.array(evidenceSchema).optional(),
  conditions: z.string().max(2000).optional(),
  temporal_range: z.string().max(500).optional(),
  geographic_scope: z.string().max(500).optional(),
});
export type UpdateKnowledgeNodeInput = z.infer<typeof UpdateKnowledgeNodeInput>;

// ---------------------------------------------------------------------------
// Query / Retrieval
// ---------------------------------------------------------------------------

export const QueryKnowledgeInput = z.object({
  query: z.string().min(1).max(2000),
  top_k: z.number().int().min(1).max(50).default(10),
  domain_filter: z.string().optional(),
});
export type QueryKnowledgeInput = z.infer<typeof QueryKnowledgeInput>;

// ---------------------------------------------------------------------------
// List / Pagination
// ---------------------------------------------------------------------------

export const ListInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export type ListInput = z.infer<typeof ListInput>;

export const ListDomainsInput = ListInput.extend({
  master_domain_slug: slugSchema.optional(),
});
export type ListDomainsInput = z.infer<typeof ListDomainsInput>;

export const ListKnowledgeNodesInput = ListInput.extend({
  domain_slug: slugSchema.optional(),
});
export type ListKnowledgeNodesInput = z.infer<typeof ListKnowledgeNodesInput>;

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export const DeleteInput = z.object({
  id: z.string().min(1),
});
export type DeleteInput = z.infer<typeof DeleteInput>;
