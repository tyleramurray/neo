import type { RequestHandler, Request, Response, NextFunction } from "express";

// Module augmentation — attach clientId to Express requests
declare global {
  namespace Express {
    interface Request {
      clientId?: string;
    }
  }
}

export function createAuthMiddleware(
  apiKeys: Record<string, string>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Missing Authorization header" });
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      res
        .status(401)
        .json({
          error: "Invalid Authorization format. Expected: Bearer <key>",
        });
      return;
    }

    const key = parts[1];
    const clientId = apiKeys[key];
    if (!clientId) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    req.clientId = clientId;
    next();
  };
}

interface RateLimiterState {
  timestamps: Map<string, number[]>;
  cleanupInterval: ReturnType<typeof setInterval>;
}

export function createRateLimiter(maxPerMinute: number): RequestHandler & {
  shutdown: () => void;
} {
  const windowMs = 60_000;
  const state: RateLimiterState = {
    timestamps: new Map(),
    cleanupInterval: setInterval(() => {
      const now = Date.now();
      for (const [clientId, times] of state.timestamps) {
        const valid = times.filter((t) => now - t < windowMs);
        if (valid.length === 0) {
          state.timestamps.delete(clientId);
        } else {
          state.timestamps.set(clientId, valid);
        }
      }
    }, 60_000),
  };

  const handler = ((req: Request, res: Response, next: NextFunction) => {
    const clientId = req.clientId;
    if (!clientId) {
      next();
      return;
    }

    const now = Date.now();
    const times = state.timestamps.get(clientId) ?? [];
    const validTimes = times.filter((t) => now - t < windowMs);

    if (validTimes.length >= maxPerMinute) {
      const oldestInWindow = validTimes[0]!;
      const retryAfterMs = oldestInWindow + windowMs - now;
      res.status(429).json({ error: "Rate limit exceeded", retryAfterMs });
      return;
    }

    validTimes.push(now);
    state.timestamps.set(clientId, validTimes);
    next();
  }) as RequestHandler & { shutdown: () => void };

  handler.shutdown = () => {
    clearInterval(state.cleanupInterval);
  };

  return handler;
}
