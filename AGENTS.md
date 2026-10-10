<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Logging Standards and Guidelines

All code in this project must follow structured application logging conventions:

1. **Use the Shared Logger Utility**:
   - Always import and use the shared logger from `@/lib/logger` (`src/lib/logger.ts`).
   - Do not use raw `console.log` or `console.error` calls directly in API routes or core services.

2. **Basic Lifecycle Logging (Always Active)**:
   - Always emit basic lifecycle logs (`logger.info`, `logger.warn`, `logger.error`) for:
     - Request entry (method, path, client IP, user identity if authenticated, requestId).
     - Authentication outcomes (authorized / unauthorized).
     - Rate limit checks and decisions (allowed / blocked, remaining limit).
     - High-level decision points (e.g., query rewriting, system prompt prepared).
     - Streaming lifecycle events (start, completion, errors).
     - Final response status codes and errors with stack traces.

3. **Advanced Logging Gate (`advanced_logging=true`)**:
   - Detailed, verbose, or sensitive context MUST be logged behind the advanced logging gate via `logger.advanced(level, message, context, requestId)`.
   - Advanced logging includes:
     - Full request bodies and headers of interest.
     - RAG retrieval details (constructed query, retrieved chunks, similarity scores, sources, section names).
     - Full system prompt text or model configuration details.
     - Granular step timing breakdowns.
   - Advanced logging is gated at runtime by `process.env.advanced_logging === "true"`. When unset or not `"true"`, advanced logs are omitted.

4. **Never Log Secrets**:
   - Never log passwords, API keys, auth tokens, secrets, or raw environment variable credentials.
   - The logger in `src/lib/logger.ts` automatically redacts known sensitive keys and values matching sensitive environment variables, but developers must remain vigilant.

5. **Extending the Codebase**:
   - When adding new API routes, services, or decision branches, instrument them with structured logs using `logger` and propagate `requestId` across helper calls.
