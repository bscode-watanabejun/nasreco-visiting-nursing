import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { Client } from "pg";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Trust proxy in production (for HTTPS cookies behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Validate required environment variables
if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET environment variable is required for security");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

// Create PostgreSQL session store
const PgSession = ConnectPgSimple(session);

// Session configuration with PostgreSQL store
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session', // Session table name
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax'
  }
}));

// Modern CSRF protection middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF check for safe methods and API preflight
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // Only apply CSRF protection to API endpoints
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const origin = req.get('Origin') || req.get('Referer');
  const host = req.get('Host');

  if (!origin) {
    return res.status(403).json({ error: 'CSRF: Missing Origin header' });
  }

  if (!host) {
    return res.status(400).json({ error: 'Missing Host header' });
  }
  
  // Parse origin/referer to get hostname
  let originHost: string;
  try {
    const originUrl = new URL(origin);
    originHost = originUrl.host;
  } catch (e) {
    return res.status(403).json({ error: 'CSRF: Invalid Origin header' });
  }
  
  // Compare origin with host (accounting for port differences in development)
  if (originHost !== host) {
    // In development, allow localhost variations
    if (process.env.NODE_ENV === 'development') {
      const isLocalhost = (h: string) => h.startsWith('localhost:') || h.startsWith('127.0.0.1:');
      if (!(isLocalhost(originHost) && isLocalhost(host))) {
        return res.status(403).json({ error: 'CSRF: Origin mismatch' });
      }
    } else {
      return res.status(403).json({ error: 'CSRF: Origin mismatch' });
    }
  }

  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
