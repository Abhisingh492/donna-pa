import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const EMBEDDING_MODEL = "gemini-embedding-001";
const VECTOR_DIMENSIONS = 768;
const QUERY_MAX_LENGTH = 1000;
const RETRIEVAL_TIMEOUT_MS = 5000;

interface RetrievedChunk {
  source: string;
  section: string;
  similarity: number;
  content: string;
}

interface RetrievalResult {
  context: string;
  chunks: Array<{
    source: string;
    section: string;
    similarity: number;
  }>;
}

function emptyResult(): RetrievalResult {
  return { context: "", chunks: [] };
}

function redactSecrets(value: string): string {
  const secrets = [
    process.env.GEMINI_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((secret): secret is string => Boolean(secret));

  return secrets.reduce(
    (redacted, secret) => redacted.replaceAll(secret, "[redacted]"),
    value,
  );
}

function normalizeVector(values: number[] | undefined): number[] {
  if (!values || values.length !== VECTOR_DIMENSIONS) {
    throw new Error("Gemini returned an embedding with an invalid dimension.");
  }
  if (!values.every(Number.isFinite)) {
    throw new Error("Gemini returned an embedding with non-finite values.");
  }

  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Gemini returned an embedding with an invalid L2 norm.");
  }

  const normalized = values.map((value) => value / magnitude);
  if (
    normalized.length !== VECTOR_DIMENSIONS ||
    !normalized.every(Number.isFinite)
  ) {
    throw new Error("Normalized embedding failed validation.");
  }
  return normalized;
}

function isRetrievedChunk(value: unknown): value is RetrievedChunk {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.source === "string" &&
    typeof row.section === "string" &&
    typeof row.content === "string" &&
    typeof row.similarity === "number" &&
    Number.isFinite(row.similarity)
  );
}

function getTopK(): number {
  const value = Number(process.env.RAG_TOP_K);
  return Number.isInteger(value) && value > 0 ? value : 4;
}

function getMinimumSimilarity(): number {
  const value = Number(process.env.RAG_MIN_SIMILARITY);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.5;
}

async function retrieve(
  query: string,
  signal: AbortSignal,
): Promise<RetrievalResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
    throw new Error("Required RAG environment variables are missing.");
  }

  const gemini = new GoogleGenAI({ apiKey: geminiApiKey });
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const minimumSimilarity = getMinimumSimilarity();

  const embeddingResponse = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: VECTOR_DIMENSIONS,
      abortSignal: signal,
    },
  });
  const embedding = normalizeVector(embeddingResponse.embeddings?.[0]?.values);

  const { data, error } = await supabase
    .rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_count: getTopK(),
      min_similarity: minimumSimilarity,
    })
    .abortSignal(signal);

  if (error) {
    throw new Error(`Supabase knowledge retrieval failed (${error.code}).`);
  }

  const chunks = (Array.isArray(data) ? data : [])
    .filter(isRetrievedChunk)
    .filter((chunk) => chunk.similarity >= minimumSimilarity);

  if (chunks.length === 0) {
    return emptyResult();
  }

  if (process.env.RAG_DEBUG === "true") {
    for (const chunk of chunks) {
      console.info("RAG retrieved chunk:", {
        query: redactSecrets(query),
        source: chunk.source,
        section: chunk.section,
        similarity: chunk.similarity,
      });
    }
  }

  return {
    context: chunks
      .map(
        (chunk) =>
          `Source: ${chunk.source}\nSection: ${chunk.section}\n${chunk.content}`,
      )
      .join("\n\n---\n\n"),
    chunks: chunks.map(({ source, section, similarity }) => ({
      source,
      section,
      similarity,
    })),
  };
}

export async function retrieveContext(query: string): Promise<RetrievalResult> {
  const trimmedQuery = query.trim().slice(0, QUERY_MAX_LENGTH);
  if (trimmedQuery.length === 0) {
    return emptyResult();
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      retrieve(trimmedQuery, controller.signal),
      new Promise<RetrievalResult>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          console.error("RAG retrieval timed out after 5 seconds.");
          resolve(emptyResult());
        }, RETRIEVAL_TIMEOUT_MS);
      }),
    ]);
  } catch (error: unknown) {
    console.error(
      "RAG retrieval failed:",
      redactSecrets(
        error instanceof Error
          ? `${error.name}: ${error.message}`.slice(0, 200)
          : "Unknown error",
      ),
    );
    return emptyResult();
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
