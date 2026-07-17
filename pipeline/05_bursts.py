"""
05_bursts.py — Stage 5: detect retried prompts ("bursts") inside each
conversation. No LLM — sentence embeddings + cosine similarity.

The idea (borrowed from PhotoDance's burst collapse): when a user asks
nearly the same thing 2-3 times in a row, those are retry attempts.
The interface shows the LAST attempt (the one that worked — the
conversation continued from its answer) and collapses the earlier
ones behind a "show retries" strip.
"""
import json
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer

IN = Path("data/out/conversations_clean.json")
OUT = Path("data/out/bursts.json")

# --- tuning knobs ---
SIM_THRESHOLD = 0.87   # cosine similarity above this = "same ask"
WINDOW = 3             # only compare prompts within 3 positions of each other
MIN_WORDS = 8          # short prompts ("yes", "try again") match everything; skip them

# all-MiniLM-L6-v2: small (80MB), fast on CPU, good enough for
# "are these two prompts the same request". Downloads once, then cached.
model = SentenceTransformer("all-MiniLM-L6-v2")


def find_bursts(convo):
    """Return [{"atPrompt": n, "retries": [...texts...]}] for one conversation."""
    prompts = [(m["prompt_n"], m["text"]) for m in convo["messages"]
               if m["role"] == "user" and len(m["text"].split()) >= MIN_WORDS]
    if len(prompts) < 2:
        return []

    texts = [t for _, t in prompts]
    emb = model.encode(texts, normalize_embeddings=True)  # normalized → dot product = cosine
    sims = emb @ emb.T

    # Greedy grouping: walk prompts in order; chain neighbors within
    # WINDOW positions whose similarity clears the threshold.
    groups, used = [], set()
    for i in range(len(prompts)):
        if i in used:
            continue
        group = [i]
        for j in range(i + 1, min(i + 1 + WINDOW, len(prompts))):
            if j not in used and sims[group[-1]][j] >= SIM_THRESHOLD:
                group.append(j)
                used.add(j)
        if len(group) > 1:
            used.update(group)
            groups.append(group)

    bursts = []
    for g in groups:
        *retries, rep = g            # LAST prompt = representative (the retry that worked)
        bursts.append({
            "atPrompt": prompts[rep][0],
            "retries": [prompts[k][1] for k in retries],
        })
    return bursts


def main():
    convos = json.load(open(IN))
    out, total = {}, 0
    for c in convos:
        b = find_bursts(c)
        out[c["id"]] = b
        total += len(b)
        if b:
            print(f"{c['id']} {c['title'][:40]:40s} → {len(b)} burst(s)")
    json.dump(out, open(OUT, "w"), indent=2, ensure_ascii=False)
    print(f"\n{total} burst groups across "
          f"{sum(1 for v in out.values() if v)} of {len(convos)} conversations")

if __name__ == "__main__":
    main()