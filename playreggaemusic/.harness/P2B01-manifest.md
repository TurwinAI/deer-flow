# P2B01 — Metadata & Rights core — BUILD manifest

## Objective
Add music-industry identifier validators (ISRC/UPC/ISWC) and ownership-splits
validation, extend the catalog data model with public identifier/credit fields,
store SENSITIVE ownership splits in an admin-only `rights/{releaseId}`
collection, expose agent tools + admin callables to set them, and lock down the
new collection in firestore.rules. All under `playreggaemusic/`.

## Inputs / authority
- App layer code under `functions/src/app/label/*` and `functions/src/app/gateway/adminApi.ts`.
- `firestore.rules`. Tests under `functions/src/__tests__/*`.
- May import harness/*; harness must NOT import app/* (boundary test).
- No `any`/eslint-disable/@ts-ignore. zod pinned 3.23.8.

## Batches
1. `identifiers.ts` — pure validators (ISRC, UPC/EAN check digit, ISWC, splits).
2. `index.ts` model — `Track.isrc?`, `Release.upc?`, `Release.credits?`,
   `Credit`, `Split`, `RightsRecord`.
3. `store.ts` — persist isrc/upc/credits on public docs (validated, reject
   invalid); `setRights`/`getRights` on admin-only `rights` collection.
4. `tools.ts` — `set_track_isrc`, `set_release_identifiers`, `set_ownership_splits`.
   `adminApi.ts` — `adminSetIdentifiers`, `adminSetOwnershipSplits` (assertAdmin+zod).
5. `firestore.rules` — `match /rights/{doc=**} { allow read, write: if false; }`.
6. `seed.ts` — valid UPC + per-track ISRC + credits + ownershipSplits (sum 100).

## Verification criteria (gates, capture exit codes)
FUNCTIONS: typecheck=0, lint=0, test=0, test:emulator=0, build=0, boundary green.
WEB: typecheck=0, lint=0, test=0, build=0 (web untouched).

## Failure modes
- Invalid/duplicate identifier accepted → reject at store + tool + callable.
- Splits not summing to 100 accepted → validateSplits throws.
- ownershipSplits leaking into a public doc → stored ONLY in `rights`, rules `if false`.

## Recovery references
Phase-1 patterns: track_masters (admin-only collection + rules if false),
DynamicStructuredTool+zod tools, assertAdmin+zod callables, emulator tests
guarded by `describe.skipIf(!FIRESTORE_EMULATOR_HOST)`.
