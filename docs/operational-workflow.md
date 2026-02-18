# Operational Workflow: What Gets Built, How It Runs, Who Does What

**Purpose:** Complete operational map of the Multi-Domain Knowledge Graph system
**Author:** Tyler Murray
**Date:** February 17, 2026
**Companion docs:** Knowledge Graph Architecture v3, Awake Integration Architecture

---

## System Overview

The knowledge graph system has seven major workflows. Each one needs a clear answer to three questions: What runs automatically? What needs Tyler? What tool does the work?

```
┌─────────────────────────────────────────────────────────┐
│                    THE SEVEN WORKFLOWS                   │
│                                                          │
│  1. FEED MANAGEMENT        Who covers what                │
│  2. CONTENT ACQUISITION    Getting articles daily         │
│  3. ARTICLE PROCESSING     Summarize, embed, classify    │
│  4. GRAPH TRIAGE           Match articles to knowledge   │
│  5. DEEP RESEARCH          Build new knowledge           │
│  6. RETRIEVAL              Answer questions from graph   │
│  7. SCHEMA EVOLUTION       Grow the system over time     │
│                                                          │
│  ┌────────────────────────────────────────────────┐      │
│  │ TOOLS                                          │      │
│  │                                                │      │
│  │ Claude Code    → Builds all the software       │      │
│  │ Mac Mini M4    → Runs everything 24/7          │      │
│  │ OpenClaw       → Tyler's control interface     │      │
│  │ Neo4j AuraDB   → The knowledge graph (cloud)   │      │
│  │ PostgreSQL     → Article storage (local)       │      │
│  │ APIs           → The brains (Gemini, Claude,   │      │
│  │                   Perplexity, OpenAI)           │      │
│  └────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

## Role Definitions

### Claude Code — The Builder

Claude Code builds every piece of software in this system. It writes the Python applications, the database schemas, the Cypher queries, the prompt templates, the cron configurations, and the monitoring scripts. Once built, these run on the Mac Mini without Claude Code's involvement.

Claude Code is also the iteration tool. When a synthesis prompt needs tuning, when triage thresholds need adjusting, when a new MasterDomain needs its pipeline configured — Tyler works with Claude Code to make changes, test them, and deploy.

**Claude Code does NOT run in production.** It builds things that run in production. Think of it as the engineer. The Mac Mini is the factory floor.

### Mac Mini M4 — The Factory Floor

The Mac Mini runs 24/7 in Tyler's home/office. It hosts:

- PostgreSQL database (Awake article storage)
- Python applications (all seven workflows)
- Cron scheduler (triggers workflows on schedule)
- OpenClaw (Tyler's interface to the system)
- Local monitoring and logging

It connects to:

- Neo4j AuraDB (cloud, via Bolt protocol)
- External APIs (Perplexity, OpenAI, Gemini, Claude — via HTTPS)

The Mac Mini is the single point of infrastructure. If it goes down, article fetching pauses and research queues build up, but nothing is lost — AuraDB is in the cloud, and the pipeline resumes where it left off when the Mac Mini comes back.

### OpenClaw — Tyler's Control Panel

OpenClaw is NOT an orchestrator in the traditional sense (it doesn't manage cron jobs or restart services — that's what systemd and cron do). OpenClaw is Tyler's **conversational interface** to the system. It's how Tyler interacts with the knowledge graph pipeline without opening a terminal.

**What OpenClaw does:**

- **Morning briefing delivery.** Every morning, OpenClaw sends Tyler a summary via WhatsApp/Telegram: articles processed overnight, gaps detected, research completed, anything needing review.
- **On-demand commands.** Tyler texts "what gaps were found today?" or "prioritize research on agentic checkout" or "show me coverage health for eCom" and OpenClaw translates that into database queries and pipeline commands.
- **Review interface.** When the pipeline flags something for Tyler's review (medium-confidence gaps, domain evolution signals, potential new MasterDomains), OpenClaw presents it conversationally and captures Tyler's decision (approve, reject, modify).
- **Ad-hoc research triggers.** Tyler texts "go deep on Kroger's precision marketing platform" and OpenClaw creates a ResearchPrompt, queues it at high priority, and notifies Tyler when results are ready.
- **System health.** Tyler asks "is everything running?" and OpenClaw checks cron logs, API status, database connections, and reports back.

**What OpenClaw does NOT do:**

- Run the pipelines directly (cron and Python do that)
- Make autonomous decisions about schema evolution
- Replace Claude Code for building/modifying software
- Serve as the primary data store for anything

**OpenClaw's technical role:** A long-running process on the Mac Mini that connects to WhatsApp/Telegram via API, monitors a set of database tables and log files, and can execute predefined commands (Python scripts) in response to Tyler's messages. It's a thin interface layer, not a brain.

### Tyler — The Strategist

Tyler's time investment: **15–30 minutes daily, 1 hour weekly.**

Daily (via OpenClaw, usually on phone):

- Review morning briefing (2 minutes)
- Approve/reject medium-confidence research prompts (5 minutes)
- Optionally direct ad-hoc research (as needed)

Weekly (via OpenClaw or direct dashboard):

- Review coverage health metrics across all domains (10 minutes)
- Review `:Unclassified` nodes and domain evolution signals (15 minutes)
- Approve/reject structural changes (new Domains, new NodeTypes) (10 minutes)
- Review feed health and signal-to-noise scores (5 minutes)
- Direct strategic priorities for the coming week (10 minutes)

Monthly:

- Synthesis prompt quality audit (review 20 random nodes for accuracy)
- Feed curation pass (add/remove feeds based on signal scores)
- Coverage depth assessment (are we deep enough in priority domains?)

### Neo4j AuraDB — The Knowledge Graph

Managed cloud service. Tyler doesn't administer it. The Python applications read and write to it via the Bolt protocol. It stores:

- All graph nodes (MasterDomains, Domains, KnowledgeNodes, Evidence, Context, Concepts, Articles, CoverageTopics, ResearchPrompts)
- Schema registry (NodeTypes, RelationshipCategories, SynthesisPrompts)
- Vector indexes for similarity search
- All relationships

### PostgreSQL — The Article Warehouse

Local database on the Mac Mini. Stores everything the graph doesn't need:

- Full article text (bulk storage)
- Raw HTML
- Processing metadata
- Triage results
- Feed configurations
- Signal-to-noise scores

---

## The Seven Workflows in Detail

---

### Workflow 1: Feed Management

**Purpose:** Maintain the right RSS feeds covering every MasterDomain.

**What's automated:**

- Circuit breaker monitoring (track fetch failures, flag dead feeds)
- Signal-to-noise scoring (monthly compute: what % of a feed's articles became Evidence?)
- Feed health report generation (feeds below 10% signal, feeds with 5+ consecutive failures)

**What's manual (Tyler):**

- Deciding which feeds to add for a new MasterDomain
- Removing underperforming feeds
- Promoting/demoting feed tiers based on signal scores
- Finding new feeds when coverage gaps point to missing sources

**What Claude Code builds:**

```
Application: feed_manager.py

