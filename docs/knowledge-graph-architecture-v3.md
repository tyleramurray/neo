# Multi-Domain Knowledge Graph: Architecture & Implementation Plan

**Project:** Consultant-Grade Intelligence System
**Author:** Tyler Murray, CRO & Head of Enterprise Solutions, VML
**Date:** February 16, 2026
**Status:** Architecture finalized, ready for build
**Version:** 3.0 — multi-domain architecture with evolution-resilient design

---

## Executive Summary

This document outlines the architecture, research foundation, and implementation roadmap for building a proprietary multi-domain knowledge graph that gives Tyler Murray — and eventually his team — consultant-grade command across the full breadth of VML's strategic landscape. The system starts with CPG-through-retail commerce as the first domain, then expands to hyperscaler co-selling, social media, and 10+ additional domains over time.

The system combines a curated Neo4j knowledge graph, an automated research pipeline powered by deep research APIs, and a continuous gap-detection engine fed by the Awake.am news intelligence platform.

The thesis is simple: **20 deeply researched, well-connected knowledge nodes outperform 2,000 scraped articles.** And when those nodes span multiple domains — commerce, cloud partnerships, social strategy, organizational transformation — the cross-domain connections become the unique competitive advantage. Nobody else at VML, or any competitor, has a single system that connects commerce knowledge to hyperscaler partnership strategy to social media dynamics in one queryable graph.

Two core design principles shape every architectural decision:

**Build for evolution without rework.** The landscape will surface node types, relationship patterns, and classification dimensions that can't be anticipated today. The architecture absorbs surprise through data changes, not engineering projects.

**Build infrastructure once, expand domains repeatedly.** The first domain (eCom) takes 4–6 weeks because infrastructure and knowledge are built simultaneously. Each subsequent domain takes 1–2 weeks because the pipeline already exists.

The total incremental cost to operate this system is approximately $500–700/month for one domain, scaling sub-linearly to $1,200–1,800/month at 10+ domains. The initial eCom knowledge base is buildable in 4–6 weeks via an automated research-to-graph pipeline.

---

## The Problem We're Solving

As CRO of a $1.8B business unit navigating the transition from traditional advertising to technology-driven solutions, Tyler faces a knowledge challenge that spans multiple industries and disciplines. The CPG-through-retail commerce landscape alone is vast, fast-moving, and fragmented. Add hyperscaler co-selling motions, social media strategy, organizational transformation, and other strategic domains — and no single person, team, or analyst report covers the full picture.

The current state of intelligence fails in three ways. First, institutional knowledge lives in people's heads and walks out the door when they leave. Second, static documents go stale within weeks in landscapes where platforms ship changes constantly. Third, generic AI retrieval (standard RAG over documents) produces shallow, undifferentiated answers that wouldn't survive a CMO's follow-up question — and it can't connect insights across domains.

What Tyler needs is a system that can answer the kind of question a skeptical CMO would ask — with evidence, nuance, competing perspectives, and temporal context — and do so across the full breadth of VML's strategic landscape. More importantly, it needs to surface the connections between domains that no one else sees: how hyperscaler cloud partnerships intersect with commerce clients' infrastructure needs, how social commerce trends affect retail media strategy, how organizational models for one domain apply to another.

---

## Research Foundation

### Six Deep Research Reports

Before making any architecture decisions, we executed six deep research reports across Gemini Deep Research, Perplexity Deep Research, and Claude Research to map the landscape of available technologies and design patterns. While these reports focused on the eCom domain as the first use case, the architectural conclusions apply to all domains.

**Report 1 — Neo4j AuraDB Professional: Features, Pricing & Fit.** Evaluated AuraDB's managed tiers against the requirements of a multi-domain knowledge system. Concluded that the Professional tier at 4GB ($263/month) provides the necessary vector-optimized mode, GDS algorithms (community detection, centrality scoring), and sufficient headroom for the initial domain, with a clear upgrade path to 8GB as domains scale.

**Report 2 — Neo4j Aura Agent Assessment.** Evaluated Aura Agent (two weeks into GA at time of research) as a potential shortcut. Found it locked to Gemini, offering only 3 retrieval tools versus 7 in the open-source `neo4j-graphrag` Python package. Recommended skipping Aura Agent as primary architecture but noting it as a future MCP tool that Claude could consume.

**Report 3 — Cypher Patterns for GraphRAG Retrieval.** Surveyed production Cypher patterns for combining vector search with graph traversal. Identified the `VectorCypherRetriever` pattern as the optimal approach — vector search finds semantically relevant nodes, then Cypher traverses to evidence, context, and cross-domain relationships within 2 hops.

**Report 4 — Microsoft GraphRAG vs. Alternatives.** Compared document-ingestion frameworks (Microsoft GraphRAG, LightRAG, HippoRAG2, nano-graphrag) against custom-built approaches on Neo4j. Every framework is designed for automatic entity extraction from unstructured documents — the wrong tool for a curated knowledge base. The research was unambiguous: Neo4j native GraphRAG with the `neo4j-graphrag` Python package provides full schema control, first-class Anthropic LLM support, zero extraction cost, and the retrieval precision required.

**Report 5 — Knowledge Graph Schema Design for LLM Reasoning.** The highest-leverage research of the six. Synthesized academic literature (including the TGDK minerals study) and production patterns to design a schema optimized for Claude's extended thinking. Key finding: expert-curated schemas dramatically outperform auto-generated ones, and reifying claims as first-class nodes (not just edge labels) gives the LLM epistemic metadata inline with the content.

