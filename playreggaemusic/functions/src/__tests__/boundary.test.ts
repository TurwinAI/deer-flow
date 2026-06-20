import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ported from DeerFlow's tests/test_harness_boundary.py: the harness/* layer is
 * the publishable agent framework and must never import the application layer.
 * App -> harness is allowed; harness -> app is forbidden.
 */
const HARNESS_DIR = resolve(__dirname, "..", "harness");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function importSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const re = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    specs.push(m[1]);
  }
  return specs;
}

function reachesApp(specifier: string): boolean {
  const norm = specifier.replace(/\\/g, "/");
  // The forbidden boundary is the LOCAL application layer (functions/src/app).
  // That is reached only via a relative path with an "app" segment
  // (./app, ../app, ../../app/...) or a bare "app"/"app/..." specifier.
  // Third-party package subpaths that happen to contain an "app" segment
  // (e.g. "firebase-admin/app") are NOT the app layer and must not be flagged.
  const isRelative = norm.startsWith(".");
  const isBareApp = norm === "app" || norm.startsWith("app/");
  if (!isRelative && !isBareApp) {
    return false;
  }
  return norm.split("/").includes("app");
}

describe("harness -> app import firewall", () => {
  it("finds harness source files to scan", () => {
    expect(walk(HARNESS_DIR).length).toBeGreaterThan(0);
  });

  it("no file under harness/ imports from app/", () => {
    const offenders: string[] = [];
    for (const file of walk(HARNESS_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const spec of importSpecifiers(src)) {
        if (reachesApp(spec)) {
          offenders.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