Components:
├── Feed CRUD (add, remove, update tier, activate/deactivate)
├── Feed health monitor
│   ├── Track consecutive fetch failures
│   ├── Auto-deactivate after 30 days of failure
│   └── Generate weekly feed health report
├── Signal-to-noise calculator
│   ├── Monthly: count articles per feed
│   ├── Count articles that became EVIDENCE_UPDATE
│   ├── Compute signal ratio
│   └── Flag feeds below threshold
└── Feed discovery helper
    ├── Given a list of topics, suggest RSS feed URLs
    ├── Validate RSS/Atom feed URLs
    └── Test extraction quality (full text vs excerpt)

Database tables: feeds (PostgreSQL)
Cron schedule:
  - Health check: daily at 11 PM
  - Signal-to-noise: 1st of month at midnight
```

**OpenClaw integration:**

- Tyler texts: "add feed https://example.com/rss for eCom tier 2"
- Tyler texts: "show me feed health"
- Tyler texts: "which feeds are underperforming?"
- OpenClaw calls feed_manager.py functions and reports back

---

### Workflow 2: Content Acquisition

**Purpose:** Fetch articles from all active feeds on schedule, extract full text, deduplicate.

**What's automated (100%):**

- Scheduled RSS fetching per tier
- Full article text extraction
- URL and title deduplication
- Failure handling and retry logic
- Writing raw articles to PostgreSQL

**What's manual:** Nothing in steady state. Tyler might manually trigger a fetch if investigating something time-sensitive.

**What Claude Code builds:**

```
Application: article_fetcher.py

