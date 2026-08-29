// Reusable local diagnostic tool for the Scan (AI extract) feature — runs the
// *exact* same engine code as app/api/extract/route.ts (both import from
// lib/extractEngines.ts), so results here reflect real production behavior,
// not an approximation. Built after several rounds of one-off throwaway test
// scripts during a Gemini outage — this replaces those.
//
// Usage (run from repo root, same env-loading convention as every other script):
//   npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts [options]
//
// Fixture files (edit these in place, no flags needed — see scripts/diagnose-fixtures/):
//   scripts/diagnose-fixtures/text.txt    — used by default (zero input flags)
//   scripts/diagnose-fixtures/image.jpg   — used when you pass --mode image
//
// Options:
//   --engine gemini|claude|groq|all   (default: all — "both" also still works as an alias)
//   --type CARD|VOUCHER|REFUND|WARRANTY   (default: CARD)
//   --mode image                  use the image fixture instead of the text fixture
//   --text "pasted text to extract from"       (overrides the fixtures)
//   --text-file <path>            (overrides the fixtures — reads a text file)
//   --image <path>                (overrides the fixtures — reads an image file)
//   --repeat N                    (default: 1 — run each engine N times, useful for
//                                  spotting intermittent failures like the Gemini outage)
//   --gemini-model <id>           (default: gemini-3.5-flash-lite — pinned, not the
//                                  gemini-flash-latest rolling alias Google can silently
//                                  repoint. Compare against another pinned version, e.g.
//                                  gemini-2.5-flash or gemini-2.5-flash-lite. See
//                                  scripts/list-gemini-models.ts to see every model your
//                                  key can currently use.)
//   --locale en|he                 (default: none — mirrors the app's UI-language hint that
//                                  steers the "notes" field's output language; omit to see
//                                  each engine's unhinted default behavior)
//
// Examples:
//   npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts
//     → edit scripts/diagnose-fixtures/text.txt, then just rerun this with no flags
//   npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --mode image --repeat 3
//     → edit scripts/diagnose-fixtures/image.jpg, then rerun with --mode image
//   npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --engine gemini --type CARD --text "..." --repeat 5
//   npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --engine both --type WARRANTY --image ./receipt.jpg

// # Edit scripts/diagnose-fixtures/text.txt (or image.jpg), then run:
// dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts
// npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --mode image
// npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --engine gemini --type CARD --text "..." --repeat 5
// npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --engine groq --repeat 3
// npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --mode image --engine groq --repeat 1
// npx dotenv -e .env.local -o -- npx tsx scripts/diagnose-extract.ts --mode image --engine gemini --repeat 1 type WARRANTY

import fs from "fs";
import path from "path";
import {
  callEngine,
  SCHEMAS,
  isEntityType,
  DEFAULT_GEMINI_MODEL,
  type Engine,
  type EntityType,
  type AttemptLog,
} from "../lib/extractEngines";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

function schemaFieldNames(entityType: EntityType): string[] {
  const schema = SCHEMAS[entityType] as { properties: Record<string, unknown> };
  return Object.keys(schema.properties);
}

// Minimal File polyfill for Node scripts — same shape callGemini/callClaude
// expect (they only read .type and .arrayBuffer()), without pulling in a
// browser File implementation dependency.
function makeFile(buffer: Buffer, mimeType: string): File {
  return new File([new Uint8Array(buffer)], "diagnose-input", {
    type: mimeType,
  });
}

