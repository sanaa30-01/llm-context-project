"""
03_tagging.py — Stage 3: LLM tagging via local Ollama.

For each conversation, one model call produces the card content:
one-liner, summary, topic, cluster guess, decisions, open questions.

Everything runs locally. Results save after EVERY conversation, so you
can Ctrl+C anytime and re-run — already-tagged convos are skipped.
"""
import json, time
from pathlib import Path
import ollama

MODEL = "qwen2.5:7b-instruct"          # change if you pulled a different model
IN = Path("data/out/conversations_clean.json")
OUT = Path("data/out/tags.json")
PROMPT = Path("pipeline/prompts/tag.txt").read_text()

# --- truncation controls: what the model actually reads ---
MAX_MSGS_EACH_END = 15                  # first 15 + last 15 messages
MAX_CHARS_PER_MSG = 600                 # long pastes get clipped


def render_transcript(convo):
    """
    Turn messages into plain text the model reads, with prompt numbers
    INLINE — this is how the model learns which number to cite.
      [prompt 3] user: should I include my GPA?
      assistant: It's genuinely mixed...
    """
    msgs = convo["messages"]
    if len(msgs) > 2 * MAX_MSGS_EACH_END:
        head, tail = msgs[:MAX_MSGS_EACH_END], msgs[-MAX_MSGS_EACH_END:]
        parts = head + [{"role": "system", "text": f"[... {len(msgs) - 2*MAX_MSGS_EACH_END} messages omitted ...]"}] + tail
    else:
        parts = msgs

    lines = []
    for m in parts:
        text = m["text"][:MAX_CHARS_PER_MSG]
        if m["role"] == "user":
            lines.append(f"[prompt {m['prompt_n']}] user: {text}")
        elif m["role"] == "assistant":
            lines.append(f"assistant: {text}")
        else:
            lines.append(m["text"])     # the "omitted" marker
    return "\n\n".join(lines)


def validate(tags, convo):
    """
    Enforce the hard rules in CODE, never trusting the model:
    - every prompt_ref must be a real prompt number in this conversation
    - claims that end up with no valid refs are DROPPED (and logged)
    This drop rule is the project's anti-hallucination mechanism.
    """
    valid_prompts = {m["prompt_n"] for m in convo["messages"] if m["role"] == "user"}
    dropped = []
    for key in ("decisions", "open_questions"):
        kept = []
        for item in tags.get(key, []) or []:
            refs = [r for r in item.get("prompt_refs", []) if r in valid_prompts]
            if refs:
                kept.append({"claim": item["claim"], "prompt_refs": refs})
            else:
                dropped.append((key, item.get("claim", "?")))
        tags[key] = kept
    if tags.get("significance") not in ("substantive", "incidental"):
        tags["significance"] = "substantive"
    return tags, dropped


def tag_one(convo):
    transcript = render_transcript(convo)
    resp = ollama.chat(
        model=MODEL,
        format="json",                  # constrains output to valid JSON
        options={"temperature": 0.2},   # extraction task: low creativity
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": f'Conversation title: "{convo["title"]}"\n\n{transcript}'},
        ],
    )
    return json.loads(resp["message"]["content"])


def main():
    convos = json.load(open(IN))
    done = json.load(open(OUT)) if OUT.exists() else {}
    total_dropped = []

    for i, c in enumerate(convos):
        if c["id"] in done:
            continue                    # resume support: skip already-tagged
        t0 = time.time()
        try:
            tags = tag_one(c)
            tags, dropped = validate(tags, c)
            total_dropped += dropped
            done[c["id"]] = tags
            json.dump(done, open(OUT, "w"), indent=2, ensure_ascii=False)  # save EVERY time
            print(f"[{i+1}/{len(convos)}] {c['id']} ok "
                  f"({time.time()-t0:.1f}s, {len(tags['decisions'])} dec, "
                  f"{len(tags['open_questions'])} oq)"
                  + (f" — dropped {len(dropped)} unref'd claims" if dropped else ""))
        except Exception as e:
            print(f"[{i+1}/{len(convos)}] {c['id']} FAILED: {e} — skipping")

    print(f"\ntagged {len(done)}/{len(convos)}")
    if total_dropped:
        print(f"dropped {len(total_dropped)} claims with invalid/missing prompt refs:")
        for key, claim in total_dropped[:10]:
            print(f"  - ({key}) {claim[:70]}")

if __name__ == "__main__":
    main()