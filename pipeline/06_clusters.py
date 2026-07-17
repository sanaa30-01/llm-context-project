"""
06_clusters.py — Stage 6: cluster assignment + canvas layout.

TWO-PHASE, human in the loop:

  Phase A (first run): auto-generates data/out/clusters.json from the
  model's cluster_guess values — a draft mapping you EDIT BY HAND.
  Merge synonyms, rename slugs, demote junk clusters to "misc".

  Phase B (every run after): reads your corrected clusters.json and
  computes an (x, y) canvas position for every conversation.

Why manual correction is legitimate and not cheating: automatic thread
induction is an open research question (say this to your mentor); the
prototype uses human curation exactly like PhotoDance's Galaxy view —
human judgment in the overview feeds the composed experience.

Layout approach: clusters get centroids spaced on a circle, members
jitter around their centroid, misc scatters in the leftover space.
Deterministic seed → positions never shuffle between runs, which is
what makes spatial memory possible.
"""
import json
import math
import numpy as np
from pathlib import Path
from collections import Counter

TAGS = Path("data/out/tags.json")
CLUSTERS = Path("data/out/clusters.json")
OUT = Path("data/out/positions.json")

RNG = np.random.default_rng(42)   # fixed seed: stable layout across runs
JITTER = 0.055                    # spread of dots around their centroid
MIN_CLUSTER_SIZE = 3              # smaller than this → demoted to misc in the draft


def make_draft():
    """Phase A: draft clusters.json from the model's guesses."""
    tags = json.load(open(TAGS))
    counts = Counter(t.get("cluster_guess", "misc") for t in tags.values())
    print("cluster_guess distribution from tagging:")
    for slug, n in counts.most_common():
        print(f"  {slug:24s} {n}")

    mapping = {}
    for cid, t in tags.items():
        guess = t.get("cluster_guess", "misc")
        # incidental convos and tiny clusters start as misc
        if t.get("significance") == "incidental" or counts[guess] < MIN_CLUSTER_SIZE:
            mapping[cid] = "misc"
        else:
            mapping[cid] = guess
    json.dump(mapping, open(CLUSTERS, "w"), indent=2, sort_keys=True)
    print(f"\nDRAFT written to {CLUSTERS}")
    print("EDIT IT BY HAND now: merge synonym slugs (e.g. 'jobs' + 'job-apps'),")
    print("rename to what YOU call these projects, demote strays to 'misc'.")
    print("Then run this script again to compute positions.")


def layout():
    """Phase B: compute positions from the corrected mapping."""
    mapping = json.load(open(CLUSTERS))
    slugs = sorted({s for s in mapping.values() if s != "misc"})
    n = len(slugs)
    print(f"{n} clusters: {slugs}")
    if n > 6:
        print("WARNING: >6 clusters will crowd the canvas — consider merging more.")

    # Centroids on a circle around canvas center (0.5, 0.5).
    # Circle radius 0.28 keeps blobs away from edges in 0-1 space.
    centroids = {}
    for i, slug in enumerate(slugs):
        angle = 2 * math.pi * i / max(n, 1) - math.pi / 2   # start at top
        centroids[slug] = (0.5 + 0.28 * math.cos(angle),
                          0.5 + 0.28 * math.sin(angle))

    positions = {}
    placed = []   # for overlap nudging

    def place(x, y):
        """Nudge a point until it's not on top of an existing one."""
        for _ in range(20):
            if all((x - px) ** 2 + (y - py) ** 2 > 0.0009 for px, py in placed):
                break
            x += RNG.normal(0, 0.015)
            y += RNG.normal(0, 0.015)
        x, y = float(np.clip(x, 0.04, 0.96)), float(np.clip(y, 0.06, 0.94))
        placed.append((x, y))
        return x, y

    # cluster members first (deterministic order: sorted ids)
    for cid in sorted(mapping):
        slug = mapping[cid]
        if slug == "misc":
            continue
        cx, cy = centroids[slug]
        x, y = place(cx + RNG.normal(0, JITTER), cy + RNG.normal(0, JITTER))
        positions[cid] = {"x": x, "y": y}

    # misc scattered anywhere that's far from every centroid
    for cid in sorted(mapping):
        if mapping[cid] != "misc":
            continue
        for _ in range(50):
            x, y = RNG.uniform(0.06, 0.94), RNG.uniform(0.08, 0.92)
            if all((x - cx) ** 2 + (y - cy) ** 2 > 0.04 for cx, cy in centroids.values()):
                break
        positions[cid] = dict(zip(("x", "y"), place(x, y)))

    json.dump(positions, open(OUT, "w"), indent=2)
    print(f"positions written for {len(positions)} conversations → {OUT}")


if __name__ == "__main__":
    if not CLUSTERS.exists():
        make_draft()
    else:
        layout()