Components:
├── RSS/Atom parser
│   ├── Fetch feed XML
│   ├── Parse entries (title, URL, published date, content)
│   ├── Handle both RSS 2.0 and Atom formats
│   └── Track last-fetched entry per feed (don't re-process)
├── Full text extractor
│   ├── For excerpt-only feeds: fetch article URL
│   ├── Readability-style content extraction (strip nav, ads, etc.)
│   ├── Respect robots.txt and rate limits (2s between same-domain)
│   ├── Handle failures gracefully (fall back to excerpt)
│   └── Store extraction_status: full | partial | failed
├── Deduplicator
│   ├── URL normalization (strip UTM, www, trailing slash)
│   ├── Title similarity check (Jaccard >0.85 = probable dupe)
│   └── Mark duplicates, link to primary article
└── PostgreSQL writer
    ├── Insert into articles table
    ├── Set processing_status = 'pending'
    └── Handle conflicts (article already exists)

Database tables: articles, feeds (PostgreSQL)
Cron schedule:
  - Tier 1 feeds: every 4 hours (2AM, 6AM, 10AM, 2PM, 6PM, 10PM)
  - Tier 2 feeds: every 8 hours (2AM, 10AM, 6PM)
  - Tier 3 feeds: daily at 2AM
```

**Why 2 AM start:** Pipeline runs overnight so results are ready for Tyler's morning review. Tier 1 feeds also run during the day for time-sensitive signals.

---

### Workflow 3: Article Processing

**Purpose:** Summarize articles, extract structured data, generate embeddings, route to domains.

**What's automated (100%):**

- AI summarization and concept extraction (Gemini Flash)
- Embedding generation (OpenAI)
- Domain routing (rules engine)
- Writing processed data to PostgreSQL

**What's manual:** Nothing. But Tyler may review/tune the extraction prompt if quality drifts.

**What Claude Code builds:**

```
Application: article_processor.py

Components:
├── Stage 1: Summarization & Extraction
│   ├── Read pending articles from PostgreSQL
│   ├── Call Gemini Flash API with extraction prompt
│   ├── Parse structured output (summary, concepts, entities,
│   │   data_points, temporal_markers, article_type)
│   ├── Write to article_processing table
│   └── Batch processing (10–20 articles per batch for efficiency)
├── Stage 2: Embedding Generation
│   ├── Take summary text from Stage 1
│   ├── Call OpenAI text-embedding-3-small API
│   ├── Store 1536-dim vector in article_processing table
│   ├── Batch: up to 100 embeddings per API call
├── Stage 3: Domain Routing
│   ├── Rule 1: Feed primary_domain → primary route
│   ├── Rule 2: Concept embedding similarity vs Domain descriptions
│   ├── Rule 3: Named entity matching (hardcoded entity → domain map)
│   ├── Rule 4: Cross-domain detection (articles matching 2+ domains)
│   ├── Rule 5: No match → route to "_unclassified"
│   └── Write routing results to triage_results table
└── Error handling
    ├── API failures → retry with exponential backoff
    ├── Malformed responses → log and skip, don't block pipeline
    └── Rate limiting → respect, queue remaining

Database tables: article_processing, triage_results (PostgreSQL)
Cron schedule: Runs 30 minutes after each fetch cycle
  - Primary run: 2:30 AM (processes overnight Tier 1/2/3 articles)
  - Supplemental runs: 6:30 AM, 10:30 AM, 2:30 PM, 6:30 PM, 10:30 PM
    (processes Tier 1 articles fetched during the day)

Config files:
├── extraction_prompt.txt (the Gemini Flash prompt — versioned)
├── domain_routing_rules.json (entity→domain mappings)
└── embedding_config.json (model name, dimensions)
```

---

### Workflow 4: Graph Triage

**Purpose:** Match processed articles against the knowledge graph. Classify as evidence, gap signal, or noise. Inject into Neo4j.

**What's automated:**

- Stage 4: Vector similarity triage (100% automated)
- Stage 5: LLM gap classification (100% automated for high-confidence; flags medium-confidence for Tyler)
- Neo4j `:Article` node creation and relationship attachment
- ResearchPrompt creation for high-confidence gaps
- Content-level deduplication (embedding similarity check)

**What's manual (Tyler via OpenClaw):**

- Approving/rejecting medium-confidence gap classifications (5–10/day)
- Reviewing "potential_new_domain" signals (rare)

**What Claude Code builds:**

```
Application: graph_triage.py

Components:
├── Content deduplication
│   ├── Compare new article embedding vs articles from last 7 days
│   ├── Cosine similarity > 0.92 → mark as duplicate
│   ├── Link duplicate to primary article
│   └── Skip remaining triage for duplicates
├── Stage 4: Vector Similarity Triage
│   ├── Connect to Neo4j AuraDB
│   ├── For each article × routed domain:
│   │   ├── Vector search: top 5 nearest KnowledgeNodes
│   │   ├── Classify by threshold:
│   │   │   > 0.85 → EVIDENCE_UPDATE
│   │   │   0.60–0.85 → PARTIAL_MATCH → Stage 5
│   │   │   0.40–0.60 → POTENTIAL_GAP → Stage 5
│   │   │   < 0.40 → NOISE_OR_BLIND_SPOT
│   │   └── Write classification to triage_results
│   └── EVIDENCE_UPDATE actions:
│       ├── Create (:Article) node in Neo4j
│       ├── Create (:Article)-[:EVIDENCES]->(:KnowledgeNode)
│       └── Update KnowledgeNode.freshness_date
├── Stage 5: LLM Gap Classification
│   ├── Collect PARTIAL_MATCH + POTENTIAL_GAP articles
│   ├── For each, build context:
│   │   ├── Article summary + concepts
│   │   ├── Top 3 nearest KnowledgeNodes (title + definition)
│   │   └── Domain's CoverageTopic list
│   ├── Call Claude Sonnet API with classification prompt
│   ├── Parse classification output
│   ├── Route by classification:
│   │   ├── new_subtopic (conf > 0.8):
│   │   │   → Auto: Create CoverageTopic + ResearchPrompt
│   │   ├── new_subtopic (conf 0.5–0.8):
│   │   │   → Queue for Tyler's review via OpenClaw
│   │   ├── new_angle:
│   │   │   → Create (:Article)-[:RELATES_TO]->(:KnowledgeNode)
│   │   ├── new_evidence:
│   │   │   → Create (:Article)-[:EVIDENCES]->(:KnowledgeNode)
│   │   ├── noise:
│   │   │   → Mark in PostgreSQL, no Neo4j action
│   │   └── potential_new_domain:
│   │       → Queue for Tyler's weekly review
│   └── Write all results to triage_results table
├── Cluster Detection (weekly)
│   ├── Find all NOISE articles from last 7 days
│   ├── Cluster by embedding similarity (>0.80 mutual)
│   ├── Clusters of 3+ → emerging topic signal
│   └── Create high-priority CoverageTopic + ResearchPrompt
├── Stale Node Detection (weekly)
│   ├── Find KnowledgeNodes with freshness_score < 0.5
│   ├── That have 3+ new EVIDENCES articles in last 14 days
│   ├── That don't already have a queued ResearchPrompt
│   └── Auto-create refresh ResearchPrompts
└── Domain Boundary Detection (monthly)
    ├── Find articles routed to a MasterDomain
    │   but with no Domain match > 0.65
    ├── Group by concepts, count over 30 days
    ├── 5+ articles with shared concepts → domain evolution signal
    └── Queue for Tyler's weekly review

Database: PostgreSQL (triage_results) + Neo4j (Article nodes, relationships)
Cron schedule:
  - Triage: runs 15 minutes after article_processor completes
  - Cluster detection: Sundays at 3 AM
  - Stale node detection: Sundays at 4 AM
  - Domain boundary detection: 1st of month at 3 AM

Config files:
├── triage_thresholds.json (similarity cutoffs — tunable)
├── gap_classification_prompt.txt (Claude Sonnet prompt — versioned)
└── cluster_config.json (similarity threshold, min cluster size)
```

---

### Workflow 5: Deep Research

**Purpose:** Execute research prompts from the queue, synthesize results into KnowledgeNodes, ingest into Neo4j.

**What's automated:**

- Research prompt execution (Perplexity/OpenAI APIs)
- Synthesis (Claude turning research into graph entities)
- Neo4j ingestion (creating nodes, relationships, lineage)
- Quality gate (verify Core properties, flag failures as `:Unclassified`)

**What's manual (Tyler):**

- Approving medium-confidence ResearchPrompts before execution
- Reviewing synthesis quality (monthly audit of 20 random nodes)
- Tuning synthesis prompts when quality drifts
- Directing ad-hoc research ("go deep on X")

**What Claude Code builds:**

```
Application: research_pipeline.py

Components:
├── Research Queue Manager
│   ├── Read ResearchPrompts from Neo4j (status: "queued")
│   ├── Sort by priority (descending)
│   ├── Filter: only execute prompts that are either
│   │   auto-approved (high confidence) OR Tyler-approved
│   ├── Rate limit: max 20 prompts/day steady state,
│   │   max 200/day during domain build
│   └── Track execution status
├── Research Executor
│   ├── Primary: Perplexity Sonar Deep Research API
│   │   ├── Send prompt_text as query
│   │   ├── Wait for completion (~3 minutes)
│   │   ├── Parse response
│   │   └── Store raw output in PostgreSQL (research_outputs table)
│   ├── Supplemental: OpenAI o4-mini (for prompts flagged
│   │   as needing actionable/implementation detail)
│   ├── Fallback: If Perplexity fails, retry once, then
│   │   try OpenAI o4-mini, then mark as failed
│   └── Parallelization: up to 5 concurrent requests
├── Synthesizer
│   ├── Read active SynthesisPrompt for target MasterDomain
│   ├── Read schema registry (NodeTypes, RelationshipCategories,
│   │   property conventions) from Neo4j
│   ├── Call Claude Sonnet API with:
│   │   ├── The SynthesisPrompt template
│   │   ├── The raw research output
│   │   ├── Schema registry context (valid types, properties,
│   │   │   relationship categories)
│   │   └── Existing KnowledgeNode titles in the same Domain
│   │       (to avoid duplicates)
│   ├── Parse structured output:
│   │   ├── KnowledgeNodes (title, summary, definition,
│   │   │   deep_content, confidence, claim_type)
│   │   ├── Evidence nodes (citation, methodology, strength, year)
│   │   ├── Context nodes (conditions, temporal_range, geographic)
│   │   ├── Concept nodes (definition, parent_concepts)
│   │   ├── Relationships (category, properties)
│   │   └── Classification labels
│   └── Return structured graph entities
├── Graph Ingestor
│   ├── Create KnowledgeNode in Neo4j with Core + Standard properties
│   ├── Generate embedding for each KnowledgeNode
│   ├── Create Evidence, Context, Concept nodes
│   ├── Create all relationships
│   ├── Create lineage:
│   │   ├── (:KnowledgeNode)-[:CREATED_BY]->(:SynthesisPrompt)
│   │   ├── (:KnowledgeNode)-[:SOURCED_FROM]->(:ResearchOutput)
│   │   └── (:KnowledgeNode)-[:BELONGS_TO]->(:Domain)
│   ├── Update CoverageTopic status: "gap" → "covered"
│   ├── Update ResearchPrompt status: "queued" → "completed"
│   └── Apply classification labels
├── Quality Gate
│   ├── Check: all Core properties present?
│   ├── Check: at least 1 Evidence node attached?
│   ├── Check: confidence is a valid float 0–1?
│   ├── Check: relationships reference valid categories?
│   ├── Pass → node enters graph normally
│   └── Fail → create (:Unclassified) node with raw content,
│       failure reason, and source reference
└── Bootstrap Mode
    ├── For new MasterDomain builds
    ├── Runs Passes 1–3 (landscape discovery, depth calibration,
    │   external validation)
    ├── Creates CoverageTopic taxonomy
    ├── Executes deep research at higher throughput (50–100/day)
    └── Includes cross-domain relationship identification

Database: PostgreSQL (research_outputs) + Neo4j (all graph entities)
Cron schedule:
  - Queue check: every 30 minutes, 6 AM–10 PM
  - Execution: continuous when queue has approved items
  - Bootstrap mode: manual trigger via OpenClaw

Config files:
├── synthesis_prompts/ (directory, one per MasterDomain + _default)
│   ├── ecom_v1.txt
│   ├── hyperscaler_v1.txt
│   └── _default_v1.txt
├── research_config.json (API keys, rate limits, parallelization)
└── quality_gate_rules.json (what counts as pass/fail)
```

**OpenClaw integration:**

- Tyler texts: "go deep on Kroger precision marketing" → OpenClaw creates a high-priority ResearchPrompt
- Tyler texts: "what's in the research queue?" → OpenClaw queries Neo4j for pending prompts
- Tyler texts: "approve all pending research" → OpenClaw marks all medium-confidence prompts as approved
- Tyler texts: "run bootstrap for hyperscaler domain" → OpenClaw triggers bootstrap mode
- Tyler texts: "pause research" / "resume research" → OpenClaw enables/disables the research cron

---

### Workflow 6: Retrieval

**Purpose:** Answer Tyler's questions using the knowledge graph + Claude's extended thinking.

**What's automated:**

- Vector search + graph traversal (VectorCypherRetriever)
- Context serialization (reading templates from schema registry)
- Claude API call with retrieved context

**What's manual (Tyler):**

- Asking questions (this IS the product)

**What Claude Code builds:**

```
Application: retriever.py

Components:
├── Query Handler
│   ├── Accept natural language question
│   ├── Generate embedding for the question
│   ├── Optional: domain hint (if Tyler specifies "in eCom...")
│   └── Optional: depth hint ("give me the full picture" vs "quick answer")
├── VectorCypherRetriever
│   ├── Vector search: top 10 nearest KnowledgeNodes
│   ├── Read RelationshipCategories from schema registry
│   ├── Traverse all registered relationship categories within 2 hops
│   ├── Collect Evidence, Context, Concept nodes
│   ├── Collect cross-domain relationships (the unique value)
│   ├── Shortest path analysis between top results
│   │   (Report 6: shortest paths contain more valuable context
│   │    than direct neighbors)
│   ├── Collect contradictions (EPISTEMIC stance: "contradicts")
│   │   (Report 6: must be pre-annotated, Claude detects them
│   │    at near-random rates on its own)
│   └── Return subgraph
├── Context Serializer
│   ├── Read serialization templates from schema registry
│   ├── Render each KnowledgeNode using its template
│   ├── BFS ordering with most relevant content LAST
│   │   (Report 6: exploits recency bias)
│   ├── Target 8K tokens (Report 6: universally optimal
│   │   for comprehensiveness)
│   ├── Include relationship context between nodes
│   └── Pre-annotate contradictions with ⚠ markers
├── Claude Caller
│   ├── Model: Claude Opus 4.5 with extended thinking enabled
│   ├── System prompt: domain expertise framing
│   ├── Context: serialized subgraph from above
│   ├── Question: Tyler's original query
│   └── Return response
└── Response Augmentation
    ├── Track which KnowledgeNodes were used in the response
    ├── If no relevant nodes found → log as "question failure"
    │   → auto-create ResearchPrompt (gap detection layer 4)
    └── If response quality is low → suggest deeper research

Integration: This is NOT a cron job. This runs on-demand.
Access methods:
  1. OpenClaw: Tyler texts a question → retriever runs →
     response sent back via WhatsApp/Telegram
  2. CLI: Tyler runs `python retriever.py "question"` in terminal
  3. Future: Web UI or Claude.ai MCP integration
```

**OpenClaw integration:**

- Tyler texts: "Why is our retail media ROAS declining despite increased spend?"
- OpenClaw routes to retriever.py
- Retriever searches graph, serializes context, calls Claude Opus
- OpenClaw sends response back to Tyler via WhatsApp/Telegram
- If the graph can't answer well → OpenClaw adds: "I don't have deep knowledge on [X]. Want me to research it?"

---

### Workflow 7: Schema Evolution

**Purpose:** Grow the graph's structure as new patterns emerge.

**What's automated:**

- `:Unclassified` node accumulation (from synthesis quality gate)
- Pattern detection in unclassified nodes
- Domain boundary signals from triage
- Generating suggestions for Tyler

**What's manual (Tyler + Claude Code):**

- Reviewing `:Unclassified` patterns and deciding what they mean
- Deciding to add a new NodeType, Property, RelationshipCategory, or Domain
- Working with Claude Code to implement the change
- Validating the change with a test synthesis run

**What Claude Code builds:**

```
Application: schema_monitor.py

Components:
├── Unclassified Analyzer (weekly)
│   ├── Query Neo4j for all `:Unclassified` nodes (reviewed: false)
│   ├── Cluster by reason_unclassified and concepts
│   ├── For clusters of 5+:
│   │   ├── Generate suggestion: "Consider adding NodeType: [X]"
│   │   ├── Include example content from the cluster
│   │   └── Draft what the NodeType registry entry would look like
│   ├── For one-offs: mark as reviewed, no action needed
│   └── Report to Tyler via OpenClaw
├── Coverage Health Dashboard (weekly)
│   ├── Coverage Score: % of CoverageTopics with status "covered"
│   ├── Depth Score: avg Evidence nodes per KnowledgeNode
│   ├── Within-Domain Connectivity: avg relationships within domain
│   ├── Cross-Domain Connectivity: avg relationships spanning domains
│   ├── Freshness Score: % of nodes above freshness threshold
│   ├── Contestation Coverage: % with EPISTEMIC contradicts
│   ├── Per-MasterDomain breakdown
│   └── Trend over time (compare to last week/month)
├── Freshness Computation (weekly)
│   ├── For each KnowledgeNode:
│   │   ├── Compute time since freshness_date
│   │   ├── Apply freshness_half_life decay function
│   │   ├── Set freshness_score (0–1)
│   │   └── If below threshold → check for existing ResearchPrompt
│   │       → if none, create one
│   └── Report freshness summary to dashboard
└── Schema Change Helper
    ├── NOT automated — Tyler runs manually via Claude Code
    ├── Adding a NodeType:
    │   ├── Create (:NodeType) in registry
    │   ├── Create serialization template
    │   ├── Optionally reclassify :Unclassified nodes
    │   └── Update SynthesisPrompt to produce new type
    ├── Adding a Property:
    │   ├── Update (:NodeType) in registry
    │   ├── Update serialization template with COALESCE
    │   └── Optionally backfill existing nodes
    ├── Adding a RelationshipCategory:
    │   ├── Create (:RelationshipCategory) in registry
    │   └── Update SynthesisPrompt
    └── Adding a MasterDomain:
        ├── Create MasterDomain + Domain nodes
        ├── Create/fork SynthesisPrompt
        ├── Configure feeds (Workflow 1)
        └── Trigger bootstrap (Workflow 5)

Cron schedule:
  - Unclassified analysis: Sundays at 5 AM
  - Coverage health: Sundays at 6 AM
  - Freshness computation: Sundays at 7 AM

  Results posted to Tyler via OpenClaw by 8 AM Sunday
```

---

## OpenClaw: The Full Interface Specification

OpenClaw ties everything together as Tyler's natural language control layer. Here's exactly what it handles:

### Morning Briefing (Daily, 7 AM)

OpenClaw automatically sends Tyler a morning message:

```
Good morning. Here's your overnight intelligence update:

📥 312 articles processed (287 full text, 25 partial)
📎 218 attached as evidence to existing knowledge
🔍 14 new gaps detected (8 auto-queued, 6 need your review)
🔄 7 stale nodes queued for refresh
📊 Research completed: 5 new KnowledgeNodes added overnight

⚠ 2 items need your attention:
1. "In-store retail media measurement" — new subtopic?
   (conf: 0.72, source: AdExchanger Tier 1) [Approve / Reject]
2. "AI-powered planogram optimization" — new subtopic?
   (conf: 0.65, source: Retail Dive Tier 2) [Approve / Reject]

🔋 System health: All green
```

### Command Set

Tyler can text any of these (or natural language variations):

**Research commands:**

- "Research [topic]" → Creates high-priority ResearchPrompt
- "Go deep on [topic]" → Creates ResearchPrompt with depth: "deep"
- "What's in the research queue?" → Lists pending ResearchPrompts
- "Approve all pending research" → Marks all medium-conf prompts as approved
- "Approve #3" → Approves specific queued item
- "Reject #5" → Rejects specific queued item
- "Pause research" / "Resume research" → Toggles research pipeline

**Query commands:**

- "Ask: [any question]" → Routes to retriever.py, returns answer
- "What do we know about [topic]?" → Retriever with topic focus
- "Compare [X] vs [Y]" → Retriever with comparison framing

**Status commands:**

- "Coverage health" → Coverage health dashboard summary
- "Coverage health for [domain]" → Domain-specific metrics
- "Feed health" → Feed monitoring report
- "What gaps were found this week?" → Gap detection summary
- "Show unclassified nodes" → Unclassified analysis summary
- "System status" → Checks all services, reports health

**Domain management:**

- "Add domain [name] under [MasterDomain]" → Creates Domain node
- "Bootstrap [MasterDomain]" → Triggers bootstrap mode
- "Add feed [URL] for [domain] tier [N]" → Adds RSS feed

**Review commands:**

- "Show me what needs review" → All pending items across workflows
- "Weekly review" → Full weekly review dashboard

### OpenClaw Technical Implementation

```
Application: openclaw_interface.py

Components:
├── Messaging Integration
│   ├── WhatsApp Business API or Telegram Bot API
│   ├── Receive messages from Tyler
│   ├── Send formatted responses back
│   ├── Handle rich formatting (tables, code blocks where supported)
│   └── Queue outgoing messages (don't flood)
├── Command Parser
│   ├── NLU layer: map Tyler's natural language to commands
│   ├── Can use a small LLM (Gemini Flash or Claude Haiku)
│   │   for intent classification if regex isn't enough
│   ├── Extract parameters (topic, domain, priority, etc.)
│   └── Confirm destructive actions before executing
├── Command Executor
│   ├── Maps parsed commands to Python function calls
│   ├── Each workflow exposes a set of callable functions:
│   │   ├── feed_manager.add_feed()
│   │   ├── research_pipeline.create_prompt()
│   │   ├── research_pipeline.approve_prompt()
│   │   ├── retriever.ask()
│   │   ├── schema_monitor.coverage_health()
│   │   └── etc.
│   ├── Handles async operations (research takes minutes)
│   └── Sends result back via messaging integration
├── Scheduled Messages
│   ├── Morning briefing: daily at 7 AM
│   ├── Weekly review: Sunday at 9 AM
│   ├── Alert on critical signals (potential_new_domain,
│   │   system failures) immediately
│   └── Configurable quiet hours (no messages 10 PM–6 AM
│       except critical alerts)
└── State Management
    ├── Track conversation context (so Tyler can say
    │   "approve that" referring to the last presented item)
    ├── Track pending review items
    └── Simple SQLite state store (not PostgreSQL —
        this is OpenClaw's internal state only)

Runs as: Long-running daemon process on Mac Mini
  Started via systemd service
  Auto-restarts on crash
  Logs to /var/log/openclaw/
```

---

## Complete File/Application Map

Everything Claude Code builds, organized by where it lives on the Mac Mini:

```
/home/tyler/knowledge-graph/
│
├── apps/
│   ├── article_fetcher.py        ← Workflow 2
│   ├── article_processor.py      ← Workflow 3
│   ├── graph_triage.py           ← Workflow 4
│   ├── research_pipeline.py      ← Workflow 5
│   ├── retriever.py              ← Workflow 6
│   ├── schema_monitor.py         ← Workflow 7
│   ├── feed_manager.py           ← Workflow 1
│   └── openclaw_interface.py     ← OpenClaw
│
├── config/
│   ├── feeds.json                ← Feed URLs, tiers, domain mappings
│   ├── triage_thresholds.json    ← Similarity cutoffs (tunable)
│   ├── research_config.json      ← API keys, rate limits
│   ├── domain_routing_rules.json ← Entity → domain mappings
│   ├── embedding_config.json     ← Model name, dimensions
│   ├── quality_gate_rules.json   ← Synthesis quality checks
│   ├── cluster_config.json       ← Cluster detection params
│   └── openclaw_config.json      ← Messaging API keys, quiet hours
│
├── prompts/
│   ├── extraction_prompt.txt     ← Gemini Flash article extraction
│   ├── gap_classification.txt    ← Claude Sonnet triage Stage 5
│   ├── synthesis/
│   │   ├── ecom_v1.txt           ← eCom synthesis prompt
│   │   ├── hyperscaler_v1.txt    ← Hyperscaler synthesis prompt
│   │   └── _default_v1.txt       ← Fallback synthesis prompt
│   └── retrieval_system.txt      ← Claude Opus system prompt
│
├── db/
│   ├── schema.sql                ← PostgreSQL schema
│   ├── migrations/               ← Database migration scripts
│   └── seed_data.sql             ← Initial domain/feed data
│
├── cron/
│   └── crontab.txt               ← All cron schedules
│
├── services/
│   ├── openclaw.service           ← systemd service file
│   └── knowledge-graph.service    ← Optional: umbrella service
│
├── logs/
│   ├── fetcher.log
│   ├── processor.log
│   ├── triage.log
│   ├── research.log
│   └── openclaw.log
│
├── tests/
│   ├── test_fetcher.py
│   ├── test_processor.py
│   ├── test_triage.py
│   ├── test_research.py
│   ├── test_retriever.py
│   └── test_integration.py       ← End-to-end pipeline test
│
└── docs/
    ├── knowledge-graph-architecture-v3.md
    ├── awake-integration-architecture.md
    └── operational-workflow.md     ← This document
```

---

## Cron Schedule (All Times Mac Mini Local)

```
# ═══════════════════════════════════════════════════════
# ARTICLE ACQUISITION & PROCESSING
# ═══════════════════════════════════════════════════════

# Tier 1 feeds: every 4 hours
0 2,6,10,14,18,22 * * *    python apps/article_fetcher.py --tier 1

# Tier 2 feeds: every 8 hours
0 2,10,18 * * *             python apps/article_fetcher.py --tier 2

# Tier 3 feeds: daily
0 2 * * *                   python apps/article_fetcher.py --tier 3

# Process articles: 30 min after each fetch
30 2,6,10,14,18,22 * * *    python apps/article_processor.py

# ═══════════════════════════════════════════════════════
# GRAPH TRIAGE
# ═══════════════════════════════════════════════════════

# Triage: 15 min after processing
45 2,6,10,14,18,22 * * *    python apps/graph_triage.py --daily

# Cluster detection: weekly
0 3 * * 0                   python apps/graph_triage.py --clusters

# Stale node detection: weekly
0 4 * * 0                   python apps/graph_triage.py --stale

# Domain boundary detection: monthly
0 3 1 * *                   python apps/graph_triage.py --boundaries

# ═══════════════════════════════════════════════════════
# DEEP RESEARCH
# ═══════════════════════════════════════════════════════

# Research queue check: every 30 min during waking hours
*/30 6-22 * * *             python apps/research_pipeline.py --process-queue

# ═══════════════════════════════════════════════════════
# MONITORING & REPORTING
# ═══════════════════════════════════════════════════════

# Feed health check: daily
0 23 * * *                  python apps/feed_manager.py --health-check

# Signal-to-noise scoring: monthly
0 0 1 * *                   python apps/feed_manager.py --signal-score

# Unclassified analysis: weekly
0 5 * * 0                   python apps/schema_monitor.py --unclassified

# Coverage health: weekly
0 6 * * 0                   python apps/schema_monitor.py --coverage

# Freshness computation: weekly
0 7 * * 0                   python apps/schema_monitor.py --freshness

# ═══════════════════════════════════════════════════════
# OPENCLAW
# ═══════════════════════════════════════════════════════

# Morning briefing: daily (OpenClaw sends via messaging)
0 7 * * *                   python apps/openclaw_interface.py --morning-briefing

# Weekly review: Sundays (OpenClaw sends via messaging)
0 9 * * 0                   python apps/openclaw_interface.py --weekly-review

# OpenClaw daemon runs as systemd service, not cron
```

---

## Build Sequence: What to Build When

### Phase 1: Core Pipeline (Week 1–2 with Claude Code)

**Goal:** Articles flowing from RSS → PostgreSQL → Neo4j with basic triage.

Build in this order:

1. **PostgreSQL schema** (`db/schema.sql`) — articles, feeds, article_processing, triage_results tables
2. **article_fetcher.py** — RSS parsing, full text extraction, dedup, PostgreSQL writes
3. **article_processor.py** — Gemini Flash summarization, OpenAI embedding, domain routing
4. **graph_triage.py** (Stage 4 only) — Neo4j vector similarity, EVIDENCE_UPDATE attachment
5. **Cron setup** — fetcher + processor + triage on schedule

**Test:** Add 10 eCom feeds. Run pipeline. Verify: articles land in PostgreSQL with summaries, embeddings generated, basic triage classifies articles against existing KnowledgeNodes (which are being built in parallel by Workflow 5).

**Dependency:** Requires at least 20 KnowledgeNodes in Neo4j to triage against. Build research_pipeline.py synthesis validation in parallel.

### Phase 2: Intelligence Layer (Week 2–3 with Claude Code)

**Goal:** Gap detection working. System identifies what it doesn't know.

Build:

6. **graph_triage.py** (Stage 5) — Claude Sonnet gap classification, ResearchPrompt creation, CoverageTopic creation
7. **research_pipeline.py** — Research queue manager, Perplexity executor, Claude synthesizer, Neo4j ingestor, quality gate
8. **Synthesis prompt v1** for eCom domain — the critical prompt that turns research into nodes
9. **Quality gate** — validate synthesis output, route failures to `:Unclassified`

**Test:** Run 20 research queries through the full pipeline. Tyler reviews 20 resulting nodes. Tune synthesis prompt. This is the critical gate — don't proceed until synthesis quality is validated.

### Phase 3: Retrieval (Week 3 with Claude Code)

**Goal:** Tyler can ask questions and get knowledge-graph-backed answers.

Build:

10. **retriever.py** — VectorCypherRetriever, context serializer (reads templates from registry), Claude Opus caller
11. **Question failure tracking** — log unanswerable questions, auto-create ResearchPrompts

**Test:** Tyler asks 10 real questions he'd ask in client meetings. Evaluate response quality vs Claude-without-graph. This is the first moment the system proves its value.

### Phase 4: OpenClaw (Week 3–4 with Claude Code)

**Goal:** Tyler can interact with the system from his phone.

Build:

12. **openclaw_interface.py** — messaging integration, command parser, command executor, scheduled messages
13. **Morning briefing** template and generator
14. **Command routing** to all workflow functions

**Test:** Tyler texts "what's in the research queue?" and gets a real answer. Tyler texts "research Kroger precision marketing" and a ResearchPrompt appears. Tyler texts "ask: why is retail media ROAS declining?" and gets a graph-backed answer.

### Phase 5: Monitoring & Feedback (Week 4–5 with Claude Code)

**Goal:** System monitors itself and recommends improvements.

Build:

15. **schema_monitor.py** — unclassified analyzer, coverage health dashboard, freshness computation
16. **feed_manager.py** — signal-to-noise scoring, feed health monitoring
17. **Cluster detection** and **stale node detection** in graph_triage.py
18. **Weekly review** format and delivery via OpenClaw

**Test:** Run for 2 weeks. Review weekly dashboard. Verify gap signals make sense. Tune thresholds based on real data.

### Phase 6: Scale & Polish (Week 5–6)

**Goal:** System runs autonomously. Tyler's involvement drops to 15–30 min/day.

19. Expand to full 30–60 feeds for eCom domain
20. Tune all thresholds based on accumulated data
21. Add error alerting (API failures, pipeline stalls)
22. Add logging and monitoring
23. Document operational runbooks (what to do when things break)
24. Domain boundary detection (monthly job)

### Phase 7+: Domain Expansion (1–2 weeks per domain)

For each new MasterDomain:

1. Tyler defines the domain and its sub-areas
2. Claude Code: Create MasterDomain + Domain nodes
3. Claude Code: Fork/create synthesis prompt
4. Tyler: Curate 30–60 RSS feeds
5. Claude Code: Configure feeds in system
6. Run bootstrap Passes 1–3 via research_pipeline.py
7. Tyler validates 20 nodes from synthesis
8. Open pipeline for that domain
9. OpenClaw starts routing that domain's articles and gaps

---

## Daily Operations Timeline

```
2:00 AM  ┤ article_fetcher: Fetch all tiers
2:30 AM  ┤ article_processor: Summarize + embed + route
2:45 AM  ┤ graph_triage: Match against graph, classify
3:00 AM  ┤ graph_triage: Stage 5 gap classification (Claude)
3:15 AM  ┤ Pipeline complete. Results in PostgreSQL + Neo4j.
         │
6:00 AM  ┤ article_fetcher: Tier 1 refresh
6:30 AM  ┤ article_processor: Process new Tier 1 articles
6:45 AM  ┤ graph_triage: Triage Tier 1 articles
         │
7:00 AM  ┤ openclaw: Send morning briefing to Tyler
7:05 AM  ┤ Tyler reviews briefing on phone (2 min)
7:10 AM  ┤ Tyler approves/rejects flagged items (5 min)
         │
7:30 AM  ┤ research_pipeline: Pick up approved queue items
         ┤ (runs every 30 min through the day)
         │
10:00 AM ┤ article_fetcher: Tier 1 refresh
10:30 AM ┤ Process + triage cycle
         │
[Repeats for Tier 1 at 2 PM, 6 PM, 10 PM]
[Tier 2 also runs at 10 AM and 6 PM]
         │
11:00 PM ┤ feed_manager: Health check
         │
Ongoing  ┤ openclaw: Listening for Tyler's messages 24/7
         ┤ Tyler can ask questions, direct research,
         ┤ check status anytime via WhatsApp/Telegram
```

---

## Failure Modes & Recovery

| Failure                   | Impact                                                                            | Auto-Recovery                                                                              | Manual Fix                                       |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Mac Mini power loss       | All pipelines pause                                                               | Articles queue on RSS sources. Pipeline resumes on restart, processing anything missed.    | Reboot Mac Mini.                                 |
| Neo4j AuraDB outage       | Triage + research + retrieval stop. Fetching + processing continue to PostgreSQL. | Pipeline retries Neo4j connection every 5 min. Processes backlog when connection restored. | Check AuraDB status page.                        |
| Gemini Flash API down     | Article processing pauses                                                         | Articles queue in PostgreSQL as "pending." Resume when API returns.                        | Switch to backup model (Claude Haiku) in config. |
| Claude Sonnet API down    | Stage 5 gap classification pauses. Stages 1–4 continue working.                   | Stage 4 results still attach evidence. Stage 5 backlog processes when API returns.         | None needed — degraded but functional.           |
| Perplexity API down       | Deep research pauses. Gaps queue.                                                 | ResearchPrompts stay "queued." Execute when API returns.                                   | None needed.                                     |
| OpenAI Embedding API down | New articles can't be embedded or triaged                                         | Articles queue as "pending" in PostgreSQL.                                                 | Switch to backup embedding model in config.      |
| PostgreSQL crash          | Everything stops — no article storage                                             | Depends on backup strategy. Use daily pg_dump backups.                                     | Restore from backup.                             |
| OpenClaw crash            | Tyler loses phone interface. Everything else continues.                           | systemd auto-restarts the service.                                                         | Check logs, restart manually if needed.          |

**Key principle:** The pipeline degrades gracefully. Most failures only affect one stage. Articles queue rather than being lost. Neo4j data is in the cloud and not at risk from local failures. The most critical local data (PostgreSQL) should have daily backups.

---

## Cost Summary

### Monthly Operating Costs (Steady State, 1 Domain)

| Component                                     | Cost               |
| --------------------------------------------- | ------------------ |
| Neo4j AuraDB Professional (4GB)               | $263               |
| Gemini Flash (article summarization, 500/day) | $90–120            |
| OpenAI Embeddings (article + node embeddings) | $5–15              |
| Claude Sonnet (gap classification, ~100/day)  | $3–10              |
| Claude Sonnet (synthesis, ~20/day)            | $15–30             |
| Claude Opus (retrieval, ~10 queries/day)      | $20–50             |
| Perplexity API (deep research, 10–20/day)     | $120–240           |
| OpenAI o4-mini (supplemental research)        | $30–60             |
| **Total**                                     | **$550–790/month** |

### Scaling to 10 Domains

| Component          | 1 Domain     | 3 Domains      | 5 Domains        | 10 Domains       |
| ------------------ | ------------ | -------------- | ---------------- | ---------------- |
| AuraDB             | $263         | $263           | $500             | $500             |
| Article processing | $100–150     | $150–250       | $200–350         | $300–500         |
| Gap classification | $3–10        | $8–25          | $15–40           | $25–70           |
| Deep research      | $150–300     | $250–500       | $400–700         | $600–1,000       |
| Retrieval          | $20–50       | $25–60         | $30–70           | $40–90           |
| **Total**          | **$550–790** | **$700–1,100** | **$1,150–1,660** | **$1,470–2,160** |

### One-Time Build Costs

| Phase                          | Hours (Claude Code) | API Spend             |
| ------------------------------ | ------------------- | --------------------- |
| Core pipeline (Workflows 1–4)  | 8–12 hours          | $50–100 (testing)     |
| Research pipeline (Workflow 5) | 6–8 hours           | $100–200 (validation) |
| Retrieval (Workflow 6)         | 4–6 hours           | $20–50 (testing)      |
| OpenClaw (Workflow 7)          | 6–8 hours           | Minimal               |
| Monitoring (Workflow 7)        | 4–6 hours           | Minimal               |
| First domain build (eCom)      | —                   | $500–700 (research)   |
| **Total**                      | **28–40 hours**     | **$670–1,050**        |

Each subsequent domain: 4–6 hours Claude Code + $310–600 research API spend.
