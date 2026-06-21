#!/usr/bin/env python3
"""Phase 2: record per-feature test status + documented errors into the
canonical tracker, backed by the suite runs (web 22, functions 407, e2e 2).

Statuses:
  TEST_PASS          - exercised by a passing automated test / flow.
  TEST_PASS_INDIRECT - underlying logic tested; thin deployed wrapper in
                       index.ts not itself invoked by a test (coverage note).
  BLOCKED_OWNER      - real external-integration path, deliberately not
                       exercised (needs live secret); fake/stub IS tested.
  TEST_FAIL          - observed defect (see ErrorsFound).
"""
import csv, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "feature-tracker.csv")

BLOCKED_OWNER = {"DST-09", "PUB-09", "FIN-02", "FIN-03", "ANL-02"}
WRAPPER_INDIRECT = {"EXP-01", "EXP-02", "EXP-03"}
FAILS = {
    "UI-14": "Nav links to /releases and /shop but App.tsx defines no matching "
             "route (only /releases/:releaseId). Both fall through the catch-all "
             "route and silently render the Home page - two of five nav items "
             "mislead the user. Logistical/UX defect.",
}
NOTES = {
    "DST-09": "FakeDistributorClient (DST-08) fully tested via distribution.emulator; real client needs DISTRIBUTOR_API_TOKEN at handoff.",
    "PUB-09": "FakeProRegistrar (PUB-08) tested; real registrar needs PRO_API_TOKEN at handoff.",
    "FIN-02": "Deterministic fake ingest tested; real path needs DISTRIBUTOR_API_TOKEN at handoff.",
    "FIN-03": "Deterministic fake ingest tested; real path needs PRO_API_TOKEN at handoff.",
    "ANL-02": "Deterministic fake ingest tested; real path needs DSP_STATS_API_TOKEN at handoff.",
    "EXP-01": "gatewayInfo() covered; thin onRequest health wrapper not invoked by a test.",
    "EXP-02": "createCheckoutForProduct covered via polar.emulator (FakePolarClient); onCall wrapper + live PolarSdkClient not invoked (needs POLAR_ACCESS_TOKEN).",
    "EXP-03": "verifyWebhookSignature + handlePolarWebhook covered (polarWebhookSignature, polar.emulator); onRequest wrapper not invoked by a test.",
}

rows = list(csv.DictReader(open(OUT, newline="", encoding="utf-8")))
cols = rows[0].keys()
for r in rows:
    i = r["ID"]
    if i in FAILS:
        r["P2_TestStatus"] = "TEST_FAIL"
        r["ErrorsFound"] = FAILS[i]
    elif i in BLOCKED_OWNER:
        r["P2_TestStatus"] = "BLOCKED_OWNER"
        r["Notes"] = NOTES.get(i, r["Notes"])
    elif i in WRAPPER_INDIRECT:
        r["P2_TestStatus"] = "TEST_PASS_INDIRECT"
        r["Notes"] = NOTES.get(i, r["Notes"])
    else:
        r["P2_TestStatus"] = "TEST_PASS"

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(cols))
    w.writeheader(); w.writerows(rows)

from collections import Counter
c = Counter(r["P2_TestStatus"] for r in rows)
print("Phase 2 statuses:", dict(c))
print("FAILS:", [r["ID"] for r in rows if r["P2_TestStatus"] == "TEST_FAIL"])
