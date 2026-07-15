"""
02_metadata.py — cheap facts about each conversation. No AI.
Reads conversations_clean.json, writes metadata.json keyed by convo id.
"""
import json, re
from pathlib import Path

IN = Path("data/out/conversations_clean.json")
OUT = Path("data/out/metadata.json")

convos = json.load(open(IN))
meta = {}
for c in convos:
    msgs = c["messages"]
    user_msgs = [m for m in msgs if m["role"] == "user"]
    meta[c["id"]] = {
        "message_count": len(msgs),
        "prompt_count": len(user_msgs),
        "total_chars": sum(len(m["text"]) for m in msgs),
        # code fences are a cheap "did this produce an artifact" signal
        "has_code": any("```" in m["text"] for m in msgs),
    }
json.dump(meta, open(OUT, "w"), indent=2)
print(f"wrote metadata for {len(meta)} conversations")