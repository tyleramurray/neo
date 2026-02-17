# Awake: Continuous Intelligence Feed Architecture

> **Note:** "Awake" is a working title and will be renamed.

**Purpose:** How Awake plugs into the Multi-Domain Knowledge Graph
**Author:** Tyler Murray
**Date:** February 16, 2026
**Assumption:** Clean-sheet rebuild — optimized from the ground up for knowledge graph integration

---

## What Awake Does in This System

Awake is the sensory system that keeps the knowledge graph alive. Without it, the graph is a snapshot that decays. With it, the graph is a living system that detects change, absorbs new evidence, and identifies its own blind spots — automatically, every day.

The knowledge graph has two modes of learning: **deep research** (expensive, thorough, targeted — Perplexity/OpenAI APIs producing full KnowledgeNodes) and **continuous signal** (cheap, broad, automated — Awake scanning hundreds of articles daily for changes and gaps). Deep research builds the graph. Awake keeps it alive and tells it where to research next.

The full pipeline:

```
RSS Feeds (300–600 across all domains)
    ↓
Fetch & Extract (full article text, daily)
    ↓
Process (summarize, extract concepts, embed)
    ↓
Store (two-tier: cheap bulk storage + lightweight graph nodes)
    ↓
Triage (match against knowledge graph — evidence, gap, or noise?)
    ↓
Act (attach evidence, trigger research, alert on blind spots)
    ↓
Loop (new knowledge improves triage accuracy)
```

---

## Step 1: Find All the Right RSS Feeds

### The Goal

Maintain a curated set of RSS feeds that collectively cover every MasterDomain with minimal noise and minimal blind spots. You're not trying to read every article — you're trying to ensure that when something changes in any domain you care about, at least one feed carries it.

### Feed Tiers

Not all feeds are equal. The system uses a 3-tier feed taxonomy that determines fetch frequency, triage priority, and signal weighting:

**Tier 1 — Industry Authority (5–10 per MasterDomain)**

These are the feeds where signal-to-noise is highest. Written by domain experts, original reporting, data-backed. When these publish something, it matters.

Examples by domain:

| MasterDomain           | Tier 1 Feeds                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| eCom/Commerce          | Marketplace Pulse, Modern Retail, Retail Dive, eMarketer, Stratechery (commerce posts) |
| Hyperscaler Co-Selling | AWS Partner Network Blog, Azure Partner Center Blog, Google Cloud Blog, The New Stack  |
| Social Media           | Platformer, The Information (social coverage), Social Media Today                      |
| AI/Technology          | The Batch (Andrew Ng), Import AI, Stratechery (tech posts), Ben Thompson               |

Tier 1 feeds get fetched most frequently and their articles get the highest triage priority. An article from Marketplace Pulse about retail media measurement carries more weight than the same claim from a generic news aggregator.

**Tier 2 — Trade & Analyst (10–20 per MasterDomain)**

Broader coverage, more volume, more noise. Industry trade publications, analyst blogs, consulting firm thought leadership, category-specific publications.

Examples: Retail TouchPoints, Digital Commerce 360, AdExchanger, Digiday, Chain Store Age, Progressive Grocer, Search Engine Land, TechCrunch (commerce/cloud beats).

These are your breadth sources. They won't break news first, but they cover angles and sub-topics that Tier 1 sources skip.

**Tier 3 — Signal Feeds (10–30 per MasterDomain)**

High-volume, lower signal-to-noise. These exist primarily for gap detection — you're not reading every article, but the triage pipeline scans them for topics the knowledge graph doesn't cover.

Examples: Google News RSS for "[domain] technology," press release wires (PR Newswire RSS for relevant categories), company newsrooms (Amazon Seller Blog, Walmart Corporate), subreddit RSS feeds (r/FulfillmentByAmazon, r/ecommerce), industry association feeds.

Also includes **platform-specific feeds** that are high-signal but very low volume: Instacart Ads blog, Kroger Precision Marketing updates, Target Roundel announcements. These often announce changes before anyone else covers them.

### Feed Discovery Process

When a new MasterDomain is created, feed discovery follows a systematic process:

**1. Bootstrap from landscape research.** The domain's Pass 1 landscape discovery (from the knowledge graph bootstrap) already identified the key sub-topics, players, and debates. Use these as search terms to find relevant RSS feeds. Many industry publications have RSS feeds that aren't prominently linked — check `/feed`, `/rss`, `/atom.xml` on their domains.

**2. AI-assisted suggestion.** Feed the domain's sub-topic list into an LLM with the prompt: "For each of these commerce sub-topics, suggest 3–5 authoritative RSS feeds that a senior analyst would monitor. Prioritize feeds with original reporting, data, and expert analysis. Exclude generic news aggregators." Cross-reference suggestions against actual RSS availability.

**3. Competitive analysis.** What are the top analysts and practitioners in each domain reading? Check their Twitter/LinkedIn shares, their newsletter citations, their conference speaking bios. The sources they reference are likely Tier 1 candidates.

**4. RSS directories.** Feedly's topic directories, Feedspot's "Top RSS Feeds" lists by category, and OPML exports from industry analysts who share their feed lists publicly.

