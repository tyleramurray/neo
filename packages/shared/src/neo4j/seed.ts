// =============================================================================
// @neo/shared — Idempotent Neo4j seed script
// =============================================================================
// Populates the knowledge graph with schema registry, eCom master domain,
// 16 eCom domains, default synthesis prompt, and vector index.
// All operations use MERGE for idempotency — safe to run multiple times.
// =============================================================================

import type { Driver } from "./driver.js";
import {
  NODE_TYPES,
  RELATIONSHIP_CATEGORIES,
  ECOM_MASTER_DOMAIN,
  ECOM_DOMAINS,
  DEFAULT_SYNTHESIS_PROMPT,
  VECTOR_INDEX_CONFIG,
} from "./seed-data.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeedResult {
  nodeTypes: number;
  relationshipCategories: number;
  masterDomains: number;
  domains: number;
  synthesisPrompts: number;
  vectorIndexes: number;
}

export interface SeedLogger {
  info: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Seed Logic
// ---------------------------------------------------------------------------

/**
 * Seed the Neo4j database with schema registry, eCom domain data, default
 * synthesis prompt, and vector index. All operations are idempotent via MERGE.
 *
 * @param driver - Neo4j driver instance
 * @param logger - Optional logger (defaults to console)
 * @returns Summary counts of seeded entities
 */
export async function seedDatabase(
  driver: Driver,
  logger: SeedLogger = console,
): Promise<SeedResult> {
  const result: SeedResult = {
    nodeTypes: 0,
    relationshipCategories: 0,
    masterDomains: 0,
    domains: 0,
    synthesisPrompts: 0,
    vectorIndexes: 0,
  };

  const session = driver.session();

  try {
    // -----------------------------------------------------------------------
    // 1. NodeType registry
    // -----------------------------------------------------------------------
    logger.info("Seeding NodeType registry...");

    await session.executeWrite(async (tx) => {
      for (const nt of NODE_TYPES) {
        await tx.run(
          `MERGE (n:NodeType {label: $label})
           SET n.tier = $tier,
               n.version = $version,
               n.required_properties = $required_properties,
               n.standard_properties = $standard_properties,
               n.extended_properties = $extended_properties,
               n.description = $description`,
          {
            label: nt.label,
            tier: nt.tier,
            version: nt.version,
            required_properties: nt.required_properties,
            standard_properties: nt.standard_properties,
            extended_properties: nt.extended_properties,
            description: nt.description,
          },
        );
        result.nodeTypes++;
      }
    });

    logger.info(`  Seeded ${result.nodeTypes} NodeType entries`);

    // -----------------------------------------------------------------------
    // 2. RelationshipCategory registry
    // -----------------------------------------------------------------------
    logger.info("Seeding RelationshipCategory registry...");

    await session.executeWrite(async (tx) => {
      for (const rc of RELATIONSHIP_CATEGORIES) {
        await tx.run(
          `MERGE (r:RelationshipCategory {category: $category})
           SET r.version = $version,
               r.valid_stances = $valid_stances,
               r.required_properties = $required_properties,
               r.description = $description,
               r.reasoning_hint = $reasoning_hint`,
          {
            category: rc.category,
            version: rc.version,
            valid_stances: [...rc.valid_stances],
            required_properties: [...rc.required_properties],
            description: rc.description,
            reasoning_hint: rc.reasoning_hint,
          },
        );
        result.relationshipCategories++;
      }
    });

    logger.info(
      `  Seeded ${result.relationshipCategories} RelationshipCategory entries`,
    );

    // -----------------------------------------------------------------------
    // 3. eCommerce MasterDomain
    // -----------------------------------------------------------------------
    logger.info("Seeding eCommerce MasterDomain...");

    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (m:MasterDomain {slug: $slug})
         SET m.title = $title,
             m.description = $description,
             m.status = $status,
             m.color = $color`,
        {
          slug: ECOM_MASTER_DOMAIN.slug,
          title: ECOM_MASTER_DOMAIN.title,
          description: ECOM_MASTER_DOMAIN.description,
          status: ECOM_MASTER_DOMAIN.status,
          color: ECOM_MASTER_DOMAIN.color,
        },
      );
      result.masterDomains++;
    });

    logger.info(`  Seeded ${result.masterDomains} MasterDomain`);

    // -----------------------------------------------------------------------
    // 4. eCommerce Domains + :HAS_DOMAIN relationships
    // -----------------------------------------------------------------------
    logger.info("Seeding eCommerce Domains...");

    await session.executeWrite(async (tx) => {
      for (const domain of ECOM_DOMAINS) {
        await tx.run(
          `MATCH (m:MasterDomain {slug: $masterSlug})
           MERGE (d:Domain {slug: $slug})
           SET d.title = $title,
               d.description = $description
           MERGE (m)-[:HAS_DOMAIN]->(d)`,
          {
            masterSlug: ECOM_MASTER_DOMAIN.slug,
            slug: domain.slug,
            title: domain.title,
            description: domain.description,
          },
        );
        result.domains++;
      }
    });

    logger.info(`  Seeded ${result.domains} Domains`);

    // -----------------------------------------------------------------------
    // 5. Default SynthesisPrompt
    // -----------------------------------------------------------------------
    logger.info("Seeding default SynthesisPrompt...");

    const effectiveDate = new Date().toISOString();

    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (s:SynthesisPrompt {version: $version, master_domain: $master_domain})
         SET s.effective_date = $effective_date,
             s.status = $status,
             s.target_schema_version = $target_schema_version,
             s.prompt_text = $prompt_text`,
        {
          version: DEFAULT_SYNTHESIS_PROMPT.version,
          master_domain: DEFAULT_SYNTHESIS_PROMPT.master_domain,
          effective_date: effectiveDate,
          status: DEFAULT_SYNTHESIS_PROMPT.status,
          target_schema_version: DEFAULT_SYNTHESIS_PROMPT.target_schema_version,
          prompt_text: DEFAULT_SYNTHESIS_PROMPT.prompt_text,
        },
      );
      result.synthesisPrompts++;
    });

    logger.info(`  Seeded ${result.synthesisPrompts} SynthesisPrompt`);

    // -----------------------------------------------------------------------
    // 6. Vector index
    // -----------------------------------------------------------------------
    logger.info("Creating vector index (if not exists)...");

    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE VECTOR INDEX ${VECTOR_INDEX_CONFIG.name} IF NOT EXISTS
         FOR (n:${VECTOR_INDEX_CONFIG.label}) ON (n.${VECTOR_INDEX_CONFIG.property})
         OPTIONS { indexConfig: {
           \`vector.dimensions\`: $dimensions,
           \`vector.similarity_function\`: $similarityFunction
         }}`,
        {
          dimensions: VECTOR_INDEX_CONFIG.dimensions,
          similarityFunction: VECTOR_INDEX_CONFIG.similarityFunction,
        },
      );
      result.vectorIndexes++;
    });

    logger.info(`  Vector index "${VECTOR_INDEX_CONFIG.name}" ensured`);

    // -----------------------------------------------------------------------
    // Done
    // -----------------------------------------------------------------------
    logger.info("Seed complete.");
    return result;
  } finally {
    await session.close();
  }
}
