/**
 * Memory system. Mirrors DeerFlow's `deerflow/agents/memory`.
 * Fact extraction + injection + Firestore-backed per-user storage land in B03.
 */
export interface MemoryFact {
  id: string;
  content: string;
  category: "preference" | "knowledge" | "context" | "behavior" | "goal";
  confidence: number;
  createdAt: string;
}