**5. Validate every feed.** Before adding, check: Does it actually have an RSS/Atom feed? How frequently does it publish (daily? weekly? dead for 6 months?)? Is the content original or syndicated? Does the RSS include full text or just excerpts?

**Target:** 30–60 feeds per MasterDomain. At 10 MasterDomains: 300–600 total feeds producing 200–500 articles/day.

### Feed Mapping to Domains

Every feed maps to one primary MasterDomain and optionally to secondary MasterDomains:

```
Feed: "Marketplace Pulse"
├── Primary: ecom
└── Secondary: none

Feed: "AdExchanger"
├── Primary: ecom (retail media coverage)
└── Secondary: media (broader ad tech)

Feed: "The New Stack"
├── Primary: ai-strategy
└── Secondary: hyperscaler

Feed: "TechCrunch — Commerce"
├── Primary: ecom
└── Secondary: ai-strategy, social
```

This mapping is stored as metadata on the feed and used for domain routing in the triage pipeline. An article from a feed with `primary: ecom` gets triaged against the eCom MasterDomain first. If its concepts also match Hyperscaler topics, the triage pipeline routes it there too (see Step 4).

### Ongoing Feed Maintenance

Feeds degrade. Blogs go dormant, publications pivot, new sources emerge. Three maintenance mechanisms:

**Circuit breaker monitoring.** Track fetch failures. After 5 consecutive failures, mark the feed as unhealthy. After 30 days unhealthy, flag for removal review. This already exists in concept in the current Awake architecture — keep it.

**Signal-to-noise scoring.** After 30 days, compute what percentage of a feed's articles actually attached as Evidence to KnowledgeNodes (high signal) versus got classified as noise (low signal). Feeds consistently below 10% signal → candidates for removal or tier demotion. Feeds consistently above 50% signal → candidates for tier promotion.

**Coverage gap → feed gap.** When the knowledge graph's gap detection system identifies a CoverageTopic that's consistently "stale" despite ongoing research, check whether there are RSS feeds that should be covering that topic. Missing feeds are a common cause of blind spots. If no feed covers "Instacart Ads platform changes," you'll never detect changes there.

---

## Step 2: Scrape Them Every Day

### Fetch Schedule

Different tiers get different fetch frequencies. Tier 1 sources are time-sensitive (a major platform announcement has a 24-hour relevance window for strategic response). Tier 3 sources can wait.

| Feed Tier | Fetch Frequency | Rationale                              |
| --------- | --------------- | -------------------------------------- |
| Tier 1    | Every 4 hours   | High authority, time-sensitive signals |
| Tier 2    | Every 8 hours   | Trade coverage, less time-sensitive    |
| Tier 3    | Every 24 hours  | Signal feeds, volume over speed        |

At 300–600 feeds, this means roughly 1,000–2,500 fetch operations per day. Each is a lightweight HTTP GET of an RSS/Atom XML file. Well within a single Mac Mini M4's capacity.

### Full Article Extraction

RSS feeds provide two types of content:

**Full-text feeds** include the entire article in the RSS entry. This is ideal — no additional fetching needed. Many industry blogs and smaller publications do this.

**Excerpt feeds** include only a summary (typically 1–3 sentences) with a link to the full article. Most major publications do this. For knowledge graph purposes, the excerpt is insufficient — you need the full article text to extract specific data points, quotes, methodology details, and temporal markers that become Evidence.

**For excerpt feeds, the pipeline must fetch and extract the full article:**

