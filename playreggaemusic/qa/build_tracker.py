#!/usr/bin/env python3
"""Assemble the single canonical feature tracker CSV from staged PSV blocks.

Idempotent: regenerating preserves any phase results already recorded in an
existing tracker (keyed by ID), so re-running after Phase 1 never clobbers
Phase 2/3/4 columns.
"""
import csv
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_GLOB = os.path.join(HERE, "raw", "*.psv")
OUT = os.path.join(HERE, "feature-tracker.csv")

COLUMNS = [
    "ID", "Module", "Feature", "UserStory", "ExpectedBehavior", "CodeRefs",
    "P1_StoryStatus", "P2_TestStatus", "ErrorsFound", "P3_FixStatus",
    "P4_RetestStatus", "Notes",
]

# Preserve any phase results already recorded.
existing = {}
if os.path.exists(OUT):
    with open(OUT, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            existing[row["ID"]] = row

rows = []
for path in sorted(glob.glob(RAW_GLOB)):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            parts = line.split("|")
            if len(parts) != 6:
                raise SystemExit(f"Bad row ({len(parts)} fields) in {path}:\n{line}")
            fid, module, feature, story, behavior, refs = (p.strip() for p in parts)
            prev = existing.get(fid, {})
            rows.append({
                "ID": fid,
                "Module": module,
                "Feature": feature,
                "UserStory": story,
                "ExpectedBehavior": behavior,
                "CodeRefs": refs,
                "P1_StoryStatus": "STORY_DONE",
                "P2_TestStatus": prev.get("P2_TestStatus", "PENDING"),
                "ErrorsFound": prev.get("ErrorsFound", ""),
                "P3_FixStatus": prev.get("P3_FixStatus", ""),
                "P4_RetestStatus": prev.get("P4_RetestStatus", ""),
                "Notes": prev.get("Notes", ""),
            })

rows.sort(key=lambda r: r["ID"])
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=COLUMNS, quoting=csv.QUOTE_MINIMAL)
    w.writeheader()
    w.writerows(rows)

# Summary
by_mod = {}
for r in rows:
    by_mod[r["Module"]] = by_mod.get(r["Module"], 0) + 1
print(f"Wrote {len(rows)} features to {OUT}")
for m in sorted(by_mod):
    print(f"  {m:14s} {by_mod[m]}")
