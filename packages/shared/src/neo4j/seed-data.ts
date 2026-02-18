// =============================================================================
// @neo/shared — Static seed data for Neo4j knowledge graph
// =============================================================================
// Pure data definitions. No logic, no side effects.
// Used by seed.ts to populate the graph idempotently.
// =============================================================================

import type {
  NodeType,
  RelationshipCategory,
  MasterDomain,
  Domain,
  SynthesisPrompt,
} from "../types.js";

// ---------------------------------------------------------------------------
// NodeType Registry (Schema Registry)
// ---------------------------------------------------------------------------

export const NODE_TYPES: readonly NodeType[] = [
  {
    label: "MasterDomain",
    tier: "0",
    version: 1,
    required_properties: ["title", "slug", "description", "status"],
    standard_properties: ["color"],
    extended_properties: [],
    description:
      "Top-level domain grouping. Each MasterDomain owns a set of Domains.",
  },
  {
    label: "Domain",
    tier: "1",
    version: 1,
    required_properties: ["title", "slug", "description"],
    standard_properties: [],
    extended_properties: [],
    description:
      "Thematic subdivision of a MasterDomain. Domains group related KnowledgeNodes.",
  },
  {
    label: "KnowledgeNode",
    tier: "2",
    version: 1,
    required_properties: ["title", "summary", "definition", "embedding"],
    standard_properties: [
      "confidence",
      "freshness_date",
      "claim_type",
      "deep_content",
      "source_type",
      "status",
    ],
    extended_properties: [
      "evidence",
      "conditions",
      "temporal_range",
      "geographic_scope",
      "evidence_count",
      "evidence_strength",
      "source_diversity",
      "evidence_freshest_year",
    ],
    description:
      "Atomic knowledge claim with embedding for vector search. The core unit of the knowledge graph.",
  },
] as const;

// ---------------------------------------------------------------------------
// RelationshipCategory Registry
// ---------------------------------------------------------------------------

export const RELATIONSHIP_CATEGORIES: readonly RelationshipCategory[] = [
  {
    category: "CAUSAL",
    version: 1,
    valid_stances: ["positive", "negative", "bidirectional"],
    required_properties: [
      "direction",
      "strength",
      "mechanism",
      "confidence",
      "source",
    ],
    description: "Cause-and-effect relationships between knowledge nodes",
    reasoning_hint: "Explains WHY one thing influences another",
  },
  {
    category: "EPISTEMIC",
    version: 1,
    valid_stances: ["supports", "contradicts", "supersedes", "refines"],
    required_properties: ["stance", "confidence", "source"],
    description: "Knowledge-about-knowledge relationships",
    reasoning_hint:
      "How one piece of knowledge relates to the certainty of another",
  },
  {
    category: "CONTEXTUAL",
    version: 1,
    valid_stances: ["qualifies", "applies_to", "except_when", "depends_on"],
    required_properties: ["scope", "conditions"],
    description: "Conditional applicability relationships",
    reasoning_hint: "Under what conditions or contexts knowledge applies",
  },
  {
    category: "STRUCTURAL",
    version: 1,
    valid_stances: [
      "is_a",
      "part_of",
      "instance_of",
      "evolved_from",
      "example_of",
      "contains",
    ],
    required_properties: ["hierarchy"],
    description: "Taxonomic and compositional relationships",
    reasoning_hint: "How knowledge nodes are organized hierarchically",
  },
] as const;

// ---------------------------------------------------------------------------
// eCommerce MasterDomain
// ---------------------------------------------------------------------------

export const ECOM_MASTER_DOMAIN: MasterDomain = {
  title: "eCommerce",
  slug: "ecommerce",
  description: "eCommerce strategy, operations, and technology",
  status: "active",
  color: "#4F46E5",
};

// ---------------------------------------------------------------------------
// eCommerce Domains (16)
// ---------------------------------------------------------------------------

