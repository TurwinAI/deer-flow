# B03 Retrospective — Persistence + memory

- **Batch:** B03 · **Date:** 2026-06-20 · **Outcome:** VERIFIED

## What was attempted
Make agent runs durable: a Firestore-backed LangGraph checkpointer mirroring MemorySaver semantics, a thread store, per-user memory (Firestore facts + `<memory>` prompt block + deterministic extraction stub), and engine-collection security rules — all gated against the real Firestore emulator.

## What was verified
9 gates green including the emulator-backed persistence + rules suite (21 tests). The checkpointer genuinely round-trips through Firestore and drives the real lead-agent graph via `.compile({ checkpointer })`. Rules tests assert public catalog reads, denied client writes, and fully-closed engine collections, loading the actual `firestore.rules`. Independent verifier confirmed no scope creep and no type-safety escapes.

## What failed / surprised
- **`firebase-admin/app` tripped the B01 boundary heuristic.** Adding the persistence layer introduced `import … from "firebase-admin/app"`, which the original `reachesApp` (flag any path with an "app" segment) falsely flagged as a harness→app violation. Fixed the heuristic to only flag relative or bare-`app` specifiers — a correctness fix, independently re-proven to still catch real `../../app` violations.
- **MemorySaver's `pending_sends` rebuild** is non-trivial (parent-checkpoint TASKS-channel writes). Deliberately scoped out as `pending_sends: []` since the pragmatic core has no Send fan-out; documented in-code rather than half-implemented.

## Failure-taxonomy note
The boundary false-positive is a **gate-precision** issue surfaced by a legitimate new dependency — caught by the gate itself, fixed at the rule level (not by exempting the file). The `pending_sends` gap is a **deliberate scope boundary**, recorded honestly, not a silent omission.

## Structural fixes proposed (capability, not blame)
1. When subagent fan-out is introduced (deferred), implement `pending_sends` persistence by porting MemorySaver's `_getPendingSends`; add a regression test. Tracked as a known limitation in the checkpointer header.
2. Consider a tiny shared emulator-test bootstrap (project id + skipIf guard) to keep future emulator suites consistent (B05 rules, B06 webhook).
3. Keep the boundary heuristic covered: the verifier's inject-and-revert proof should be repeated whenever a new third-party `*/app` import lands.

## Advance decision
Autorun proceeds to B04 (SKILL.md skills system: discovery/parse/inject/slash-activation). No emulator dependency for B04 core; persistence foundation is in place for later batches.
