// =============================================================================
// @neo/shared — TypeScript types for the Neo4j knowledge graph
// =============================================================================
// Covers all node types in the 3-tier schema, operational nodes, relationship
// property types, and enums/union types for constrained fields.
// =============================================================================

// ---------------------------------------------------------------------------
// Enums & Union Types
// ---------------------------------------------------------------------------

/** Claim types for KnowledgeNode */
export type ClaimType =
  | "definition"
  | "causal_claim"
  | "trend"
  | "comparison"
  | "recommendation"
  | "prediction"
  | "framework"
  | "metric"
  | "case_study";

/** Evidence strength levels */
export type EvidenceStrength = "strong" | "moderate" | "weak" | "anecdotal";

/** Source types for evidence and knowledge nodes */
export type SourceType =
  | "industry_report"
  | "academic_paper"
  | "platform_data"
  | "expert_opinion"
  | "case_study"
  | "news_article"
  | "company_disclosure"
  | "government_data";

/** KnowledgeNode status */
export type KnowledgeNodeStatus =
  | "draft"
  | "active"
  | "stale"
  | "archived"
  | "superseded";

/** MasterDomain status */
export type MasterDomainStatus = "active" | "planned" | "building" | "archived";

/** Article processing status labels */
export type ArticleStatus = "pending" | "processing" | "processed" | "triaged";

/** CoverageTopic status */
export type CoverageTopicStatus = "covered" | "partial" | "gap" | "stale";

/** CoverageTopic target depth */
export type TargetDepth = "deep" | "working" | "awareness";

/** CoverageTopic / ResearchPrompt priority */
export type CoverageTopicPriority = "critical" | "important" | "nice-to-have";

/** ResearchPrompt source */
export type ResearchPromptSource =
  | "gap_detection"
  | "freshness_decay"
  | "manual"
  | "unclassified_cluster"
  | "coverage_map";

/** ResearchPrompt status */
export type ResearchPromptStatus =
  | "queued"
  | "needs_review"
  | "ready_for_research"
  | "researched"
  | "synthesizing"
  | "completed"
  | "failed"
  | "rejected";

/** SynthesisPrompt status */
export type SynthesisPromptStatus = "active" | "deprecated" | "draft";

// ---------------------------------------------------------------------------
// Relationship Stances & Property Enums
// ---------------------------------------------------------------------------

/** CAUSAL relationship direction */
export type CausalDirection = "positive" | "negative" | "bidirectional";

/** CAUSAL relationship strength */
export type CausalStrength = "primary" | "contributing" | "weak";

/** EPISTEMIC relationship stance */
export type EpistemicStance =
  | "supports"
  | "contradicts"
  | "supersedes"
  | "refines";

/** CONTEXTUAL relationship scope */
export type ContextualScope =
  | "qualifies"
  | "applies_to"
  | "except_when"
  | "depends_on";

/** STRUCTURAL relationship hierarchy */
export type StructuralHierarchy =
  | "is_a"
  | "part_of"
  | "instance_of"
  | "evolved_from"
  | "example_of"
  | "contains";

// ---------------------------------------------------------------------------
// Evidence Type (embedded in KnowledgeNode)
// ---------------------------------------------------------------------------

export interface Evidence {
  source: string;
  year: number;
  type: string;
  strength: EvidenceStrength;
  citation: string;
  methodology_summary?: string;
}

// ---------------------------------------------------------------------------
// Tier 0: MasterDomain
// ---------------------------------------------------------------------------

export interface MasterDomain {
  title: string;
  slug: string;
  description: string;
  status: MasterDomainStatus;
  color?: string;
}

// ---------------------------------------------------------------------------
// Tier 1: Domain
// ---------------------------------------------------------------------------

export interface Domain {
  title: string;
  slug: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Tier 2: KnowledgeNode
// ---------------------------------------------------------------------------

export interface KnowledgeNode {
  // Core (must exist)
  title: string;
  summary: string;
  definition: string;
  embedding: number[];

  // Standard (should exist)
  confidence?: number;
  freshness_date?: string;
  claim_type?: ClaimType;
  deep_content?: string;
  source_type?: SourceType;
  status?: KnowledgeNodeStatus;