export const ECOM_DOMAINS: readonly Domain[] = [
  {
    title: "Marketplace Dynamics",
    slug: "marketplace-dynamics",
    description:
      "How online marketplaces evolve, compete, and create value for buyers and sellers",
  },
  {
    title: "Consumer Psychology",
    slug: "consumer-psychology",
    description:
      "Psychological drivers of online buying behavior, decision-making, and trust",
  },
  {
    title: "Pricing Strategy",
    slug: "pricing-strategy",
    description:
      "Dynamic pricing, competitive pricing, discounting frameworks, and margin optimization",
  },
  {
    title: "Supply Chain",
    slug: "supply-chain",
    description:
      "Sourcing, inventory management, demand forecasting, and supplier relationships",
  },
  {
    title: "Digital Marketing",
    slug: "digital-marketing",
    description:
      "Paid acquisition, SEO, content marketing, and performance marketing for eCommerce",
  },
  {
    title: "Conversion Optimization",
    slug: "conversion-optimization",
    description:
      "CRO tactics, A/B testing, UX patterns, and checkout optimization",
  },
  {
    title: "Customer Retention",
    slug: "customer-retention",
    description:
      "Loyalty programs, lifecycle marketing, churn prevention, and CLV maximization",
  },
  {
    title: "Payment Systems",
    slug: "payment-systems",
    description:
      "Payment processing, BNPL, fraud prevention, and checkout payment UX",
  },
  {
    title: "Logistics & Fulfillment",
    slug: "logistics-fulfillment",
    description:
      "Shipping, warehousing, last-mile delivery, and fulfillment operations",
  },
  {
    title: "Platform Technology",
    slug: "platform-technology",
    description:
      "eCommerce platform architecture, headless commerce, APIs, and infrastructure",
  },
  {
    title: "Data & Analytics",
    slug: "data-analytics",
    description:
      "eCommerce analytics, attribution modeling, customer segmentation, and BI",
  },
  {
    title: "Regulatory Compliance",
    slug: "regulatory-compliance",
    description:
      "Privacy regulations, tax compliance, consumer protection, and accessibility",
  },
  {
    title: "Brand Strategy",
    slug: "brand-strategy",
    description:
      "Brand building, positioning, storytelling, and brand equity in eCommerce",
  },
  {
    title: "Social Commerce",
    slug: "social-commerce",
    description:
      "Selling via social platforms, influencer commerce, live shopping, and community-driven sales",
  },
  {
    title: "Subscription Models",
    slug: "subscription-models",
    description:
      "Subscription box economics, recurring revenue models, and membership programs",
  },
  {
    title: "Cross-Border Commerce",
    slug: "cross-border-commerce",
    description:
      "International selling, localization, cross-border logistics, and multi-currency operations",
  },
];

// ---------------------------------------------------------------------------
// Default SynthesisPrompt
// ---------------------------------------------------------------------------

export const DEFAULT_SYNTHESIS_PROMPT: Omit<SynthesisPrompt, "effective_date"> =
  {
    version: 1,
    master_domain: "ecommerce",
    status: "active",
    target_schema_version: 1,
    prompt_text: [
      "You are a knowledge synthesis engine for the eCommerce domain.",
      "Given a research document and the existing knowledge graph context,",
      "extract atomic knowledge claims as KnowledgeNode candidates.",
      "",
      "For each claim:",
      "1. Write a clear, specific title (noun phrase)",
      "2. Write a one-paragraph summary of the claim",
      "3. Write a precise definition suitable for graph storage",
      "4. Classify the claim_type (definition, causal_claim, trend, comparison, recommendation, prediction, framework, metric, case_study)",
      "5. Identify relationships to existing nodes (CAUSAL, EPISTEMIC, CONTEXTUAL, STRUCTURAL)",
      "6. Assess confidence (0.0-1.0) based on evidence quality",
      "7. Tag the relevant Domain slug(s)",
      "",
      "Output valid JSON matching the KnowledgeNode schema.",
      "Prefer updating existing nodes over creating duplicates.",
      "Flag contradictions with EPISTEMIC/contradicts relationships.",
    ].join("\n"),
  };

// ---------------------------------------------------------------------------
// Vector Index Configuration
// ---------------------------------------------------------------------------

export const VECTOR_INDEX_CONFIG = {
  name: "knowledge_embedding",
  label: "KnowledgeNode",
  property: "embedding",
  dimensions: 768,
  similarityFunction: "cosine",
} as const;
