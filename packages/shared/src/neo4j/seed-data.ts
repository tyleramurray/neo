// =============================================================================
// @neo/shared — Static seed data for Neo4j knowledge graph
// =============================================================================
// Pure data definitions. No logic, no side effects.
// Used by seed.ts to populate the graph idempotently.
//
// eCom taxonomy: 33 domains from Google Deep Research + gap analysis
//   Retail Media (3), Data & Measurement (3), Content & Digital Shelf (3),
//   Marketplace & Operations (3), Pricing & Finance (3), Supply Chain (3),
//   Technology & Infrastructure (1), Shopper & Consumer (3),
//   Organization & Strategy (2), Emerging & Future (4),
//   Cross-Cutting (3), Retailer Deep Dives (3), Sustainability (1)
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
  {
    label: "ResearchPrompt",
    tier: "3",
    version: 1,
    required_properties: [
      "title",
      "prompt_text",
      "status",
      "priority",
      "source",
      "domain_slug",
      "master_domain",
    ],
    standard_properties: [
      "full_prompt",
      "research_output",
      "research_word_count",
      "created_date",
      "researched_date",
      "completed_date",
    ],
    extended_properties: ["error_message"],
    description:
      "Research prompt tracking node. Flows through the research pipeline from gap detection through synthesis.",
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
// eCom/Commerce MasterDomain
// ---------------------------------------------------------------------------

export const ECOM_MASTER_DOMAIN: MasterDomain = {
  title: "eCom/Commerce",
  slug: "ecommerce",
  description:
    "CPG-through-retail commerce: retail media, marketplace operations, digital shelf, " +
    "supply chain, shopper analytics, and emerging commerce models",
  status: "active",
  color: "#4F46E5",
};

// ---------------------------------------------------------------------------
// eCom Domains (33) — Google Deep Research taxonomy + gap analysis
// ---------------------------------------------------------------------------

export const ECOM_DOMAINS: readonly Domain[] = [
  // --- Retail Media (3) ---
  {
    title: "Sponsored Search & Onsite Advertising",
    slug: "sponsored-search-onsite",
    description:
      "Buying and optimizing keyword-targeted ads within retailer search results — " +
      "Sponsored Products, Sponsored Brands, Sponsored Display. The largest and most " +
      "mature retail media format, with distinct bidding strategies, match types, and " +
      "placement economics per retailer",
  },
  {
    title: "Programmatic & Off-Site Retail Media",
    slug: "programmatic-offsite",
    description:
      "Retailer DSP platforms and programmatic buying using first-party retailer data " +
      "to reach shoppers on and off the retailer's owned properties. Includes display, " +
      "video, CTV, and audience extension",
  },
  {
    title: "In-Store Digital Media",
    slug: "in-store-digital",
    description:
      "The expansion of retail media into physical stores — digital screens, smart carts, " +
      "electronic shelf labels, digital endcaps, and audio advertising. Distinct measurement, " +
      "targeting, and economics from digital retail media",
  },

  // --- Data & Measurement (3) ---
  {
    title: "Retail Media Measurement & Attribution",
    slug: "retail-media-measurement",
    description:
      "The unified discipline of measuring retail media effectiveness across all formats. " +
      "Incrementality, attribution, clean room measurement, and the organizational politics " +
      "of who gets credit for a sale",
  },
  {
    title: "Clean Rooms & Data Collaboration",
    slug: "clean-rooms-data",
    description:
      "Privacy-safe environments where brand and retailer data intersect. Spans media activation, " +
      "measurement, audience building, and analytics. A cross-cutting technology discipline " +
      "with distinct implementations per retailer",
  },
  {
    title: "Shopper Data & Audience Strategy",
    slug: "shopper-data-audience",
    description:
      "First-party retailer data, audience building, targeting strategies, and the evolving " +
      "data landscape. How brands access and activate retailer data for media, analytics, " +
      "and personalization",
  },

  // --- Content & Digital Shelf (3) ---
  {
    title: "Content & Product Detail Pages",
    slug: "content-pdps",
    description:
      "Product content creation, optimization, and management across the digital shelf. " +
      "Everything that lives on the PDP — images, copy, A+ content, video — and its " +
      "relationship to conversion",
  },
  {
    title: "Digital Shelf Analytics & SEO",
    slug: "digital-shelf-seo",
    description:
      "Monitoring and optimizing product visibility, content health, and search ranking " +
      "across retailers. The data infrastructure that tells brands how they're performing " +
      "on the digital shelf",
  },
  {
    title: "Ratings, Reviews & Social Proof",
    slug: "ratings-reviews",
    description:
      "The management and strategic use of consumer-generated content to drive conversion, " +
      "search rank, and product insights. Distinct from brand-created content",
  },

  // --- Marketplace & Operations (3) ---
  {
    title: "Marketplace Operations & Account Health",
    slug: "marketplace-operations",
    description:
      "Day-to-day management of selling on retailer platforms. Catalog integrity, account " +
      "health, and the operational disciplines that keep the business running",
  },
  {
    title: "Hybrid Marketplace Strategy (1P/3P)",
    slug: "hybrid-1p-3p",
    description:
      "The strategic and operational management of selling as both a first-party vendor " +
      "and a third-party marketplace seller. One of the most complex decisions in CPG ecommerce",
  },
  {
    title: "Pricing Strategy & Channel Conflict",
    slug: "pricing-channel-conflict",
    description:
      "Pricing architecture, MAP enforcement, and the cross-retailer dynamics that make " +
      "CPG pricing uniquely complex. Distinct from promotional pricing",
  },

  // --- Pricing & Finance (2) ---
  {
    title: "Trade Promotion & Shopper Marketing",
    slug: "trade-promotion",
    description:
      "The migration of trade spend and shopper marketing from traditional in-store to " +
      "digital channels. The financial mechanism that funds much of retail media",
  },
  {
    title: "Commercial Finance & Profitability",
    slug: "commercial-finance",
    description:
      "The economic and financial management of ecommerce — from gross-to-net accounting " +
      "to investment frameworks. The business case layer that justifies everything else",
  },

  // --- Supply Chain (2) ---
  {
    title: "Fulfillment & Logistics",
    slug: "fulfillment-logistics",
    description:
      "The supply chain from manufacturer to digital (and physical) shelf. Distinct from " +
      "supply chain planning because it's focused on execution and logistics partners",
  },
  {
    title: "Demand Planning & Inventory",
    slug: "demand-planning",
    description:
      "The planning and forecasting layer of supply chain. Predicting demand, managing " +
      "availability, and the financial impact of out-of-stocks",
  },

  // --- Technology & Infrastructure (1) ---
  {
    title: "Ecommerce Technology Stack",
    slug: "ecom-tech-stack",
    description:
      "The technology platforms and tools that enable commerce operations. PIM, DAM, " +
      "ad tech, APIs, and the build-vs-buy landscape",
  },

  // --- Shopper & Consumer (3) ---
  {
    title: "Shopper Behavior & Consumer Insights",
    slug: "shopper-behavior",
    description:
      "How shoppers discover, evaluate, and purchase CPG products through digital channels. " +
      "Behavioral science applied to commerce",
  },
  {
    title: "Subscription & Loyalty",
    slug: "subscription-loyalty",
    description:
      "Recurring revenue programs and loyalty mechanics specific to CPG on retailer platforms. " +
      "Subscribe & Save, loyalty program integration, and retention",
  },
  {
    title: "Private Label & Competitive Intelligence",
    slug: "private-label-ci",
    description:
      "Monitoring and responding to retailer-owned brands and competitor activity. The strategic " +
      "challenge of competing with your retail partner's own products",
  },

  // --- Organization & Strategy (2) ---
  {
    title: "Organizational Design for Ecommerce",
    slug: "org-design-ecom",
    description:
      "How CPG brands structure teams, talent, and operating models to execute ecommerce " +
      "at scale. The people and process layer",
  },
  {
    title: "Digital Transformation & Change Management",
    slug: "digital-transformation",
    description:
      "The organizational change required to shift from store-first to omnichannel-first. " +
      "Cultural, process, and leadership dimensions",
  },

  // --- Emerging & Future (4) ---
  {
    title: "Agentic Commerce & AI Shopping",
    slug: "agentic-commerce",
    description:
      "AI agents that shop, compare, and purchase on behalf of consumers. The emerging " +
      "model that may fundamentally change how brands reach shoppers",
  },
  {
    title: "Social Commerce",
    slug: "social-commerce",
    description:
      "The convergence of social media and retail. Selling within social platforms, " +
      "creator-driven discovery, and the attribution challenges of social-to-retail journeys",
  },
  {
    title: "Generative AI in Commerce",
    slug: "genai-commerce",
    description:
      "Applied AI and machine learning specifically within commerce operations. Content " +
      "generation, search, personalization, and the build-vs-buy landscape",
  },
  {
    title: "Voice & Emerging Commerce",
    slug: "voice-emerging",
    description:
      "Voice commerce, AR/VR, and other emerging interfaces for shopping. Early stage but " +
      "strategically important for CPG brands with high repeat-purchase frequency",
  },

  // --- Cross-Cutting (3) ---
  {
    title: "Cross-Retailer Orchestration",
    slug: "cross-retailer-orchestration",
    description:
      "The discipline of managing pricing, content, media, and promotions across multiple " +
      "retailers simultaneously without creating conflicts. One of the most complex strategic " +
      "challenges in CPG eCom",
  },
  {
    title: "Regulatory, Compliance & Platform Policy",
    slug: "regulatory-compliance",
    description:
      "The legal and policy landscape affecting CPG ecommerce. FTC requirements, platform " +
      "policy changes, data privacy, and the regulatory environment that constrains operations",
  },
  {
    title: "Category Strategy & Market Entry",
    slug: "category-strategy",
    description:
      "Strategic planning for category leadership, new platform entry, and long-term eCom " +
      "growth. The what-should-we-do layer above the how-to-execute layer",
  },

  // --- Retailer Deep Dives (3) ---
  {
    title: "Amazon Deep Dive",
    slug: "amazon-deep-dive",
    description:
      "Amazon-specific tools, algorithms, policies, and strategic dynamics that require " +
      "dedicated expertise beyond what's covered in functional domains",
  },
  {
    title: "Walmart Deep Dive",
    slug: "walmart-deep-dive",
    description:
      "Walmart-specific platforms, programs, and dynamics. Walmart Connect, WFS, OTIF, " +
      "Luminate, and the unique operational requirements of selling through Walmart",
  },
  {
    title: "Target, Kroger & Emerging Retailers",
    slug: "target-kroger-emerging",
    description:
      "Platform-specific expertise for Target, Kroger, Instacart, and other retailers " +
      "gaining digital significance",
  },

  // --- Sustainability (1) ---
  {
    title: "Sustainability in Ecommerce",
    slug: "sustainability-ecom",
    description:
      "Environmental and social sustainability as it intersects with ecommerce operations. " +
      "Packaging, shipping, transparency, and the emerging consumer expectation for " +
      "sustainable commerce",
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
      "You are a knowledge synthesis engine for the eCom/Commerce domain.",
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