  // Evidence (stored as JSON array on the node)
  evidence?: Evidence[];

  // Context qualifiers
  conditions?: string;
  temporal_range?: string;
  geographic_scope?: string;

  // Computed / enrichment
  evidence_count?: number;
  evidence_strength?: EvidenceStrength;
  source_diversity?: number;
  evidence_freshest_year?: number;
}

// ---------------------------------------------------------------------------
// Schema Registry Nodes
// ---------------------------------------------------------------------------

export interface NodeType {
  label: string;
  tier: string;
  version: number;
  required_properties: string[];
  standard_properties: string[];
  extended_properties: string[];
  serialization_template_id?: string;
  description: string;
}

export interface RelationshipCategory {
  category: string;
  version: number;
  valid_stances: string[];
  required_properties: string[];
  description: string;
  reasoning_hint: string;
}

// ---------------------------------------------------------------------------
// Operational Nodes
// ---------------------------------------------------------------------------

export interface Article {
  url: string;
  title: string;
  summary: string;
  full_text?: string;
  source_feed: string;
  fetch_date: string;
  embedding?: number[];
  status: ArticleStatus;
}

export interface CoverageTopic {
  title: string;
  status: CoverageTopicStatus;
  target_depth: TargetDepth;
  last_assessed?: string;
  priority: CoverageTopicPriority;
}

export interface ResearchPrompt {
  title: string;
  prompt_text: string;
  full_prompt?: string;
  status: ResearchPromptStatus;
  priority: number;
  source: ResearchPromptSource;
  domain_slug: string;
  master_domain: string;
  research_output?: string;
  research_word_count?: number;
  created_date?: string;
  researched_date?: string;
  completed_date?: string;
  error_message?: string;
}

export interface SynthesisPrompt {
  version: number;
  master_domain: string;
  effective_date: string;
  prompt_text: string;
  target_schema_version: number;
  status: SynthesisPromptStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Relationship Property Types
// ---------------------------------------------------------------------------

export interface CausalRelationshipProps {
  direction: CausalDirection;
  strength: CausalStrength;
  mechanism: string;
  confidence: number;
  source: string;
}

export interface EpistemicRelationshipProps {
  stance: EpistemicStance;
  confidence: number;
  source: string;
  mechanism?: string;
}

export interface ContextualRelationshipProps {
  scope: ContextualScope;
  conditions: string;
}

export interface StructuralRelationshipProps {
  hierarchy: StructuralHierarchy;
}

// ---------------------------------------------------------------------------
// Synthesis Pipeline Types
// ---------------------------------------------------------------------------

/** Input to the synthesis pipeline */
export interface SynthesisInput {
  text: string;
  domainSlug: string;
  masterDomainSlug?: string;
  source?: string;
}

/** A claim extracted by the LLM during synthesis */
export interface ExtractedClaim {
  title: string;
  definition: string;
  summary: string;
  claimType: ClaimType;
  confidence: number;
  evidence: Evidence[];
  relationships: ExtractedRelationship[];
}

/** A relationship extracted alongside a claim */
export interface ExtractedRelationship {
  targetTitle: string;
  category: string;
  type: string;
  stance: string;
  strength: number;
}

/** Result returned after a synthesis run */
export interface SynthesisResult {
  runId: string;
  domainSlug: string;
  claims: ExtractedClaim[];
  nodesCreated: number;
  relationshipsCreated: number;
  duplicatesFound: number;
  warnings: string[];
}

/** Record of a synthesis run for audit/tracking */
export interface SynthesisRunRecord {
  id: string;
  inputHash: string;
  domainSlug: string;
  status: "completed" | "failed" | "partial";
  nodesCreated: number;
  relationshipsCreated: number;
  duplicateWarnings: number;
  createdAt: string;
  completedAt?: string;
  errors: string[];
}

/** Result of ingesting nodes into the graph */
export interface IngestResult {
  nodesCreated: number;
  nodesMerged: number;
  duplicatesFound: number;
  warnings: string[];
  nodeIds: string[];
}

/** Result of ingesting relationships into the graph */
export interface RelIngestResult {
  relationshipsCreated: number;
  relationshipsSkipped: number;
  warnings: string[];
}
