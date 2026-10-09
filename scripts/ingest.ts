import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const EMBEDDING_MODEL = "gemini-embedding-001";
const VECTOR_DIMENSIONS = 768;
const EMBEDDING_BATCH_SIZE = 5;
const INSERT_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

interface MarkdownFile {
  name: string;
  text: string;
}

interface ChunkMetadata {
  word_count: number;
  chunk_index: number;
}

interface KnowledgeChunk {
  source: string;
  section: string;
  content: string;
  metadata: ChunkMetadata;
}

interface EmbeddedChunk extends KnowledgeChunk {
  embedding: number[];
}

interface Credentials {
  geminiApiKey: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

async function readFiles(): Promise<MarkdownFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(KNOWLEDGE_DIR, { withFileTypes: true });
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ENOENT") {
      throw new Error(`Knowledge folder is missing: ${KNOWLEDGE_DIR}`);
    }
    throw error;
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  if (filenames.length === 0) {
    throw new Error(`No Markdown files found in ${KNOWLEDGE_DIR}`);
  }

  return Promise.all(
    filenames.map(async (name) => ({
      name,
      text: await readFile(path.join(KNOWLEDGE_DIR, name), "utf8"),
    })),
  );
}

function chunkMarkdown(file: MarkdownFile): KnowledgeChunk[] {
  const lines = file.text.split(/\r?\n/u);
  const sections: Array<{ heading: string; bodyLines: string[] }> = [];
  const preambleLines: string[] = [];
  let sawHeading = false;
  let currentSection: { heading: string; bodyLines: string[] } | undefined;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentSection) {
        sections.push(currentSection);
      } else if (!sawHeading && preambleLines.join("\n").trim() !== "") {
        console.warn(`${file.name}: ignoring text before the first "## " heading.`);
      }
      sawHeading = true;
      currentSection = { heading: line.slice(3).trim(), bodyLines: [] };
    } else if (currentSection) {
      currentSection.bodyLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  if (!sawHeading && preambleLines.join("\n").trim() !== "") {
    console.warn(`${file.name}: ignoring text before the first "## " heading.`);
  }

  const source = path.basename(file.name, path.extname(file.name));
  const chunks: KnowledgeChunk[] = [];

  for (const section of sections) {
    const body = section.bodyLines.join("\n").trim();
    if (body === "") {
      continue;
    }

    const content = `Source: ${source}\nSection: ${section.heading}\n\n${body}`;
    const wordCount = countWords(content);
    const chunk: KnowledgeChunk = {
      source: file.name,
      section: section.heading,
      content,
      metadata: {
        word_count: wordCount,
        chunk_index: chunks.length,
      },
    };

    if (wordCount > 800) {
      console.warn(
        `${file.name} / ${section.heading}: chunk is ${wordCount} words (over roughly 800).`,
      );
    }
    chunks.push(chunk);
  }

  return chunks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadCredentials(): Credentials {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!geminiApiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }
  if (!supabaseUrl) {
    throw new Error("Missing required environment variable: SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return { geminiApiKey, supabaseUrl, serviceRoleKey };
}

function isTransientError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const possibleErrors: unknown[] = [error];
  if ("cause" in error) {
    possibleErrors.push(error.cause);
  }

  return possibleErrors.some(
    (candidate) =>
      isRecord(candidate) &&
      ((typeof candidate.status === "number" &&
        [408, 429, 500, 502, 503, 504].includes(candidate.status)) ||
        (typeof candidate.code === "string" &&
          [
            "ECONNRESET",
            "ETIMEDOUT",
            "EAI_AGAIN",
            "ECONNREFUSED",
            "UND_ERR_CONNECT_TIMEOUT",
            "UND_ERR_SOCKET",
          ].includes(candidate.code))),
  );
}

function normalizeVector(values: number[] | undefined, context: string): number[] {
  if (!values || values.length !== VECTOR_DIMENSIONS) {
    throw new Error(
      `${context}: expected an embedding of ${VECTOR_DIMENSIONS} dimensions, received ${values?.length ?? "no vector"}.`,
    );
  }
  if (!values.every(Number.isFinite)) {
    throw new Error(`${context}: embedding contains non-finite values.`);
  }

  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error(`${context}: embedding has an invalid L2 norm.`);
  }

  const normalized = values.map((value) => value / magnitude);
  if (normalized.length !== VECTOR_DIMENSIONS || !normalized.every(Number.isFinite)) {
    throw new Error(`${context}: normalized embedding failed validation.`);
  }
  return normalized;
}