**Report 6 — Retrieval Strategies for Extended Thinking Models.** Established the optimal context format for Claude Opus with extended thinking enabled. Key findings: hybrid triples + natural language descriptions beat any single format (29.1% exact-match improvement); 8K tokens is universally optimal for comprehensiveness; BFS ordering with most relevant triples last exploits recency bias; shortest paths between vector search results contain more valuable context than direct neighbors; and contradictions must be pre-annotated because Claude detects them at near-random rates on its own.

### Deep Research API Cost Analysis

To determine how to scale research execution, we conducted detailed pricing analysis of every available deep research API.

**Perplexity Sonar Deep Research API** emerged as the primary workhorse: $0.41/query average, 3-minute execution, 93.9% SimpleQA accuracy, no daily limits, and fully programmable. The combination of cost efficiency, speed, and accuracy makes it the clear choice for volume research.

**OpenAI o4-mini-deep-research** fills a complementary role at $0.92–1.10/query based on real-world testing (Simon Willison's orchestrion test). Best for queries requiring actionable, implementable insights rather than broad factual coverage.

**OpenAI o3-deep-research** at ~$10/query proved too expensive for volume work. Reserved for rare, high-stakes queries where maximum depth justifies 10x cost.

**Gemini Deep Research API** (via Interactions) runs $2–5/query standard and $5–12 for complex queries, with preview-status limitations. Competitive for accuracy but not cost-effective at scale.

**Claude** has no deep research API endpoint. Its role in the pipeline is synthesis, not bulk research — taking raw outputs from Perplexity and OpenAI and transforming them into graph-ready knowledge nodes.

---

## Design Philosophy: Build for Evolution Without Rework

Before describing the architecture, the design philosophy that shapes every decision deserves its own section because it touches everything that follows.

Two sources of change are inevitable. First, within any domain, the landscape will surface node types, relationship patterns, and classification dimensions that can't be anticipated today. Second, entirely new domains will be added over time — each with their own terminology, evidence types, and relationship patterns. The architecture must handle both through data changes, not engineering projects.

**The core principle: Neo4j itself is schema-flexible. The brittleness is in every layer that touches the database.** Cypher queries, synthesis prompts, serialization templates, retrieval pipelines, gap detection logic — all of these can encode assumptions about what node types exist, what properties they have, and what relationships connect them. When you discover a new node type or add a new domain, it's not adding it to Neo4j that hurts. It's updating the 15 other places that assumed they knew the full taxonomy.

**The design response: make every layer that touches the graph discover the schema rather than assume it.** Evolution happens by adding data to the graph, not by changing code. The graph is self-describing — it contains its own schema, its own serialization rules, and its own synthesis lineage.

Eight specific patterns implement this philosophy throughout the architecture.

---

## Architecture Decisions

### Graph Database: Neo4j AuraDB Professional (4GB → 8GB)

Neo4j was selected over alternatives (Dgraph, Amazon Neptune, TigerGraph) for three reasons: the mature `neo4j-graphrag` Python package with native Anthropic LLM support, the combination of property graph + vector search in a single engine, and GDS algorithms (Louvain community detection, PageRank centrality) that enable the gap detection and node ranking systems described later in this document.

AuraDB Professional (not a local instance) from day one. Migrating a graph database with vector indexes, GDS algorithms, and established relationships is genuinely painful — exactly the kind of rework this architecture is designed to prevent. The $263/month is insurance against future migration.

Starting at 4GB for the first 1–3 domains. At 800–1,000 nodes per domain with 3–5x supporting entities (Evidence, Context, Concept), the system reaches approximately 30,000–50,000 total entities at 5+ domains. The primary constraint is vector index memory. Upgrade to 8GB (~$500/month) anticipated when the 4th or 5th domain goes live.

### Pattern 1: Schema Registry in the Graph

The schema does not live in documentation or hardcoded in Python. It lives in the graph itself as first-class nodes that every other layer reads dynamically.

```
(:NodeType {
    label: "KnowledgeNode",
    tier: "structural",
    version: 1,
    required_properties: ["title", "summary", "definition", "embedding"],
    standard_properties: ["confidence", "freshness_date", "claim_type",
                          "deep_content"],
    extended_properties: [],
    serialization_template: "## {title}\n{definition}\n...",
    description: "Core knowledge unit representing a discrete claim or insight"
})

(:RelationshipCategory {
    category: "epistemic",
    version: 1,
    valid_stances: ["supports", "contradicts", "supersedes", "refines"],
    valid_source_labels: ["KnowledgeNode"],
    valid_target_labels: ["KnowledgeNode"],
    required_properties: ["stance", "confidence"],
    standard_properties: ["source", "mechanism", "temporal_validity"],
    reasoning_hint: "Indicates knowledge agreement or conflict —
                     always present both sides of contradictions"
})
```

When you discover you need a new node type — say `:Regulation` for tracking policy changes, or `:PartnerProgram` for hyperscaler co-selling — you add it to the registry. The retrieval pipeline reads the registry, not a hardcoded list. The synthesis prompt pulls valid relationship categories from the registry. Nothing breaks.

### Pattern 2: Multi-Level Domain Hierarchy with Multi-Label Classification

The knowledge graph organizes domains into two levels:

```
(:MasterDomain {title, slug, description, status, color})
  -[:CONTAINS]->(:Domain {title, slug, description})

Example hierarchy:

(:MasterDomain {title: "eCom/Commerce", slug: "ecom"})
  -[:CONTAINS]->(:Domain {title: "Retail Media Networks"})
  -[:CONTAINS]->(:Domain {title: "Content & Digital Shelf"})
  -[:CONTAINS]->(:Domain {title: "Marketplace Operations"})
  -[:CONTAINS]->(:Domain {title: "Agentic Commerce"})
  ... (16 domains)

(:MasterDomain {title: "Hyperscaler Co-Selling", slug: "hyperscaler"})
  -[:CONTAINS]->(:Domain {title: "AWS Partnership Programs"})
  -[:CONTAINS]->(:Domain {title: "Azure Co-Sell Motion"})
  -[:CONTAINS]->(:Domain {title: "GCP Marketplace"})
  -[:CONTAINS]->(:Domain {title: "Multi-Cloud Strategy"})
  ...

(:MasterDomain {title: "Social Media", slug: "social"})
  -[:CONTAINS]->(:Domain {title: "Platform Strategy"})
  -[:CONTAINS]->(:Domain {title: "Content & Creative"})
  -[:CONTAINS]->(:Domain {title: "Influencer & Creator Economy"})
  -[:CONTAINS]->(:Domain {title: "Social Commerce Integration"})
  ...
```

MasterDomains are the top-level strategic territories. Domains are the operational sub-areas within each. Adding a new MasterDomain is creating one node and its child Domain nodes — no schema change, no code change.

**Multi-label classification** sits on top of this hierarchy. Neo4j supports multiple labels on a single node, and the architecture uses two kinds:

**Structural labels** define what the node IS — its tier in the knowledge architecture. These are the 6-tier taxonomy (MasterDomain, Domain, KnowledgeNode, Evidence, Context, Concept) and they are stable.

**Classification labels** describe what the node is ABOUT — its domain, topic, recency, or any future dimension. These proliferate freely:

```
(:KnowledgeNode:RetailMedia:Amazon:Emerging)
(:KnowledgeNode:AWSPartnership:CoSell:Enterprise)
(:Evidence:IndustryReport:2026:Gartner)
```

Adding a new classification dimension — say `:ClientRelevant:SCJ` to tag nodes relevant to a specific client — requires zero code changes. Queries that don't reference it are unaffected.

### 6-Tier Structural Schema

```
Tier 0 — (:MasterDomain)
Top-level strategic territories. eCom, Hyperscaler Co-Selling,
Social Media, etc.
Properties: title, slug, description, status, color

Tier 1 — (:Domain)
Operational sub-areas within a MasterDomain.
Properties: title, slug, description

Tier 2 — (:KnowledgeNode)
Core knowledge units. Each represents a discrete claim, concept,
or insight at consultant depth (500–2,000 words).
The `definition` property (1–3 sentences) is critical — it anchors
Claude's understanding in serialized subgraphs.

Tier 3 — (:Evidence)
Backing for claims. Every KnowledgeNode is backed by Evidence.
Nodes without Evidence are flagged as unsupported.
Properties: source_type, citation, methodology_summary, strength, year

Tier 4 — (:Context)
Qualifying conditions that scope when and where knowledge applies.
Prevents overgeneralization.
Properties: conditions, population, temporal_range, geographic_scope

Tier 5 — (:Concept)
Taxonomic backbone. Enables "what is X?" queries and structural
navigation.
Properties: definition, parent_concepts, distinguishing_criteria
```

### Pattern 3: Property Conventions Over Property Requirements

Instead of requiring every KnowledgeNode to have exactly N properties, properties are organized into three tiers:

**Core** (must exist, retrieval breaks without them): `title`, `summary`, `definition`, `embedding`

**Standard** (should exist, retrieval is degraded without them): `confidence`, `freshness_date`, `claim_type`, `deep_content`, `source_type`, `status`

**Extended** (optional, enriches reasoning when present): anything discovered as needed — `regulatory_flag`, `platform_specific`, `controversy_level`, `client_relevance`, etc.

The synthesis prompt targets Core + Standard properties. Extended properties get added as the system matures. All retrieval queries use `COALESCE` and optional matching so a missing property returns a sensible default rather than breaking:

```cypher
RETURN k.title,
       COALESCE(k.confidence, 'unassessed') AS confidence,
       COALESCE(k.freshness_date, k.created_date) AS freshness,
       COALESCE(k.regulatory_flag, false) AS regulatory
```

Adding `regulatory_flag` to 50 nodes next month means every node that doesn't have it returns `false`. No migration. The schema registry documents which properties are Core, Standard, and Extended for each NodeType.

### Pattern 4: Relationship Categories with Rich Properties

The architecture uses **four relationship categories with rich properties** rather than dozens of specific relationship types:

```
:CAUSAL — one thing affects another
  Properties: {
    direction: "positive" | "negative" | "bidirectional",
    strength: "primary" | "contributing" | "weak",
    mechanism: "free text explaining the causal pathway",
    confidence: float,
    source: "citation"
  }

:EPISTEMIC — knowledge agreement or conflict
  Properties: {
    stance: "supports" | "contradicts" | "supersedes" | "refines",
    confidence: float,
    source: "citation",
    mechanism: "what specifically supports/contradicts"
  }

:CONTEXTUAL — scoping and qualification
  Properties: {
    scope: "qualifies" | "applies_to" | "except_when" | "depends_on",
    conditions: "free text describing the qualifying context"
  }

:STRUCTURAL — taxonomy and hierarchy
  Properties: {
    hierarchy: "is_a" | "part_of" | "instance_of" | "evolved_from" |
               "example_of" | "contains",
  }
```

New relationship nuances are property values within existing categories. New categories are added to the schema registry and the retrieval pipeline picks them up dynamically. All non-trivial relationships carry `{confidence, source, temporal_validity}` at minimum.

**Cross-MasterDomain relationships** use the same categories but span domain boundaries. A `:CAUSAL` relationship between a KnowledgeNode in eCom and one in Hyperscaler Co-Selling is syntactically identical to one within a single domain — but semantically it's where Tyler's unique value lives.

### Pattern 5: Serialization Templates as Data

How each node type gets turned into text for Claude's context window is a template stored in the schema registry, not hardcoded in Python:

```
(:NodeType {label: "KnowledgeNode",
    serialization_template: """
## {title}
{definition}
- Confidence: {confidence}
- Claim type: {claim_type}
{FOR evidence IN evidences}
  - Evidence: {evidence.citation} ({evidence.year},
    strength: {evidence.strength})
{ENDFOR}
{FOR rel IN epistemic_rels WHERE rel.stance = 'contradicts'}
  - ⚠ Contradicted by: {rel.target.title} — {rel.mechanism}
{ENDFOR}
{FOR rel IN causal_rels}
  - {rel.direction} causal link to {rel.target.title}:
    {rel.mechanism}
{ENDFOR}
"""
})
```

Adding a new property, relationship category, or node type means updating the template in the graph. The Python serialization code reads templates dynamically.

The retrieval pipeline format validated by Report 6 still applies — hybrid structured natural language, 4K–16K tokens, BFS ordering with most relevant content last — but specific rendering is driven by templates, not code.

### Pattern 6: Domain-Scoped Synthesis Prompt Versioning & Lineage

The synthesis prompt — which turns deep research output into graph-ready nodes — evolves independently per MasterDomain. Commerce research has different terminology, evidence types, and relationship patterns than hyperscaler co-selling or social media.

```
(:SynthesisPrompt {
    version: 1,
    master_domain: "ecom",
    effective_date: "2026-02-20",
    prompt_text: "Given the following commerce research output...",
    target_schema_version: 1,
    status: "active",
    notes: "Optimized for retail/CPG terminology and evidence types"
})

(:SynthesisPrompt {
    version: 1,
    master_domain: "hyperscaler",
    effective_date: "2026-04-15",
    prompt_text: "Given the following cloud partnership research...",
    target_schema_version: 1,
    status: "active",
    notes: "Optimized for partner program structures and co-sell motions"
})

(:SynthesisPrompt {
    version: 1,
    master_domain: "_default",
    effective_date: "2026-02-20",
    prompt_text: "Given the following research output...",
    target_schema_version: 1,
    status: "active",
    notes: "Generic fallback for new domains before domain-specific tuning"
})
```

New domains start with the `_default` prompt and fork to a domain-specific version once tuning is needed. The pipeline reads the active prompt for each domain automatically.

Every KnowledgeNode records full lineage:

```
(:KnowledgeNode)-[:CREATED_BY]->(:SynthesisPrompt {version: 1})
(:KnowledgeNode)-[:SOURCED_FROM]->(:ResearchOutput {
    query: "...", api: "perplexity", date: "..."
})
```

When you improve a prompt, you can identify and optionally reprocess all nodes created by prior versions.

### Pattern 7: The `:Unclassified` Escape Hatch

When the automated synthesis pipeline encounters something that doesn't fit the current taxonomy — a concept that's not clearly a KnowledgeNode or Evidence node, a relationship that doesn't map to any category — it doesn't force-fit or discard it:

```
(:Unclassified {
    raw_content: "full text that didn't fit",
    source_query: "the research query that produced this",
    master_domain: "the domain this research targeted",
    attempted_classification: "what the synthesis prompt tried",
    reason_unclassified: "no matching node type" |
                         "ambiguous tier" | "unknown relationship",
    created_date: datetime,
    reviewed: false
})
```

`:Unclassified` nodes reveal patterns over time. Fifteen unclassified nodes about regulatory/policy items → add `:Regulation` as a NodeType. Ten unclassified items that are really partner program structures → add `:PartnerProgram`. The system teaches you what it needs rather than requiring you to guess upfront.

This is especially valuable during domain expansion. When a new MasterDomain's synthesis prompt is still using the `_default` template, the `:Unclassified` output reveals what domain-specific concepts and relationships need to be accommodated.

### Pattern 8: Dynamic Retrieval Pipeline

The VectorCypherRetriever reads from the schema registry, not hardcoded assumptions:

```cypher
// Dynamically get all valid relationship categories
MATCH (rc:RelationshipCategory)
WITH collect(rc.category) AS valid_categories

// Get serialization template
MATCH (nt:NodeType {label: "KnowledgeNode"})
WITH valid_categories, nt.serialization_template AS template

// Vector search finds relevant nodes (across ALL domains)
CALL db.index.vector.queryNodes('knowledge_embedding', 10, $queryVector)
YIELD node AS k, score

// Traverse all registered relationship categories
MATCH (k)-[r]-(related)
WHERE type(r) IN valid_categories
RETURN k, r, related, template, score
ORDER BY score DESC
```

Adding a new relationship category, node type, or domain automatically includes it in retrieval. The pipeline doesn't know or care how many MasterDomains exist — it searches the full graph and follows all registered relationships.

This is what makes cross-domain queries work without special handling. When Tyler asks about the intersection of commerce and cloud partnerships, vector search surfaces relevant nodes from both MasterDomains, and relationship traversal crosses domain boundaries naturally.

---

## The Automated Pipeline

### How Nodes Get Created

Tyler does not manually manage nodes. The pipeline is fully automated:

1. **Research Generation:** Topic decomposition breaks domains into specific research questions
2. **Research Execution:** Perplexity Sonar Deep Research API executes queries programmatically ($0.41/query, 3 minutes each, parallelized)
3. **Synthesis:** Claude API (Sonnet 4.5) takes each research output and produces structured graph entities — following the active domain-scoped SynthesisPrompt and reading property conventions from the schema registry
4. **Ingestion:** Python pipeline writes entities to Neo4j AuraDB with embeddings, lineage links, and freshness timestamps
5. **Quality Gate:** Automated checks verify Core properties exist, Evidence nodes are attached, confidence levels are populated. Failures route to `:Unclassified`

Tyler's role is strategic direction (which domains to build, what questions matter), synthesis prompt tuning per domain, and weekly review of `:Unclassified` nodes to guide schema evolution.

### Synthesis Prompt Validation: The Critical Gate

Before scaling research execution for any domain, that domain's synthesis prompt must be validated. This is the make-or-break automation piece.

The validation process:

1. Run 20 research queries across 3–4 sub-domains via Perplexity API
2. Feed all 20 outputs through the domain's synthesis prompt
3. Tyler reviews the resulting graph entities: Are confidence levels accurate? Are relationships correctly typed? Is Evidence actually supporting its linked claims?
4. Tune the prompt, reprocess, review until quality bar is met
5. These 20 nodes become the first production nodes for that domain

For the first domain (eCom), this happens on the brand-new AuraDB instance and validates the entire pipeline. For subsequent domains, it validates only the domain-specific synthesis prompt — the infrastructure is already proven.

---

## Domain Coverage

### Multi-Domain Vision

The system is designed for 10+ MasterDomains over time. The first domain (eCom/Commerce) is the deepest and most immediate. Subsequent domains are added as strategic priorities dictate.

**Planned MasterDomains** (illustrative, not exhaustive):

| MasterDomain                  | Slug            | Status      | Estimated Domains |
| ----------------------------- | --------------- | ----------- | ----------------- |
| eCom/Commerce                 | `ecom`          | First build | 16                |
| Hyperscaler Co-Selling        | `hyperscaler`   | Planned     | 6–8               |
| Social Media                  | `social`        | Planned     | 8–10              |
| Organizational Transformation | `org-transform` | Planned     | 5–7               |
| AI/Technology Strategy        | `ai-strategy`   | Planned     | 8–10              |
| Client Intelligence           | `client-intel`  | Planned     | 4–6               |
| Creative & Content            | `creative`      | Future      | 6–8               |
| Data & Analytics              | `data`          | Future      | 5–7               |
| Media & Advertising           | `media`         | Future      | 8–10              |
| Business Development          | `bizdev`        | Future      | 4–6               |

Each MasterDomain follows the same expansion playbook (see Implementation Roadmap).

### eCom/Commerce: First MasterDomain (16 Domains)

**Core Operational (7):**
Retail Media Networks · Content & Digital Shelf · Marketplace Operations · Supply Chain to Shelf · Shopper Data & Analytics · Trade & Promotion · Search & Discovery

**Strategic/Emerging (5):**
Agentic Commerce · Social Commerce → Retail · Unified Commerce/Omnichannel · Retail Media 2.0 · AI/ML in Commerce Operations

**Cross-Cutting (4):**
Retailer Platform Deep Dives (Amazon, Walmart, Target, Kroger, Instacart, etc.) · Organization & Operating Models · Measurement & ROI · Competitive Intelligence Frameworks

**Node volume target:** 800–1,000 KnowledgeNodes for consultant-grade coverage.

### What "Consultant-Grade" Means

It means the system can survive a skeptical CMO's follow-up questions. Not just "what is retail media?" but "why is our retail media ROAS declining despite increased spend, and what are the three most likely explanations given our category and retailer mix?" That requires depth (Evidence nodes), nuance (`:EPISTEMIC {stance: "contradicts"}` relationships), and temporal context (freshness scoring).

At multi-domain maturity, it also means answering questions no one else can: "How does our AWS co-selling motion connect to our commerce clients' cloud infrastructure needs?" or "Which organizational transformation patterns from our social media practice apply to the commerce team restructuring?"

---

## Research Pipeline: Building Each Domain

### Three-Tier Execution Architecture

**Tier 1 — Topic Decomposition** uses Perplexity Sonar or Gemini Flash at $0.01–0.05/query. Breaks broad domains into specific, researchable questions. Cost: $5–15/day.

**Tier 2 — Deep Research** is the core engine. Perplexity Sonar Deep Research handles the bulk ($0.41/query). OpenAI o4-mini supplements ($1.00/query) for queries requiring more actionable output.

**Tier 3 — Synthesis** uses Claude API (Sonnet 4.5 at $3/$15 per million tokens), transforming raw research into graph-ready entities per the active domain-scoped SynthesisPrompt. Cost: $10–25/day.

### Per-Domain Build Economics

Each MasterDomain follows the same cost model:

| Phase                    | Queries     | Cost         | Output                           |
| ------------------------ | ----------- | ------------ | -------------------------------- |
| Bootstrap (Passes 1–3)   | 70–80       | $30–50       | Coverage map + depth calibration |
| Deep research            | 500–650     | $200–400     | 600–800 raw research outputs     |
| Synthesis                | 100–130     | $50–100      | 800–1,000 KnowledgeNodes         |
| Cross-linking & gap fill | 80–100      | $30–50       | Relationships + gap-fill nodes   |
| **Total per domain**     | **750–960** | **$310–600** | **800–1,000 nodes**              |

The first domain costs more in calendar time (4–6 weeks) because infrastructure is built in parallel. Subsequent domains: 1–2 weeks each.

### Phased Execution (Per Domain)

**Phase 1 — Scaffold (Days 1–3):** Landscape discovery across the domain's sub-areas. Create Domain nodes, CoverageTopic taxonomy.

**Phase 2 — Core Depth (Weeks 1–2):** Deep research on the highest-priority sub-domains (the ones Tyler fields questions about daily).

**Phase 3 — Sub-Domain Deep Dives (Weeks 2–3):** Targeted depth on specific entities (e.g., individual retailers in eCom, individual cloud providers in Hyperscaler).

**Phase 4 — Strategic Layer (Week 3–4):** Forward-looking and emerging sub-domains.

**Phase 5 — Cross-Linking (Week 4–5):** Within-domain and cross-MasterDomain relationship building.

**Phase 6 — Ongoing Freshness (Indefinite):** 5–10 queries/day per domain via gap detection.

---

## Solving for Knowledge Gaps: The Bootstrap Problem

### The Fundamental Challenge

You can't measure coverage completeness the way you measure code coverage. Knowledge is fractal — every topic decomposes infinitely. You can't build a table of contents for knowledge you don't have yet. The solution is to bootstrap the coverage map through research itself. This process repeats for every new MasterDomain.

### Three-Pass Bootstrap Approach

**Pass 1 — Landscape Discovery ("What exists?")**

Run meta-research prompts (one per sub-domain) across Perplexity, Gemini, and Claude simultaneously. Each prompt asks: What are the 15–25 critical sub-topics a consultant must understand? What 2–3 executive questions should each sub-topic answer? What are the 5–8 active tensions or debates? What adjacent domains have strong connections? What changed in the last 12 months?

Triangulation across three models: all three agree = critical, two agree = likely important, one mentions = niche or potentially hallucinated. Cost: ~$20–30 per MasterDomain.

**Pass 2 — Depth Calibration ("How deep?")**

Classify each sub-topic: Awareness (500 words, 1–2 Evidence), Working (1,500 words, 3–5 Evidence, Context nodes), or Deep (2,000+ words, 5–8 Evidence, `:EPISTEMIC {stance: "contradicts"}` relationships). Roughly 30/60/20 distribution. Classification exercise, no additional research.

**Pass 3 — External Validation ("What am I missing?")**

Ground-truth sources vary by domain. For eCom: analyst taxonomies, conference agendas, job descriptions. For Hyperscaler: partner program documentation, cloud marketplace guides, ISV community forums. For Social: platform developer docs, creator economy reports, brand safety frameworks. Plus Tyler's lived experience in each domain.

Cost: $10–15 per MasterDomain.

---

## Continuous Gap Detection: The Self-Improving System

### Gap Tracking Schema

**CoverageTopic nodes** — the "table of contents" per domain:

```
(:Domain)-[:SHOULD_COVER]->(:CoverageTopic {
    title,
    status: "covered" | "partial" | "gap" | "stale",
    target_depth: "deep" | "working" | "awareness",
    last_assessed: date,
    priority: "critical" | "important" | "nice-to-have"
})
```

**ResearchPrompt nodes** — priority queue for research execution:

```
(:ResearchPrompt {
    title, prompt_text,
    master_domain: "ecom",
    source: "gap_detection" | "freshness_decay" | "manual" | "coverage_map",
    priority: float,
    status: "queued" | "executing" | "completed" | "rejected"
})
```

**Freshness properties** on every KnowledgeNode: `freshness_date`, `freshness_half_life` (14–180 days based on topic velocity), `freshness_score` (computed weekly). Note: freshness half-life is a heuristic — facts don't decay uniformly. Over-refreshing is acceptable at $0.41/query.

### Five Gap Detection Layers

**Layer 1 — Structural Coverage Mapping.** CoverageTopics define expected knowledge. A single Cypher query reveals all gaps across all domains.

**Layer 2 — Freshness Decay.** Weekly agent computes freshness scores. Below threshold → auto-generate ResearchPrompt. Half-lives vary by domain and sub-topic velocity.

**Layer 3 — Unknown Unknowns Detection (Awake Integration).** Uses the Awake.am daily article feed as a signal for uncovered topics. Three-stage pipeline: Fast Triage (Gemini Flash), Graph Match (vector similarity), Gap Classification (Claude Sonnet). Each MasterDomain maps to relevant Awake verticals. The implementation plan includes a manual baseline test before building the automated pipeline.

**Layer 4 — Ongoing Signals.** Orphan articles, relationship density anomalies, question failure tracking, and depth probing.

**Layer 5 — `:Unclassified` Node Patterns.** The escape hatch from the synthesis pipeline serves as a gap signal for missing NodeTypes, relationship categories, or domains that need subdivision. Weekly review is the primary mechanism for schema evolution. Especially valuable during new domain expansion when the synthesis prompt is still being tuned.

### Steady-State Research Volume

Per domain: 5–10 queries/day for freshness and gap-fill.
At 5 active domains: 25–50 queries/day, $10–20/day.
At 10 active domains: 50–100 queries/day, $20–40/day.

---

## Coverage Health Metrics

Six quantitative dimensions replace gut feel about whether the knowledge base is "good enough."

**Coverage Score:** Percentage of CoverageTopics with status "covered." Target: 85%+ per MasterDomain.

**Depth Score:** Average Evidence nodes per KnowledgeNode. Below 2 = unsupported claims. 4+ = well-evidenced.

**Within-Domain Connectivity:** Average relationships per KnowledgeNode within the same MasterDomain. Below 1 = isolated facts. 3+ = connected understanding.

**Cross-Domain Connectivity:** Average relationships per KnowledgeNode that span MasterDomain boundaries. Below 0.5 = siloed domains that might as well be separate databases. Above 1.0 = Tyler's unique value — nobody else connects these dots.

**Freshness Score:** Percentage of nodes above their freshness threshold. Below 70% = stale. 90%+ = current.

**Contestation Coverage:** Percentage of KnowledgeNodes with `:EPISTEMIC {stance: "contradicts"}` relationships. Below 15% = dangerously one-sided.

Cross-Domain Connectivity is the metric that matters most at multi-domain maturity. It's the quantitative measure of the system's unique value proposition: connections between domains that no competitor can see.

---

## Schema Evolution Strategy

The architecture is designed so that evolution requires data changes, not code changes.

### Adding a New MasterDomain

1. Create `(:MasterDomain)` node with title, slug, description
2. Create child `(:Domain)` nodes for sub-areas
3. Fork or create a domain-scoped SynthesisPrompt (start with `_default`)
4. Run bootstrap Passes 1–3 for the new domain
5. Validate synthesis prompt on 20 research outputs
6. Open the research pipeline for that domain
7. Configure relevant Awake verticals for gap detection

**Code changes required: zero.** The pipeline reads MasterDomains from the graph.

### Adding a New Node Type

1. Review `:Unclassified` nodes to confirm the pattern
2. Create `(:NodeType)` in registry with properties and serialization template
3. Reclassify existing `:Unclassified` nodes
4. Update relevant SynthesisPrompt(s) to produce the new type
5. Retrieval pipeline picks it up automatically

**Code changes required: zero.**

### Adding a New Property

1. Determine tier: Core (backfill all), Standard (new nodes going forward), Extended (optional)
2. Update `(:NodeType)` in registry
3. Update serialization template with `COALESCE` default
4. Existing queries continue working

**Code changes required: zero.**

### Adding a New Relationship Category

1. Confirm it doesn't fit as a property value in existing categories
2. Create `(:RelationshipCategory)` in registry
3. Update relevant SynthesisPrompt(s)
4. Retrieval pipeline includes it automatically

**Code changes required: zero.**

### Adding a New Classification Label

1. Define the label (e.g., `:RegulatoryExposure`, `:ClientRelevant:SCJ`)
2. Apply to nodes via Cypher
3. Optionally update SynthesisPrompt

**Code changes required: zero.**

### Versioning Convention

Schema registry nodes carry a `version` integer. Changes are additive only — never remove Core properties. SynthesisPrompts target specific schema versions. Nodes created under prior versions remain valid.

---

## Infrastructure & Orchestration

### Mac Mini M4 as Pipeline Host

A Mac Mini M4 runs the automated pipeline 24/7, executing Python scripts that make API calls to Perplexity, OpenAI, and Claude, then ingest results into Neo4j AuraDB. The same infrastructure serves all domains.

### OpenClaw as Orchestrator (Not Researcher)

OpenClaw manages cron jobs, monitors API health, provides a conversational interface (via WhatsApp/Telegram) for Tyler to review overnight results and direct research strategy, and handles ad-hoc tasks. Not used for browser automation research at scale.

### Cost Model: Sub-Linear Domain Scaling

Infrastructure costs are shared across all domains. Incremental costs per domain are primarily research API spend.

| Domains Active | AuraDB | Research API (steady-state) | Other    | Total Monthly |
| -------------- | ------ | --------------------------- | -------- | ------------- |
| 1 (eCom)       | $263   | $120–240                    | $80–140  | $500–700      |
| 3              | $263   | $200–400                    | $100–160 | $600–900      |
| 5              | $500\* | $300–550                    | $120–180 | $950–1,300    |
| 10+            | $500\* | $500–900                    | $150–220 | $1,200–1,800  |

\*Upgrade to 8GB AuraDB anticipated at 4–5 domains.

One-time build cost per domain: $310–600.

---

## Awake.am Integration

Awake is the sensory system that keeps the knowledge graph alive — rebuilt from scratch to be fully optimized for this purpose. The complete Awake integration architecture is documented in the companion document **"Awake: Continuous Intelligence Feed Architecture"** which covers all six steps in detail:

**Step 1 — Feed Discovery & Curation.** 30–60 curated RSS feeds per MasterDomain across 3 tiers (Industry Authority, Trade & Analyst, Signal Feeds). 300–600 total feeds at 10 domains, producing 200–500 articles/day. Includes ongoing feed maintenance via circuit breaker monitoring, signal-to-noise scoring, and coverage gap → feed gap analysis.

**Step 2 — Content Acquisition.** Tiered fetch schedule (Tier 1 every 4 hours, Tier 2 every 8, Tier 3 every 24). Full article text extraction via Readability-style content extractors. Three-level deduplication (URL, title similarity, content embedding).

**Step 3 — Two-Tier Storage.** Full article text in PostgreSQL (cheap bulk storage). Lightweight `:Article` nodes in Neo4j (summaries, concepts, embeddings, relationships). Never store only summaries — always keep full text for future evidence extraction and re-processing.

**Step 4 — 5-Stage Processing Pipeline.** Stage 1: Gemini Flash summarization + structured extraction ($0.015/article). Stage 2: Embedding generation. Stage 3: Domain routing (rules engine, no LLM). Stage 4: Graph triage via Neo4j vector similarity (evidence/partial/gap/noise classification). Stage 5: Claude Sonnet gap classification (only for flagged articles, ~15–20% of volume). Total pipeline cost: $100–265/month for 200–500 articles/day.

**Step 5 — Five Gap Detection Triggers.** (1) New subtopic discovery → auto-queue ResearchPrompt. (2) Emerging cluster detection → multiple noise articles on same topic = blind spot. (3) Stale node + fresh articles mismatch → refresh queue. (4) Domain boundary signals → taxonomy evolution. (5) Unclassified domain signals → potential new MasterDomain.

**The feedback loop:** Articles reveal gaps → ResearchPrompts queue → Deep research executes → KnowledgeNodes created → Future articles about that topic attach as Evidence instead of triggering gaps → System gets smarter every day.

---

## Implementation Roadmap

### Phase A: Infrastructure + First Domain — eCom (Weeks 1–6)

**Week 1: Foundation & Validation**

- Provision Neo4j AuraDB Professional (4GB) — production instance from day one
- Implement full production schema: 6-tier node taxonomy, 4 relationship categories, schema registry, serialization templates, `_default` SynthesisPrompt
- Scaffold eCom MasterDomain + 16 Domain nodes
- Synthesis prompt validation (critical gate): 20 research queries → review → tune → validate
- Validated nodes become first production eCom nodes

**Week 2: Coverage Map & Core Build**

- Bootstrap Passes 1–3 for eCom (landscape discovery, depth calibration, external validation)
- Tyler reviews coverage map, adds client-experience knowledge
- Begin Phase 2 deep research (Core Operational domains) via automated pipeline
- Implement VectorCypherRetriever with dynamic schema registry lookups

**Weeks 3–4: Scale**

- Continue deep research (Phases 2–4) at full pipeline throughput
- Implement freshness decay computation
- Begin cross-linking (Phase 5)
- First weekly `:Unclassified` review — identify missing types/categories
- Validate Awake integration baseline: Tyler manually tags 100 articles

**Weeks 5–6: Automation & Gap Detection**

- Build Awake article triage pipeline based on validated baseline
- Deploy gap detection layers 1–5
- Set up ResearchPrompt priority queue
- Configure Mac Mini M4 with automated pipeline
- Implement coverage health dashboard (6 metrics)
- Transition eCom to steady-state maintenance

### Phase B: Domain Expansion (Repeatable, 1–2 Weeks Each)

Each new MasterDomain follows the same playbook:

**Days 1–2: Setup**

- Create MasterDomain + Domain nodes
- Fork or create domain-scoped SynthesisPrompt
- Configure Awake verticals for gap detection

**Days 3–5: Bootstrap & Validation**

- Run Passes 1–3 (landscape discovery, depth calibration, validation)
- Validate synthesis prompt on 20 research outputs
- Tyler reviews quality, tunes prompt

**Week 1–2: Build**

- Execute deep research pipeline for the domain
- Review `:Unclassified` output — tune prompt, add domain-specific types if needed
- Build cross-MasterDomain relationships (the high-value connections)

**Transition to Steady State**

- Domain enters the ongoing gap detection and freshness cycles
- 5–10 queries/day for maintenance

### Projected Domain Rollout

| Quarter | Domains Added                              | Cumulative |
| ------- | ------------------------------------------ | ---------- |
| Q1 2026 | eCom (foundation build)                    | 1          |
| Q2 2026 | Hyperscaler Co-Selling, Social Media       | 3          |
| Q3 2026 | AI/Technology Strategy, Org Transformation | 5          |
| Q4 2026 | Client Intelligence, Media & Advertising   | 7          |
| 2027+   | Creative, Data, BizDev, others as needed   | 10+        |

### Ongoing (All Domains)

- 10–20 research queries/day per domain via automated pipeline
- Weekly `:Unclassified` node review → schema evolution decisions
- Weekly coverage health reviews (6 metrics, per-domain + cross-domain)
- Monthly depth probing and contestation audits
- Synthesis prompt versioning as domains and schema evolve
- Tyler-directed deep dives as client needs emerge

---

## The End State

When this system reaches maturity, Tyler has something no competitor can replicate: a living, self-improving, self-describing knowledge graph that spans 10+ strategic domains at consultant depth. It surfaces contradictions and competing perspectives. It maintains currency through automated freshness monitoring. It discovers its own gaps through the Awake integration. It teaches itself what new node types and relationship categories it needs through the `:Unclassified` escape hatch. It evolves through data changes, not engineering projects. And it connects dots across domains that no one else can see — the intersection of commerce and cloud partnerships, social strategy and organizational transformation, AI technology and client intelligence.

The graph knows what it knows. It knows what it doesn't know. It generates its own research agenda to close gaps. It tells you when it needs to grow in ways you didn't anticipate. And every new domain makes the whole system smarter, because cross-domain relationships compound.

That's not a database — it's a multi-domain intelligence system built to last.
