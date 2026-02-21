// =============================================================================
// @neo/server — Research prompt template engine
// =============================================================================
// Loads and caches research prompt templates from the filesystem.
// Templates are assembled by combining a standard wrapper with topic-specific
// content and optional domain context.
// =============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateEngine {
  /** Assembles a full research prompt from topic text, domain, and source. */
  assembleFullPrompt(
    promptText: string,
    masterDomain: string,
    source: string,
  ): string;
  /** Re-reads all templates from disk (for hot reloading). */
  reloadTemplates(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTemplateEngine(templateDir: string): TemplateEngine {
  const cache = new Map<string, string>();

  function loadTemplates(): void {
    cache.clear();

    let files: string[];
    try {
      files = readdirSync(templateDir).filter((f) => f.endsWith(".txt"));
    } catch {
      files = [];
    }

    for (const file of files) {
      const content = readFileSync(join(templateDir, file), "utf-8");
      // Store by filename without extension: "standard_v1", "domain_context_ecom"
      const key = file.replace(/\.txt$/, "");
      cache.set(key, content);
    }
  }

  // Load on creation
  loadTemplates();

  return {
    assembleFullPrompt(
      promptText: string,
      masterDomain: string,
      _source: string,
    ): string {
      // Get the standard research template
      const standardTemplate = cache.get("standard_v1") ?? "{TOPIC_QUERY}";

      // Substitute the topic query
      let fullPrompt = standardTemplate.replace("{TOPIC_QUERY}", promptText);

      // Append domain context if available
      const domainContextKey = `domain_context_${masterDomain}`;
      const domainContext = cache.get(domainContextKey);
      if (domainContext) {
        fullPrompt += "\n\n---\n\n" + domainContext;
      }

      return fullPrompt;
    },

    reloadTemplates(): void {
      loadTemplates();
    },
  };
}