// Fixed, always-there fixture files — edit these in place and rerun with no
// --text/--text-file/--image flag at all. scripts/diagnose-fixtures/text.txt
// is used by default; pass --mode image to use image.jpg instead. An explicit
// --text/--text-file/--image still overrides both, for one-off custom input.
const FIXTURES_DIR = path.join(process.cwd(), "scripts", "diagnose-fixtures");
const DEFAULT_TEXT_FILE = path.join(FIXTURES_DIR, "text.txt");
const DEFAULT_IMAGE_FILE = path.join(FIXTURES_DIR, "image.jpg");

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function runOnce(
  engine: Engine,
  file: File | null,
  text: string | null,
  entityType: EntityType,
  attemptNum: number,
  geminiModel: string,
  locale?: string,
) {
  console.log(
    `\n=== ${engine} run #${attemptNum}${engine === "gemini" ? ` (model=${geminiModel})` : ""} ===`,
  );
  const attempts: AttemptLog[] = [];
  const started = Date.now();
  try {
    const fields = await callEngine(
      engine,
      file,
      text,
      entityType,
      (log) => {
        attempts.push(log);
        console.log(
          `  attempt ${log.attempt}: ${log.outcome} in ${log.ms}ms — ${log.detail}`,
        );
      },
      geminiModel,
      locale,
    );
    const totalMs = Date.now() - started;
    const expected = schemaFieldNames(entityType);
    const present = expected.filter(
      (k) => fields[k] !== undefined && fields[k] !== "",
    );
    const missing = expected.filter((k) => !present.includes(k));
    console.log(`  RESULT: success in ${totalMs}ms total`);
    console.log(`  fields present: ${present.join(", ") || "(none)"}`);
    if (missing.length) console.log(`  fields omitted: ${missing.join(", ")}`);
    console.log(`  raw output:`, JSON.stringify(fields, null, 2));
    return { ok: true, totalMs };
  } catch (err) {
    const totalMs = Date.now() - started;
    console.log(
      `  RESULT: FAILED after ${totalMs}ms — ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, totalMs };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const engineArg = args.engine ?? "all";
  const engines: Engine[] =
    engineArg === "all" || engineArg === "both"
      ? ["gemini", "claude", "groq"]
      : [engineArg as Engine];

  const entityTypeArg = (args.type ?? "CARD").toUpperCase();
  if (!isEntityType(entityTypeArg)) {
    console.error(
      `Invalid --type "${entityTypeArg}". Must be one of CARD, VOUCHER, REFUND, WARRANTY.`,
    );
    process.exit(1);
  }
  const entityType = entityTypeArg as EntityType;

  const repeat = parseInt(args.repeat ?? "1", 10);
  const geminiModel = args["gemini-model"] ?? DEFAULT_GEMINI_MODEL;

  let file: File | null = null;
  let text: string | null = null;

  if (args.image) {
    const buffer = fs.readFileSync(args.image);
    file = makeFile(buffer, guessMimeType(args.image));
    console.log(
      `Input: image file "${args.image}" (${buffer.length} bytes, ${guessMimeType(args.image)})`,
    );
  } else if (args["text-file"]) {
    text = fs.readFileSync(args["text-file"], "utf8");
    console.log(
      `Input: text file "${args["text-file"]}" (${text.length} chars)`,
    );
  } else if (args.text) {
    text = args.text;
    console.log(`Input: inline text (${text.length} chars)`);
  } else if (args.mode === "image") {
    const buffer = fs.readFileSync(DEFAULT_IMAGE_FILE);
    file = makeFile(buffer, guessMimeType(DEFAULT_IMAGE_FILE));
    console.log(
      `Input: fixture image "${DEFAULT_IMAGE_FILE}" (${buffer.length} bytes) — edit this file in place to change it`,
    );
  } else {
    // Default: the text fixture. Covers the plain `npx tsx scripts/diagnose-extract.ts`
    // case with zero flags — just edit scripts/diagnose-fixtures/text.txt and rerun.
    text = fs.readFileSync(DEFAULT_TEXT_FILE, "utf8");
    console.log(
      `Input: fixture text "${DEFAULT_TEXT_FILE}" (${text.length} chars) — edit this file in place to change it`,
    );
  }

  const locale = args.locale;
  console.log(
    `Engines: ${engines.join(", ")} | Entity type: ${entityType} | Repeat: ${repeat}${engines.includes("gemini") ? ` | Gemini model: ${geminiModel}` : ""}${locale ? ` | Locale: ${locale}` : ""}`,
  );

  const summary: Record<
    string,
    { ok: number; fail: number; totalMs: number[] }
  > = {};
  for (const engine of engines) {
    summary[engine] = { ok: 0, fail: 0, totalMs: [] };
    for (let i = 1; i <= repeat; i++) {
      const result = await runOnce(
        engine,
        file,
        text,
        entityType,
        i,
        geminiModel,
        locale,
      );
      if (result.ok) summary[engine].ok++;
      else summary[engine].fail++;
      summary[engine].totalMs.push(result.totalMs);
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const engine of engines) {
    const s = summary[engine];
    const avg = Math.round(
      s.totalMs.reduce((a, b) => a + b, 0) / s.totalMs.length,
    );
    console.log(
      `${engine}: ${s.ok}/${s.ok + s.fail} succeeded, avg ${avg}ms (${s.totalMs.join(", ")}ms per run)`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