async function embedChunks(
  chunks: KnowledgeChunk[],
  apiKey: string,
): Promise<EmbeddedChunk[]> {
  const ai = new GoogleGenAI({ apiKey });
  const embedded: EmbeddedChunk[] = [];

  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    let response: Awaited<ReturnType<typeof ai.models.embedContent>>;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        response = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: batch.map((chunk) => chunk.content),
          config: {
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: VECTOR_DIMENSIONS,
          },
        });
        break;
      } catch (error: unknown) {
        const context = `Gemini embedding batch ${Math.floor(start / EMBEDDING_BATCH_SIZE) + 1}`;
        if (!isTransientError(error) || attempt >= MAX_ATTEMPTS) {
          throw new Error(`${context} failed after ${attempt} attempt(s): ${errorMessage(error)}`);
        }
        const delayMs = 1000 * 2 ** (attempt - 1);
        console.warn(
          `${context} received a transient error; retrying in ${delayMs} ms (attempt ${attempt + 1}/${MAX_ATTEMPTS}).`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const vectors = response.embeddings;
    if (!vectors || vectors.length !== batch.length) {
      throw new Error(
        `Gemini returned ${vectors?.length ?? 0} embeddings for a batch of ${batch.length} chunks.`,
      );
    }

    for (let index = 0; index < batch.length; index += 1) {
      const chunk = batch[index];
      const vector = vectors[index];
      if (!chunk || !vector) {
        throw new Error(`Gemini returned a missing embedding at batch index ${index}.`);
      }
      embedded.push({
        ...chunk,
        embedding: normalizeVector(
          vector.values,
          `${chunk.source} / ${chunk.section}`,
        ),
      });
    }

    if (start + EMBEDDING_BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return embedded;
}

async function replaceRows(
  chunks: EmbeddedChunk[],
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<number> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .not("id", "is", null);
  if (deleteError) {
    throw new Error(`Failed to delete existing knowledge_chunks: ${deleteError.message}`);
  }

  for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
    const batch = chunks.slice(start, start + INSERT_BATCH_SIZE).map((chunk) => ({
      content: chunk.content,
      source: chunk.source,
      section: chunk.section,
      metadata: chunk.metadata,
      embedding: chunk.embedding,
    }));
    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(batch);
    if (insertError) {
      throw new Error(
        `Failed to insert knowledge_chunks batch ${Math.floor(start / INSERT_BATCH_SIZE) + 1} after deleting the old rows. The table may now be empty or partially populated: ${insertError.message}`,
      );
    }
  }

  const { count, error: countError } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true });
  if (countError) {
    throw new Error(`Rows were inserted, but the final table count failed: ${countError.message}`);
  }
  if (count === null) {
    throw new Error("Rows were inserted, but Supabase returned no exact table count.");
  }
  return count;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const credentials = dryRun ? undefined : loadCredentials();

  const files = await readFiles();
  const chunksByFile = files.map((file) => ({
    name: file.name,
    chunks: chunkMarkdown(file),
  }));
  const allChunks = chunksByFile.flatMap((file) => file.chunks);

  if (dryRun) {
    for (const { chunks } of chunksByFile) {
      for (const chunk of chunks) {
        const preview = chunk.content.slice(0, 120).replace(/\s+/gu, " ");
        console.log(
          `${chunk.source} | ${chunk.section} | ${chunk.metadata.word_count} words | ${preview}`,
        );
      }
    }
    for (const { name, chunks } of chunksByFile) {
      console.log(`${name}: ${chunks.length} chunk(s)`);
    }
    console.log(`Total: ${allChunks.length} chunk(s)`);
    return;
  }

  if (allChunks.length === 0) {
    throw new Error("No non-empty Markdown sections were found; refusing to replace the table.");
  }

  if (!credentials) {
    throw new Error("Required credentials were not loaded for ingestion.");
  }
  const embeddedChunks = await embedChunks(allChunks, credentials.geminiApiKey);
  const rowCount = await replaceRows(
    embeddedChunks,
    credentials.supabaseUrl,
    credentials.serviceRoleKey,
  );

  console.log("Ingestion complete:");
  for (const { name, chunks } of chunksByFile) {
    console.log(`  ${name}: ${chunks.length} chunk(s)`);
  }
  console.log(`  Total chunks: ${embeddedChunks.length}`);
  console.log(`  Vector dimension: ${VECTOR_DIMENSIONS}`);
  console.log(`  Rows in knowledge_chunks: ${rowCount}`);
}

main().catch((error: unknown) => {
  console.error(`Ingestion failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
