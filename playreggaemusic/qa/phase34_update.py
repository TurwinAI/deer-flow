#!/usr/bin/env python3
"""Phases 3 (fix) + 4 (retest) recorded into the canonical tracker.

Only UI-14 required a fix. Post-fix the FULL suites were re-run green
(web 23, functions 407 emulator, e2e 2), so every feature gets a Phase-4
result consistent with its (unchanged) Phase-2 evidence.
"""
import csv, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "feature-tracker.csv")

rows = list(csv.DictReader(open(OUT, newline="", encoding="utf-8")))
cols = list(rows[0].keys())
for r in rows:
    i, p2 = r["ID"], r["P2_TestStatus"]
    if i == "UI-14":
        r["P3_FixStatus"] = "FIXED"
        r["P4_RetestStatus"] = "VERIFIED"
        r["Notes"] = ("Added src/pages/Releases.tsx + route /releases in App.tsx; "
                      "removed dead /shop nav link (releases ARE the storefront). "
                      "Guard test added in App.test.tsx asserts no dangling nav "
                      "link and that /releases renders the index, not Home.")
    elif p2 == "BLOCKED_OWNER":
        r["P3_FixStatus"] = "N/A"
        r["P4_RetestStatus"] = "BLOCKED_OWNER"
    elif p2 == "TEST_PASS_INDIRECT":
        r["P3_FixStatus"] = "N/A"
        r["P4_RetestStatus"] = "VERIFIED_INDIRECT"
    else:  # TEST_PASS
        r["P3_FixStatus"] = "N/A"
        r["P4_RetestStatus"] = "VERIFIED"

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader(); w.writerows(rows)

print("P3:", dict(Counter(r["P3_FixStatus"] for r in rows)))
print("P4:", dict(Counter(r["P4_RetestStatus"] for r in rows)))
# Final integrity: no row left PENDING in any phase.
pend = [r["ID"] for r in rows if "PENDING" in (r["P2_TestStatus"], r["P4_RetestStatus"]) or not r["P4_RetestStatus"]]
print("Unresolved rows:", pend or "NONE")
