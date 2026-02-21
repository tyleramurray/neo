// =============================================================================
// @neo/server — Cron scheduler for pipeline jobs
// =============================================================================
// Wraps node-cron to run pipeline operations on configurable schedules.
// Controlled via env vars: CRON_ENABLED (kill switch), plus per-job schedules.
// Returns a handle with stop() for graceful shutdown.
// =============================================================================

import cron from "node-cron";
import type { AppDependencies } from "./server.js";
import {
  prepareResearchQueue,
  runSynthesisBatch,
  runGapDetection,
  runDailyMonitoring,
} from "./tools/pipeline.js";

export interface SchedulerHandle {
  stop(): void;
}

export function startScheduler(deps: AppDependencies): SchedulerHandle {
  const { config, logger } = deps;
  const tasks: cron.ScheduledTask[] = [];

  if (!config.CRON_ENABLED) {
    logger.info("Cron scheduler disabled (CRON_ENABLED=false)");
    return { stop() {} };
  }

  // Helper to wrap each job with logging and error handling
  function scheduleJob(
    name: string,
    schedule: string,
    job: () => Promise<unknown>,
  ): void {
    const task = cron.schedule(schedule, async () => {
      const start = performance.now();
      logger.info(`Cron job starting: ${name}`);
      try {
        const result = await job();
        const durationMs = Math.round(performance.now() - start);
        logger.info(`Cron job completed: ${name}`, { durationMs, result });
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        logger.error(`Cron job failed: ${name}`, {
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    tasks.push(task);
  }

  scheduleJob("run_daily_monitoring", config.CRON_DAILY_MONITORING, () =>
    runDailyMonitoring(deps),
  );

  scheduleJob("run_gap_detection", config.CRON_GAP_DETECTION, () =>
    runGapDetection(deps),
  );

  scheduleJob("run_synthesis_batch", config.CRON_SYNTHESIS_BATCH, () =>
    runSynthesisBatch(deps),
  );

  scheduleJob("prepare_research_queue", config.CRON_PREPARE_QUEUE, () =>
    prepareResearchQueue(deps),
  );

  logger.info("Cron scheduler started", {
    schedules: {
      run_daily_monitoring: config.CRON_DAILY_MONITORING,
      run_gap_detection: config.CRON_GAP_DETECTION,
      run_synthesis_batch: config.CRON_SYNTHESIS_BATCH,
      prepare_research_queue: config.CRON_PREPARE_QUEUE,
    },
  });

  return {
    stop() {
      for (const t of tasks) t.stop();
      logger.info("Cron scheduler stopped");
    },
  };
}
