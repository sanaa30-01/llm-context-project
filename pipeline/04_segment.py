"""
04_segment.py — Stage 4: split each substantive conversation into segments.

Feeds Level 4 of the interface (the segmented view).

Key design decision: we NEVER trust the model's ranges. Small models are
decent at "where do topics shift" and sloppy at bookkeeping, so the model
proposes boundaries and CODE repairs them into valid, gap-free, ordered
coverage. If repair fails, we fall back to one segment covering everything
— an honest, always-valid default.
"""
import json, time
from pathlib import Path
import ollama

MAX_TOTAL_CHARS = 12000 

MODEL = "qwen2.5:7b-instruct"
IN = Path("data/out/conversations_clean.json")
TAGS = Path("data/out/tags.json")
OUT = Path("data/out/segments.json")
PROMPT = Path("pipeline/prompts/segment.txt").read_text()

# Segmentation must see EVERY prompt, so we clip per-message instead of
# dropping messages like 03 did.
MAX_CHARS_USER = 300
MAX_CHARS_ASSISTANT = 150


def render_full(convo):
    """Every message included; each clipped hard. The model needs the
    shape of the whole conversation more than it needs the details."""
    lines = []
    for m in convo["messages"]:
        if m["role"] == "user":
            lines.append(f"[prompt {m['prompt_n']}] user: {m['text'][:MAX_CHARS_USER]}")
        else:
            lines.append(f"assistant: {m['text'][:MAX_CHARS_ASSISTANT]}")
    text = "\n\n".join(lines)
    if len(text) > MAX_TOTAL_CHARS:
        # clip assistant messages harder first — boundaries live in user prompts
        lines = [l[:120] if l.startswith("assistant:") else l for l in lines]
        text = "\n\n".join(lines)[:MAX_TOTAL_CHARS]
    return text 


def repair(segments, last_prompt):
    """
    Force the model's proposal into a valid partition of [1, last_prompt]:
    ordered, non-overlapping, gap-free, full coverage.

    Strategy: trust the BOUNDARIES (starts), recompute the ends.
    Each segment ends where the next one starts. This absorbs the
    classic small-model errors (off-by-one ends, tiny gaps, overlaps)
    while keeping the model's actual judgment about where shifts happen.
    """
    if not segments:
        return None
    try:
        # keep segments with usable starts, sorted by start
        segs = sorted(
            [s for s in segments
             if isinstance(s.get("prompt_range"), list) and len(s["prompt_range"]) == 2],
            key=lambda s: s["prompt_range"][0],
        )
        if not segs:
            return None
        starts = []
        for s in segs:
            start = max(1, min(int(s["prompt_range"][0]), last_prompt))
            if not starts or start > starts[-1]:      # drop duplicate/backward starts
                starts.append(start)
        starts[0] = 1                                  # coverage must begin at prompt 1
        repaired = []
        for i, s in enumerate(segs[:len(starts)]):
            start = starts[i]
            end = (starts[i + 1] - 1) if i + 1 < len(starts) else last_prompt
            if end < start:
                continue
            repaired.append({
                "label": (s.get("label") or "Segment").strip()[:40],
                "prompt_range": [start, end],
                "summary": (s.get("summary") or "").strip()[:300],
            })
        return repaired or None
    except Exception:
        return None


def main():
    convos = json.load(open(IN))
    tags = json.load(open(TAGS))
    done = json.load(open(OUT)) if OUT.exists() else {}
    fallbacks = 0
    client = ollama.Client(timeout=120)   # 120s cap per conversation 

    for i, c in enumerate(convos):
        if c["id"] in done:
            continue
        # incidental conversations don't get segments — their cards go
        # straight to the transcript, exactly like the misc dots in Lovable
        if tags.get(c["id"], {}).get("significance") == "incidental":
            done[c["id"]] = {"segments": []}
            json.dump(done, open(OUT, "w"), indent=2, ensure_ascii=False)
            continue

        last_prompt = max(m["prompt_n"] for m in c["messages"] if m["role"] == "user")
        t0 = time.time()
        try:
            resp = client.chat(
                model=MODEL, format="json", options={"temperature": 0.2},
                messages=[
                    {"role": "user", "content":
                        "TRANSCRIPT START\n<<<\n"
                        + render_full(c)
                        + "\n>>>\nTRANSCRIPT END\n\n"
                        + PROMPT},
                ],
            )
            parsed = json.loads(resp["message"]["content"])
            proposed = parsed.get("segments") if isinstance(parsed, dict) else None
            if not isinstance(proposed, list) or not proposed:
                # model got hijacked by transcript content — one corrective retry
                resp = client.chat(
                    model=MODEL, format="json", options={"temperature": 0.2},
                    messages=[{"role": "user", "content":
                        "TRANSCRIPT START\n<<<\n" + render_full(c) + "\n>>>\nTRANSCRIPT END\n\n"
                        + PROMPT
                        + '\n\nYour previous reply used the wrong schema. Reply ONLY with '
                          '{"segments": [...]} as specified.'}],
                )
                parsed = json.loads(resp["message"]["content"])
                proposed = parsed.get("segments") if isinstance(parsed, dict) else []
            segs = repair(proposed or [], last_prompt) 
        except Exception as e:
            print(f"[{i+1}/{len(convos)}] {c['id']} model error: {e}")
            segs = None

        if segs is None:                # honest fallback: one segment, whole convo
            segs = [{"label": "Full conversation", "prompt_range": [1, last_prompt],
                     "summary": tags.get(c["id"], {}).get("one_liner", "")}]
            fallbacks += 1

        done[c["id"]] = {"segments": segs}
        json.dump(done, open(OUT, "w"), indent=2, ensure_ascii=False)
        print(f"[{i+1}/{len(convos)}] {c['id']} → {len(segs)} segments ({time.time()-t0:.1f}s)")

    print(f"\nsegmented {len(done)}/{len(convos)}, fallbacks: {fallbacks}")

if __name__ == "__main__":
    main()