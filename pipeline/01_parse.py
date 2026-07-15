"""
01_parse.py — Stage 1 of the pipeline.

Job: turn ChatGPT's messy export format into ONE clean, simple JSON file
that every later stage can rely on. Nothing intelligent happens here —
no AI, no summarizing. Just normalizing, filtering, and numbering.

Why this stage matters: every later stage (tagging, segmentation, bursts,
the frontend itself) assumes clean input with stable prompt numbers.
Getting the numbering right ONCE, here, is what makes the "→ prompt 5"
chips in the interface land on the correct message later.
"""

import json
import datetime
from pathlib import Path

# ---------------------------------------------------------------
# PATHS
# ChatGPT shards big exports into conversations-000.json,
# conversations-001.json, etc. We read the whole folder rather than
# one file, so this works no matter how many shards you have.
# ---------------------------------------------------------------
RAW_DIR = Path("data/raw/exported_data")
OUT = Path("data/out/conversations_clean.json")

# ---------------------------------------------------------------
# SUBSET CONTROLS — the three knobs you edit by hand.
# The goal is a curated demo subset (30–80 convos), not your whole life.
# ---------------------------------------------------------------
DATE_FROM = "2026-04-01"   # ignore anything older than this (tune to hit 30–80 kept)
MIN_PROMPTS = 2            # a convo with 1 user prompt has no "history" to navigate; drop it
EXCLUDE_IDS = []           # privacy pass: paste ids of convos you don't want on a projector


def walk_final_path(convo):
    """
    Recover the conversation as you actually experienced it.

    WHY THIS EXISTS:
    ChatGPT does not store a conversation as a simple list. It stores a
    TREE called `mapping`: every message is a node with a `parent` pointer.
    Why a tree? Because every time you hit "regenerate" or edit a message,
    ChatGPT creates a BRANCH — the old reply still exists on a dead branch.

    The export also gives us `current_node`: the id of the final message
    on the branch you ended up on. So instead of untangling the whole tree,
    we start at the END and walk backwards parent-by-parent to the root.
    That backwards chain IS the final conversation — every dead branch is
    naturally skipped because nothing on the final path points to it.

    (Those skipped branches are literally retry attempts — future burst
    candidates. We're consciously discarding them for v1; that's the
    "branches flattened" line in your limitations list.)
    """
    mapping = convo.get("mapping", {})
    node_id = convo.get("current_node")   # start at the last message
    chain = []

    while node_id:                        # keep hopping to the parent until we fall off the root
        node = mapping.get(node_id)
        if node is None:                  # defensive: broken pointer in the export
            break

        msg = node.get("message")
        # Filter to real text messages only. The tree also contains
        # system nodes, tool calls, empty roots — none of which belong
        # in a transcript a human will read.
        if msg and msg.get("content", {}).get("content_type") == "text":
            role = msg.get("author", {}).get("role")
            # `parts` is a list of text chunks; join and strip them.
            parts = msg.get("content", {}).get("parts", [])
            text = "\n".join(p for p in parts if isinstance(p, str)).strip()
            # Keep only user/assistant turns with actual content
            # (drops "system" and empty placeholder messages).
            if role in ("user", "assistant") and text:
                chain.append({"role": role, "text": text})

        node_id = node.get("parent")      # hop one step toward the root

    # We walked end → start, so the chain is in reverse. Flip it so the
    # conversation reads top to bottom like it did on screen.
    return list(reversed(chain))


def main():
    # -----------------------------------------------------------
    # 1) LOAD all shards into one big list.
    # sorted() keeps shard order deterministic; it doesn't actually
    # matter for correctness since we filter by date, but deterministic
    # scripts are easier to debug.
    # -----------------------------------------------------------
    files = sorted(RAW_DIR.glob("conversations-*.json"))
    raw = []
    for f in files:
        raw.extend(json.load(open(f)))
    print(f"loaded {len(raw)} conversations from {len(files)} files")

    out = []
    for c in raw:
        # -------------------------------------------------------
        # 2) DATE FILTER.
        # ChatGPT stores create_time as a unix timestamp (seconds since
        # 1970). We convert it to ISO format ("2026-03-12T18:44:00")
        # because that's human-readable, sortable as a plain string,
        # and what the frontend's date field expects.
        # -------------------------------------------------------
        ts = c.get("create_time")
        created = datetime.datetime.fromtimestamp(ts).isoformat() if ts else ""
        if created[:10] < DATE_FROM:      # string compare works because ISO dates sort naturally
            continue

        # -------------------------------------------------------
        # 3) ID + PRIVACY FILTER.
        # We truncate ids to 8 chars — long enough to be unique in a
        # subset this small, short enough to read in debug output.
        # -------------------------------------------------------
        cid = (c.get("conversation_id") or c.get("id") or "")[:8]
        if cid in EXCLUDE_IDS:
            continue

        # -------------------------------------------------------
        # 4) FLATTEN the tree into the final message list (see above).
        # -------------------------------------------------------
        msgs = walk_final_path(c)

        # -------------------------------------------------------
        # 5) PROMPT NUMBERING — the most important lines in this file.
        # We give every USER message a sequential prompt_n (1, 2, 3…).
        # Assistant messages get no number.
        #
        # Why user messages only: the interface's chips say "→ prompt 5",
        # matching how it was sketched — decisions point back to the
        # prompts that produced them. This numbering is assigned exactly
        # ONCE, here, and every later stage cites it. If two stages ever
        # numbered independently, they'd drift and every deep-link would
        # silently point at the wrong message.
        # -------------------------------------------------------
        clean, prompt_n = [], 0
        for i, m in enumerate(msgs):
            entry = {"idx": i, "role": m["role"], "text": m["text"]}
            if m["role"] == "user":
                prompt_n += 1
                entry["prompt_n"] = prompt_n
            clean.append(entry)

        # -------------------------------------------------------
        # 6) SIZE FILTER — after flattening, because only now do we know
        # the real prompt count. One-prompt chats ("convert this file")
        # have nothing to summarize, segment, or link into.
        # -------------------------------------------------------
        if prompt_n < MIN_PROMPTS:
            continue

        out.append({
            "id": cid,
            "title": c.get("title") or "Untitled",
            "created_at": created,
            "messages": clean,
        })

    # -----------------------------------------------------------
    # 7) WRITE the clean file. ensure_ascii=False keeps any non-English
    # text readable in the JSON instead of \u escapes; indent=2 makes
    # the file human-inspectable — you should actually open and read it.
    # -----------------------------------------------------------
    OUT.parent.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(OUT, "w"), indent=2, ensure_ascii=False)

    # -----------------------------------------------------------
    # 8) SANITY REPORT — the script proves its own output to you.
    # You read this list for the privacy pass and to tune DATE_FROM.
    # -----------------------------------------------------------
    dates = sorted(x["created_at"][:10] for x in out)
    counts = sorted(len(x["messages"]) for x in out)
    print(f"kept {len(out)} conversations")
    print(f"date range: {dates[0]} → {dates[-1]}")
    print(f"median messages: {counts[len(counts)//2]}")
    for x in out:
        print(" ", x["id"], x["created_at"][:10], x["title"][:60])


if __name__ == "__main__":
    main() 