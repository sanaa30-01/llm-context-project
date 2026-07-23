# pipeline/06b_fix_clusters.py — merge synonym slugs, rescue misc by title
import json
from pathlib import Path
from collections import Counter

CL = Path("data/out/clusters.json")
cl = json.load(open(CL))
convos = {c["id"]: c["title"] for c in json.load(open("data/out/conversations_clean.json"))}

MERGE = {"math-linear-algebra": "math", "history": "humanities",
         "history-essays": "humanities", "career-apps": "jobs",
         "movie-analysis": "media-psychology"}

KEYWORDS = {
 "math": ["eigen","matrix","linear depend","row reduction","cramer","subspace",
          "orthogonal","gram-schmidt","zero function","basis for"],
 "media-psychology": ["suits","black mirror","perks of exposure","emotional avoidance","andy sachs"],
 "humanities": ["mmw","penitence","protestantism"],
 "jobs": ["career guidance"],
}

before = Counter(cl.values())
for cid, slug in list(cl.items()):
    if slug in MERGE:
        cl[cid] = MERGE[slug]; continue
    if slug == "misc":
        t = convos.get(cid, "").lower()
        for target, keys in KEYWORDS.items():
            if any(k in t for k in keys):
                cl[cid] = target; break

json.dump(cl, open(CL, "w"), indent=2, sort_keys=True)
after = Counter(cl.values())
print("before:", dict(before.most_common()))
print("after: ", dict(after.most_common()))
print("\nstill misc:")
for cid, slug in sorted(cl.items()):
    if slug == "misc": print("   ", convos.get(cid, "?")[:60])