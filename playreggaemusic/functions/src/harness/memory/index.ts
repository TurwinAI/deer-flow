/**
 * Memory system. Mirrors DeerFlow's `deerflow/agents/memory`.
 * Per-user facts are stored in Firestore under `memory/{userId}/facts/{factId}`
 * and injected into the system prompt as a `<memory>` block.
 *
 * Fact extraction (`extractFacts`) is a DETERMINISTIC stub for B03: it parses
 * lines prefixed with `FACT:` rather than calling an LLM. LLM-based extraction
 * (classification + confidence scoring from free text) is deferred to a later
 * batch so the unit/emulator gates stay offline and reproducible.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "../persistence/firestore";

const MEMORY = "memory";
const FACTS = "facts";

export interface MemoryFact {
  id: string;
  content: string;
  category: "preference" | "knowledge" | "context" | "behavior" | "goal";
  confidence: number;
  createdAt: string;
}

/** Persist a single fact for a user. */
export async function saveFact(
  userId: string,
  fact: MemoryFact,
  db: Firestore = getDb(),
): Promise<void> {
  await db
    .collection(MEMORY)
    .doc(userId)
    .collection(FACTS)
    .doc(fact.id)
    .set(fact);
}

/** Fetch all stored facts for a user, newest first. */
export async function getFacts(
  userId: string,
  db: Firestore = getDb(),
): Promise<MemoryFact[]> {
  const snap = await db
    .collection(MEMORY)
    .doc(userId)
    .collection(FACTS)
    .get();
  return snap.docs
    .map((d) => d.data() as MemoryFact)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Build a `<memory>` block for prompt injection from a list of facts, capped at
 * `maxFacts`. Returns an empty string when there are no facts so callers can
 * inject unconditionally without emitting an empty block.
 */
export function buildMemoryBlock(facts: MemoryFact[], maxFacts = 15): string {
  if (facts.length === 0) {
    return "";
  }
  const lines = facts
    .slice(0, maxFacts)
    .map((f) => `- [${f.category}] ${f.content}`);
  return `<memory>\n${lines.join("\n")}\n</memory>`;
}

/**
 * Deterministic fact extraction stub. Parses lines of the form
 * `FACT: <content>` (optionally `FACT[category]: <content>`) into MemoryFact
 * objects. No LLM call — see file header. Returns facts in source order.
 */
export function extractFacts(text: string): MemoryFact[] {
  const valid = new Set<MemoryFact["category"]>([
    "preference",
    "knowledge",
    "context",
    "behavior",
    "goal",
  ]);
  const facts: MemoryFact[] = [];
  const lines = text.split("\n");
  let n = 0;
  for (const raw of lines) {
    const line = raw.trim();
    const match = /^FACT(?:\[(\w+)\])?:\s*(.+)$/.exec(line);
    if (!match) {
      continue;
    }
    const [, categoryRaw, content] = match;
    const category =
      categoryRaw && valid.has(categoryRaw as MemoryFact["category"])
        ? (categoryRaw as MemoryFact["category"])
        : "knowledge";
    facts.push({
      id: `fact-${Date.now()}-${n}`,
      content: content.trim(),
      category,
      confidence: 1,
      createdAt: new Date().toISOString(),
    });
    n += 1;
  }
  return facts;
}
