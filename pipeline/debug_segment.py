# pipeline/debug_segment.py
import json
import ollama
from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location("seg", "pipeline/04_segment.py")
seg = importlib.util.module_from_spec(spec); spec.loader.exec_module(seg)

convos = json.load(open("data/out/conversations_clean.json"))
tags = json.load(open("data/out/tags.json"))
# pick the first substantive conversation with plenty of prompts
c = next(c for c in convos
         if tags.get(c["id"], {}).get("significance") == "substantive"
         and sum(1 for m in c["messages"] if m["role"] == "user") >= 6)
last = max(m["prompt_n"] for m in c["messages"] if m["role"] == "user")
print("testing on:", c["id"], c["title"][:50], f"({last} prompts)\n")

resp = ollama.Client(timeout=120).chat(
    model=seg.MODEL, format="json", options={"temperature": 0.2},
    messages=[{"role": "system", "content": seg.PROMPT},
              {"role": "user", "content": seg.render_full(c)}])
raw = resp["message"]["content"]
print("=== RAW MODEL OUTPUT ===")
print(raw[:2000])
parsed = json.loads(raw)
proposed = parsed.get("segments", []) if isinstance(parsed, dict) else parsed
print("\n=== AFTER repair() ===")
print(json.dumps(seg.repair(proposed, last), indent=2))