1. Follow the article URL from the RSS entry
2. Extract the article content using a Readability-style content extractor (Mozilla's Readability algorithm, or a service like Diffbot/Jina Reader). This strips navigation, ads, sidebars, and returns clean article text.
3. Respect `robots.txt` and rate limits — never hammer a source. Space requests from the same domain by at least 2 seconds.
4. If extraction fails (paywall, JavaScript-rendered SPA, anti-bot), fall back to the RSS excerpt and mark the article as `extraction: "partial"`.
5. Cache the extracted text. Never re-fetch the same URL.

**Paywall handling:** Some Tier 1 sources are paywalled (The Information, Bloomberg). Options: (a) if Tyler has a subscription, use authenticated session cookies for extraction, (b) accept the RSS excerpt as partial content and weight it lower in triage, (c) for critical sources, consider a paid API if available.

### Deduplication

Commerce and tech news is heavily syndicated. The same press release appears across 10 outlets. The same analyst finding gets covered by 5 trade publications. Without deduplication, the triage pipeline wastes compute classifying redundant content.

**Level 1 — URL dedup:** Exact URL matches, plus normalization (strip UTM parameters, www prefix, trailing slashes). Catches 60–70% of duplicates.

**Level 2 — Title similarity:** Fuzzy match on article titles. Titles like "Amazon Announces New Retail Media API" and "Amazon Launches Retail Media API for Advertisers" are clearly the same story. Threshold: >0.85 Jaccard similarity on title tokens → probable duplicate.

**Level 3 — Content similarity (post-summarization):** After Stage 1 processing (Step 3), compute cosine similarity between the new article's embedding and all articles ingested in the last 7 days. Above 0.92 similarity → mark as duplicate. The duplicate still gets recorded (to track which sources cover a topic — useful for signal-to-noise scoring), but it skips the triage pipeline.

**Keep the first version, reference the duplicates.** The first article ingested on a topic becomes the primary. Subsequent duplicates link to it:

```
(:Article {title: "Amazon Launches Retail Media API",
           source: "AdExchanger", primary: true})
  <-[:DUPLICATE_OF]-(:Article {title: "Amazon Announces New API",
                                source: "Retail Dive", primary: false})
  <-[:DUPLICATE_OF]-(:Article {title: "Amazon's New Retail Media API",
                                source: "PR Newswire", primary: false})
```

This preserves the intelligence that "3 sources covered this topic" without processing the same content 3 times.

---

## Step 3: How to Save the Content

### The Two-Tier Storage Decision

This is a critical architectural choice. Full article text is large (2,000–10,000 words per article, 200–500 articles/day = 1–5 million words/day). Neo4j is expensive per GB and optimized for graph operations, not bulk text storage. Putting full article text in Neo4j would be like storing video files in a SQL database — technically possible, architecturally wrong.

**The answer: two-tier storage.**

```
┌──────────────────────────────────────────────────────┐
│  AWAKE DATABASE (PostgreSQL)                          │
│  Cheap bulk storage — $5–20/month for years of data  │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ articles                                     │     │
│  │  id: UUID (primary key)                      │     │
│  │  url: TEXT                                    │     │
│  │  title: TEXT                                  │     │
│  │  full_text: TEXT (the complete article)       │     │
│  │  raw_html: TEXT (original HTML, compressed)   │     │
│  │  rss_excerpt: TEXT (what the RSS provided)    │     │
│  │  author: TEXT                                 │     │
│  │  published_date: TIMESTAMP                    │     │
│  │  fetched_date: TIMESTAMP                      │     │
│  │  source_feed_id: UUID (FK → feeds)            │     │
│  │  extraction_status: partial | full | failed   │     │
│  │  word_count: INT                              │     │
│  │  processing_status: pending | processed |     │     │
│  │                      triaged | error          │     │
│  │  neo4j_synced: BOOLEAN                        │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ feeds                                        │     │
│  │  id: UUID                                     │     │
│  │  url: TEXT (RSS feed URL)                     │     │
│  │  name: TEXT                                   │     │
│  │  tier: 1–3                                    │     │
│  │  primary_domain: TEXT (master domain slug)    │     │
│  │  secondary_domains: TEXT[] (optional)         │     │
│  │  fetch_frequency_hours: INT                   │     │
│  │  is_active: BOOLEAN                           │     │
│  │  is_full_text: BOOLEAN                        │     │
│  │  last_fetched: TIMESTAMP                      │     │
│  │  consecutive_failures: INT                    │     │
│  │  signal_score: FLOAT (computed monthly)       │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ article_processing                           │     │
│  │  article_id: UUID (FK → articles)             │     │
│  │  summary: TEXT (AI-generated, 150–300 words)  │     │
│  │  concepts: TEXT[] (extracted topic/entities)   │     │
│  │  named_entities: TEXT[]                        │     │
│  │  data_points: TEXT[] (specific claims/stats)  │     │
│  │  temporal_markers: TEXT[]                      │     │
│  │  article_type: ENUM                           │     │
│  │  embedding: VECTOR(1536)                      │     │
│  │  processing_model: TEXT                        │     │
│  │  processing_date: TIMESTAMP                   │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │ triage_results                               │     │
│  │  article_id: UUID (FK → articles)             │     │
│  │  master_domain: TEXT                          │     │
│  │  triage_result: ENUM                          │     │
│  │  triage_confidence: FLOAT                     │     │
│  │  nearest_node_ids: UUID[] (Neo4j node IDs)    │     │
│  │  nearest_node_scores: FLOAT[]                 │     │
│  │  gap_classification: TEXT (if applicable)     │     │
│  │  gap_reasoning: TEXT (if applicable)          │     │
│  │  triage_date: TIMESTAMP                       │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  NEO4J (AuraDB)                                       │
│  Expensive graph-optimized storage                    │
│  Only lightweight nodes + relationships               │
│                                                       │
│  (:Article {                                          │
│      awake_id: UUID  ← links back to full text        │
│      title: STRING                                    │
│      source_name: STRING                              │
│      source_tier: INT                                 │
│      published_date: DATE                             │
│      summary: STRING (150–300 words)                  │
│      concepts: STRING[]                               │
│      data_points: STRING[]                            │
│      article_type: STRING                             │
│      master_domains: STRING[]                         │
│      triage_result: STRING                            │
│      triage_confidence: FLOAT                         │
│      embedding: VECTOR                                │
│  })                                                   │
│                                                       │
│  Plus relationships to KnowledgeNodes, ResearchPrompts│
└──────────────────────────────────────────────────────┘
```

**Why this split matters:**

- Full article text (the bulk of data) lives in PostgreSQL where storage costs pennies per GB. A year of articles at 500/day × 5KB average = ~900MB. Trivial.
- Neo4j gets a lightweight `:Article` node (~500 bytes of properties + embedding vector) optimized for the operations that actually need a graph: vector similarity search, relationship traversal to KnowledgeNodes, gap detection queries.
- When the synthesis pipeline needs full text (to extract detailed Evidence from a high-signal article), it reads from PostgreSQL by `awake_id`. This happens infrequently — maybe 20–50 articles/day.

**What goes in the summary vs. full text:**

The AI-generated summary (150–300 words) is what lives in Neo4j and what the triage pipeline uses for daily matching. It's optimized for:

- Capturing the core claims and conclusions
- Including specific data points and statistics
- Noting the source's methodology or basis
- Flagging temporal context (what period this covers)

The full text stays in PostgreSQL for when you actually need it: evidence extraction, deep synthesis, fact-checking, or when Tyler wants to read the original source.

**Never store only the summary.** You will always wish you had the full text later — for evidence extraction, for re-processing with improved synthesis prompts, for answering "where did this number come from?" The storage cost is negligible. Keep everything.

---

## Step 4: Inject Into the Knowledge Graph

### The 5-Stage Processing Pipeline

Every new article goes through a 5-stage pipeline. Stages 1–3 are cheap and run on everything. Stages 4–5 only run on articles that might be interesting.

**Stage 1 — Summarization & Structured Extraction**

Model: Gemini 2.0 Flash ($0.01–0.02/article)

```
Input:  Full article text (from PostgreSQL)

Prompt: "Analyze this article and produce structured output:
         1. Summary (150–300 words, focus on claims and data)
         2. Concepts (5–15 topic tags at the level of 'retail media
            measurement', 'Amazon DSP', 'clean room technology')
         3. Named entities (companies, people, platforms, products)
         4. Data points (specific statistics, percentages, dollar
            amounts — extract verbatim)
         5. Temporal markers (what time period does this cover?)
         6. Article type (industry_report | product_announcement |
            opinion_analysis | research_study | news_coverage |
            press_release | executive_commentary)
         7. Claim count (how many distinct claims does this make?)"

Output: {
    summary: "Amazon announced updates to its retail media API...",
    concepts: ["retail media", "Amazon DSP", "API integration",
               "programmatic advertising", "self-service tools"],
    named_entities: ["Amazon", "The Trade Desk", "Publicis"],
    data_points: ["42% YoY growth in retail media spend",
                  "$62B projected market by 2027",
                  "API response time reduced from 2s to 200ms"],
    temporal_markers: ["Q4 2025 results", "2027 projection",
                       "launched January 2026"],
    article_type: "product_announcement",
    claim_count: 4
}
```

The `concepts` list is the critical output — it's what gets matched against the knowledge graph in Stage 4. `data_points` are what become Evidence properties if the article is high-signal. `article_type` helps weight the article's evidentiary value (research studies > press releases).

Write the structured output to the `article_processing` table in PostgreSQL.

**Cost:** 200–500 articles/day × $0.015 = $3–8/day.

**Stage 2 — Embedding Generation**

Generate a vector embedding of the summary using the **same embedding model** used for KnowledgeNode embeddings in Neo4j. This is non-negotiable — you cannot compare vectors from different models.

If KnowledgeNodes use OpenAI `text-embedding-3-small` (1536 dimensions), articles must use the same. If you use a local model, same local model. Mismatched embeddings make similarity scores meaningless.

Write the embedding to the `article_processing` table.

**Cost:** $0.001/article for OpenAI embeddings. Negligible.

**Stage 3 — Domain Routing**

Classify each article into one or more MasterDomains. This doesn't need an LLM — it's a rules engine:

```
Routing rules (applied in order, first match wins for primary):

1. Feed mapping: Article from feed with primary_domain "ecom"
   → primary route: ecom

2. Concept matching: Compare article concepts against Domain
   node descriptions via embedding similarity
   → route to any MasterDomain where best Domain match > 0.65

3. Entity matching: If article mentions "Amazon Ads" or
   "Walmart Connect" → include ecom
   If article mentions "AWS Marketplace" or "Azure" → include hyperscaler

4. Cross-domain detection: Articles matching 2+ MasterDomains
   get routed to all of them (these are the high-value
   cross-domain signals)

5. No match: Articles matching no MasterDomain at >0.65
   → route to "_unclassified"
   (potential signal for missing domain — see Step 5)
```

Write routing results to the `triage_results` table. An article can have multiple rows — one per MasterDomain it's routed to.

**Cost:** Zero incremental — this is logic + cached embeddings, no API calls.

**Stage 4 — Graph Triage**

This is where articles meet the knowledge graph. For each article × MasterDomain pair, compare the article's embedding against existing KnowledgeNode embeddings in that domain:

```cypher
// Find top 5 most similar KnowledgeNodes in the target domain
CALL db.index.vector.queryNodes('knowledge_embedding', 5, $articleVector)
YIELD node AS k, score
WHERE k.master_domain = $targetDomain OR $targetDomain IN labels(k)
RETURN k.title, k.definition, score
ORDER BY score DESC
```

**Classification thresholds:**

```
Top match score > 0.85 → EVIDENCE_UPDATE
  This article covers a topic we already understand well.
  It may contain fresh data, new evidence, or confirmation.

Top match score 0.60–0.85 → PARTIAL_MATCH
  Related to existing knowledge but potentially new angle,
  sub-topic, or adjacent concept. Needs LLM classification.

Top match score 0.40–0.60 → POTENTIAL_GAP
  Discusses something the graph doesn't clearly cover.
  Needs LLM classification.

Top match score < 0.40 → NOISE_OR_BLIND_SPOT
  Either off-topic noise, or something so new that nothing
  in the graph relates to it. Single articles  likely noise.
  Clusters of these → blind spot (see Step 5).
```

**Actions by classification:**

**EVIDENCE_UPDATE (expected: ~70% of daily articles):**

```
Create (:Article) node in Neo4j with summary + metadata
Create relationship: (:Article)-[:EVIDENCES {
    strength: based on article_type and source_tier,
    relevance: similarity score,
    attached_date: today
}]->(:KnowledgeNode)

Update the KnowledgeNode's freshness_date to today
```

The article is now linked to the knowledge it supports. When the retrieval pipeline serializes that KnowledgeNode for Claude, the most recent `:EVIDENCES` articles can be included as "recent developments" in the context.

**PARTIAL_MATCH and POTENTIAL_GAP (expected: ~15–20% of daily articles):**
These get passed to Stage 5 for LLM classification.

**NOISE_OR_BLIND_SPOT (expected: ~10–15% of daily articles):**
Mark as noise in PostgreSQL. Don't create a Neo4j node for individual noise articles. But track them for cluster detection (Step 5).

**Cost:** Vector search is a Neo4j operation. No LLM cost for Stage 4. This stage processes hundreds of articles/day at essentially zero incremental cost.

**Stage 5 — LLM Gap Classification**

Only PARTIAL_MATCH and POTENTIAL_GAP articles reach this stage — roughly 30–100 articles/day out of 200–500 total.

Model: Claude Sonnet 4.5 ($3/$15 per million tokens)

```
Input: {
    article_summary: "...",
    article_concepts: [...],
    article_data_points: [...],
    nearest_knowledge_nodes: [
        {title: "...", definition: "...", similarity: 0.72},
        {title: "...", definition: "...", similarity: 0.68},
        {title: "...", definition: "...", similarity: 0.55}
    ],
    domain_coverage_topics: [
        {title: "...", status: "covered"},
        {title: "...", status: "gap"},
        ...
    ]
}

Prompt: "You are a knowledge graph curator. An article has been
flagged as potentially containing knowledge that our graph doesn't
cover. Analyze the article against the nearest existing nodes and
the domain's coverage map.

Classify as one of:
- new_subtopic: Genuinely new area the graph should cover
- new_angle: New perspective on something already covered
- new_evidence: Fresh data for an existing node
- noise: Not relevant or already fully covered
- potential_new_domain: Doesn't fit any existing MasterDomain

For new_subtopic, suggest:
- A CoverageTopic title
- Which Domain it belongs to
- Recommended depth (awareness/working/deep)
- A research prompt to investigate it further

For new_angle, explain what's new about it and whether it
warrants expanding an existing KnowledgeNode.

Be conservative — only classify as new_subtopic if it's genuinely
something the nearest nodes don't cover. Most articles are
new_evidence or new_angle."

Output: {
    classification: "new_subtopic",
    confidence: 0.82,
    reasoning: "This article discusses in-store retail media
               screens, which is not covered by any existing node.
               The nearest node covers digital retail media only.
               In-store screens represent a distinct channel with
               different measurement, targeting, and economics.",
    suggested_coverage_topic: "In-Store Retail Media Networks",
    suggested_domain: "Retail Media Networks",
    suggested_depth: "working",
    suggested_research_prompt: "Research the current state of
               in-store retail media networks including digital
               screens, smart carts, and cooler doors. Cover:
               major retailers deploying (Walmart, Kroger, Walgreens),
               measurement approaches, CPM benchmarks vs digital,
               and advertiser adoption rates."
}
```

**Actions by classification:**

`new_subtopic` (confidence > 0.7):

```
→ Create (:CoverageTopic {
    title: suggested_coverage_topic,
    status: "gap",
    target_depth: suggested_depth,
    priority: "important",
    triggered_by: "awake_article"
  })

→ Create (:ResearchPrompt {
    title: "Deep research: " + suggested_coverage_topic,
    prompt_text: suggested_research_prompt,
    master_domain: domain_slug,
    source: "gap_detection",
    priority: computed from source_tier + confidence,
    status: "queued"
  })

→ Create (:Article) node in Neo4j
→ (:Article)-[:TRIGGERED]->(:ResearchPrompt)
→ (:Article)-[:TRIGGERED]->(:CoverageTopic)
```

`new_angle`:

```
→ Create (:Article) node in Neo4j
→ (:Article)-[:RELATES_TO {
    angle: "new_perspective",
    relevance: similarity_score
  }]->(:KnowledgeNode)
→ Optionally queue a ResearchPrompt to expand the node
```

`new_evidence`:

```
→ Create (:Article) node in Neo4j
→ (:Article)-[:EVIDENCES]->(:KnowledgeNode)
→ Update freshness_date
```

`noise`:

```
→ Mark as noise in PostgreSQL
→ No Neo4j node created
```

`potential_new_domain`:

```
→ Flag for Tyler's weekly review
→ Store the reasoning in PostgreSQL
→ Don't auto-create anything — new MasterDomains need human judgment
```

**Cost:** 30–100 articles/day × ~800 tokens input × $3/million = $0.07–0.24/day. Negligible.

### Total Daily Pipeline Cost

| Stage                                 | Volume  | Unit Cost | Daily Cost         |
| ------------------------------------- | ------- | --------- | ------------------ |
| Stage 1: Summarization (Gemini Flash) | 200–500 | $0.015    | $3–8               |
| Stage 2: Embedding (OpenAI)           | 200–500 | $0.001    | $0.20–0.50         |
| Stage 3: Domain routing               | 200–500 | $0.00     | $0.00              |
| Stage 4: Graph triage (Neo4j vector)  | 200–500 | $0.00     | $0.00              |
| Stage 5: LLM classification (Claude)  | 30–100  | $0.003    | $0.09–0.30         |
| **Total**                             |         |           | **$3.30–8.80/day** |
| **Monthly**                           |         |           | **$100–265/month** |

The Awake pipeline costs $100–265/month to process 200–500 articles/day across all domains. The vast majority of cost is Stage 1 summarization. Everything else is nearly free.

---

## Step 5: Trigger Deep Research When We Find Blind Spots

The Awake pipeline generates five distinct signals that tell the knowledge graph "you don't know about something you should."

### Trigger 1 — New Subtopic Discovery

When Stage 5 classifies an article as `new_subtopic` with confidence > 0.7, a ResearchPrompt is created automatically. This is the most common trigger — expected 2–5 per day across all domains.

The ResearchPrompt enters the priority queue and gets executed by the deep research pipeline (Perplexity API). The resulting KnowledgeNodes enter the graph, and future articles on that topic will match at Stage 4 as EVIDENCE_UPDATE instead of hitting Stage 5 again.

**The feedback loop:** Article reveals gap → ResearchPrompt queued → Deep research executes → KnowledgeNode created → Future articles about that topic attach as Evidence instead of triggering gaps → System gets smarter.

### Trigger 2 — Emerging Cluster Detection

Individual noise articles are noise. Three noise articles about the same topic in a week are a signal.

Run a weekly clustering job:

```sql
-- Find articles from last 7 days classified as noise or potential_gap
-- that were never matched to a KnowledgeNode
SELECT a.id, ap.embedding, ap.concepts
FROM articles a
JOIN article_processing ap ON a.id = ap.article_id
JOIN triage_results tr ON a.id = tr.article_id
WHERE tr.triage_result IN ('noise', 'gap_signal')
AND a.published_date > NOW() - INTERVAL '7 days'
```

Cluster these by embedding similarity (>0.80 mutual similarity). Clusters of 3+ articles represent emerging topics the graph doesn't cover:

```
Cluster detected: 4 articles about "agentic checkout"
                  from 3 different sources

Sources: TechCrunch, Marketplace Pulse, AdExchanger
Shared concepts: ["agentic commerce", "autonomous checkout",
                  "AI purchasing agents", "cart abandonment"]

Action: Create high-priority CoverageTopic + ResearchPrompt
        Priority = critical (multiple independent signals)
```

**Expected volume:** 1–3 emerging clusters per week. These are the highest-confidence gap signals because they're independently corroborated by multiple sources.

### Trigger 3 — Stale Node + Fresh Articles Mismatch

When new articles consistently attach as Evidence to a KnowledgeNode whose freshness score has decayed below threshold, the node's content may be outdated even though its topic is actively covered:

```cypher
MATCH (a:Article)-[:EVIDENCES]->(k:KnowledgeNode)
WHERE a.published_date > date() - duration('P14D')
AND k.freshness_score < 0.5
WITH k, count(a) AS recent_articles
WHERE recent_articles >= 3
AND NOT EXISTS {
    MATCH (k)<-[:TARGETS]-(:ResearchPrompt {status: 'queued'})
}
RETURN k.title, k.freshness_score, recent_articles
```

Translation: "This node is stale, but 3+ recent articles are about this topic — the world has moved on and our knowledge hasn't caught up."

Action: Auto-generate a ResearchPrompt that includes the key data points from the recent articles:

```
ResearchPrompt: "Update knowledge on [topic]. The existing node
was last refreshed [date] with confidence [score]. Recent articles
from the past 14 days report: [aggregated data_points from
attached articles]. Research the current state and update."
```

**Expected volume:** 5–15 per day across all domains at maturity.

### Trigger 4 — Domain Boundary Signals

When articles routed to a MasterDomain consistently fail to match any Domain within it (similarity to all Domain descriptions < 0.65), the Domain taxonomy may need expansion:

```sql
-- Articles routed to ecom but not matching any ecom Domain
SELECT ap.concepts, COUNT(*) as article_count
FROM triage_results tr
JOIN article_processing ap ON tr.article_id = ap.article_id
WHERE tr.master_domain = 'ecom'
AND tr.nearest_node_scores[1] < 0.5  -- weak match to best node
AND tr.triage_date > NOW() - INTERVAL '30 days'
GROUP BY ap.concepts
HAVING COUNT(*) >= 5
ORDER BY article_count DESC
```

This surfaces clusters like: "12 articles in the last month about 'retail media in-store networks' routed to eCom, but no Domain or KnowledgeNode covers in-store specifically."

**Action:** Surface in Tyler's weekly review with a recommendation:

- "Consider adding Domain 'In-Store Retail Media' under eCom MasterDomain"
- Or: "Consider expanding the 'Retail Media Networks' Domain scope to include in-store"
- With the 12 article titles/summaries as evidence

**Expected volume:** 1–3 signals per month. These are structural evolution signals, not daily operations.

### Trigger 5 — Unclassified Domain Signal

When articles consistently route to `_unclassified` (no MasterDomain match) with a coherent theme, a new MasterDomain may be warranted:

```sql
SELECT ap.concepts, COUNT(*) as article_count
FROM triage_results tr
JOIN article_processing ap ON tr.article_id = ap.article_id
WHERE tr.master_domain = '_unclassified'
AND tr.triage_date > NOW() - INTERVAL '30 days'
GROUP BY ap.concepts
HAVING COUNT(*) >= 10
```

If 10+ unclassified articles in 30 days share common concepts ("sustainability," "ESG reporting," "carbon footprint in supply chain"), that's a signal that Tyler's strategic landscape has a domain he hasn't formalized yet.

**Action:** Flag for Tyler with the concept clusters, article examples, and a suggested MasterDomain name. Never auto-create MasterDomains — that's a strategic decision.

**Expected volume:** Rare — maybe 1–2 per quarter. But when it fires, it's high value.

### Tyler's Weekly Review Dashboard

All five triggers feed a single weekly review that Tyler spends 15–30 minutes on:

```
╔══════════════════════════════════════════════════════╗
║  WEEKLY INTELLIGENCE REVIEW                          ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  NEW GAPS DISCOVERED THIS WEEK: 14                   ║
║  ├── 8 auto-queued for deep research (high conf)     ║
║  ├── 4 awaiting your review (medium conf)
║  └── 2 emerging clusters detected                    ║
║                                                      ║
║  STALE NODES WITH FRESH SIGNALS: 11                  ║
║  ├── 7 auto-queued for refresh                       ║
║  └── 4 with 5+ new articles (may need rewrite)       ║
║                                                      ║
║  DOMAIN EVOLUTION SIGNALS: 2                         ║
║  ├── "In-store retail media" (12 articles, no Domain)║
║  └── "Creator commerce" (8 articles, cross-domain)   ║
║                                                      ║
║  POTENTIAL NEW MASTERDOMAIN: 1                       ║
║  └── "Sustainability/ESG" (15 unclassified articles) ║
║                                                      ║
║  FEED HEALTH: 3 feeds failing, 2 below signal floor  ║
║                                                      ║
║  ARTICLES PROCESSED: 2,847 (408/day avg)             ║
║  ├── Evidence attached: 2,134 (75%)                  ║
║  ├── New angles: 312 (11%)                           ║
║  ├── Gaps triggered: 38 (1.3%)                       ║
║  ├── Noise: 363 (12.7%)                              ║
║  └── Avg triage latency: 4.2 seconds                 ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

High-confidence gap signals (Trigger 1 with confidence > 0.8, Trigger 2 clusters) get auto-queued for deep research without waiting for review. Medium-confidence signals wait for Tyler's thumbs up/down. Structural signals (Triggers 4–5) always wait for human judgment.

---

## Closing the Loop: The Full Cycle

Here's what a typical day looks like:

```
6:00 AM — Overnight fetch completes
  Mac Mini fetched all feeds on schedule
  312 new articles acquired, full text extracted for 287

6:15 AM — Processing pipeline runs
  Stage 1: 312 articles summarized + extracted (Gemini Flash)
  Stage 2: 312 embeddings generated
  Stage 3: 312 articles routed to domains
           ├── 189 → ecom
           ├── 67 → ai-strategy
           ├── 43 → hyperscaler
           ├── 31 → social
           ├── 22 → cross-domain (routed to 2+)
           └── 8 → _unclassified

6:30 AM — Graph triage runs
  Stage 4: 312 articles matched against Neo4j
           ├── 218 → EVIDENCE_UPDATE (attached to nodes)
           ├── 52 → PARTIAL_MATCH (sent to Stage 5)
           ├── 27 → POTENTIAL_GAP (sent to Stage 5)
           └── 15 → NOISE

6:45 AM — LLM classification completes
  Stage 5: 79 articles classified by Claude Sonnet
           ├── 34 → new_evidence (attached to nodes)
           ├── 22 → new_angle (related to nodes)
           ├── 14 → new_subtopic (gaps created!)
           ├── 7 → noise
           └── 2 → potential_new_domain (flagged for Tyler)

7:00 AM — Research queue updated
  14 new ResearchPrompts queued
  8 auto-approved (high confidence, Tier 1 sources)
  6 pending Tyler's review

7:15 AM — Deep research pipeline picks up queue
  8 auto-approved prompts → Perplexity API
  3 minutes each, parallelized
  Results ready by 7:30 AM

7:30 AM — Synthesis pipeline runs
  8 research outputs → Claude synthesis
  12 new KnowledgeNodes created
  Attached to existing domains
  Cross-domain relationships identified

8:00 AM — Tyler's morning briefing includes:
  "14 new knowledge gaps detected overnight.
   8 already researched and absorbed.
   6 need your review."

  Plus the daily Awake briefing (AI-generated summary of
  most important articles across all domains)
```

**Cost of this full cycle:** ~$5 in API spend. The knowledge graph got 12 new KnowledgeNodes, 252 evidence attachments, 22 new angles on existing knowledge, and identified 14 topics it didn't know about yesterday.

---

## Technical Architecture Summary

### Components

```
┌─────────────────────────────────────────────┐
│            MAC MINI M4                       │
│                                              │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │ RSS Fetcher   │  │ Processing Pipeline │  │
│  │ (cron-based)  │  │ Stages 1–5          │  │
│  │ Tier 1: q4h   │  │                     │  │
│  │ Tier 2: q8h   │  │ Gemini Flash (S1)   │  │
│  │ Tier 3: q24h  │  │ OpenAI Embed (S2)   │  │
│  └──────┬───────┘  │ Rules engine (S3)    │  │
│         │           │ Neo4j vector (S4)    │  │
│         ▼           │ Claude Sonnet (S5)   │  │
│  ┌──────────────┐  └─────────┬───────────┘  │
│  │ PostgreSQL    │            │               │
│  │ (Awake DB)    │◄───────────┘               │
│  │ Full text     │                            │
│  │ Processing    │──────────┐                 │
│  │ Triage results│          │                 │
│  └──────────────┘          │                 │
│                             ▼                 │
│  ┌──────────────────────────────────────┐    │
│  │ Research Pipeline                     │    │
│  │ (triggered by ResearchPrompts)        │    │
│  │ Perplexity API → Claude Synthesis     │    │
│  └──────────────────────────────────────┘    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  NEO4J AURADB (Cloud)                         │
│                                               │
│  (:MasterDomain)──[:CONTAINS]──(:Domain)      │
│  (:KnowledgeNode)                             │
│  (:Evidence) (:Context) (:Concept)            │
│  (:Article) ── lightweight, linked back       │
│  (:CoverageTopic) (:ResearchPrompt)           │
│  (:SynthesisPrompt) (:NodeType)               │
│  Schema Registry                              │
└───────────────────────────────────────────────┘
```

### Data Flow

```
RSS Feeds ──► PostgreSQL (full text) ──► Gemini (summarize)
         ──► OpenAI (embed) ──► Neo4j (lightweight node)
         ──► Neo4j (vector triage) ──► Claude (gap classify)
         ──► Neo4j (attach evidence OR create gap)
         ──► Perplexity (deep research on gaps)
         ──► Claude (synthesize to KnowledgeNodes)
         ──► Neo4j (new knowledge)
         ──► Better triage tomorrow (the loop)
```

### API Dependencies

| Service           | Purpose                | Cost/Day       | Failure Impact                  |
| ----------------- | ---------------------- | -------------- | ------------------------------- |
| Gemini Flash      | Article summarization  | $3–8           | Pipeline pauses, articles queue |
| OpenAI Embeddings | Vector generation      | $0.20–0.50     | Can't triage, articles queue    |
| Neo4j AuraDB      | Graph triage + storage | (subscription) | Pipeline pauses completely      |
| Claude Sonnet     | Gap classification     | $0.10–0.30     | Partial — Stage 4 still works   |
| Perplexity        | Deep research on gaps  | $3–5           | Gaps queue but don't execute    |

The pipeline degrades gracefully. If Claude is down, Stages 1–4 still run — you just don't get gap classification until it's back. If Gemini is down, articles queue in PostgreSQL until processing resumes. Only Neo4j being down stops everything.

---

## Building Sequence

### Week 1: Core Pipeline

- Set up PostgreSQL schema (articles, feeds, article_processing, triage_results)
- Build RSS fetcher (schedule-based, respects tiers, handles failures)
- Build Stage 1: Gemini Flash summarization + extraction
- Build Stage 2: Embedding generation
- Add 30 feeds for eCom domain (10 Tier 1, 10 Tier 2, 10 Tier 3)
- Run pipeline end-to-end, review output quality

### Week 2: Graph Integration

- Build Stage 3: Domain routing rules engine
- Build Stage 4: Neo4j vector triage (requires KnowledgeNodes to exist — this happens in parallel with the knowledge graph bootstrap)
- Build `:Article` node creation + `:EVIDENCES` relationship logic
- Build deduplication (URL + title + embedding levels)
- Connect to production Neo4j AuraDB

### Week 3: Intelligence Layer

- Build Stage 5: Claude Sonnet gap classification
- Build ResearchPrompt and CoverageTopic creation from gap signals
- Build Trigger 2: Emerging cluster detection (weekly job)
- Build Trigger 3: Stale node + fresh articles mismatch detection
- Wire Stage 5 outputs to the deep research pipeline queue

### Week 4: Monitoring & Feedback

- Build signal-to-noise scoring for feeds
- Build the weekly review dashboard
- Build Trigger 4: Domain boundary signals
- Build Trigger 5: Unclassified domain signals
- Tune classification thresholds based on 2 weeks of real data
- Add remaining feeds (expand to full 30–60 per domain)

### Ongoing

- Monthly feed curation (remove dead feeds, add new sources)
- Monthly threshold tuning (similarity cutoffs, confidence thresholds)
- Per-domain feed expansion as new MasterDomains are added
- Signal-to-noise scoring drives feed tier promotions/demotions
