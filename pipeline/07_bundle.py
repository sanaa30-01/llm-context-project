"""
07_bundle.py — final pipeline stage.

Merges every earlier stage into the EXACT shape the Figma Make frontend
consumes, validates it hard, and writes app/src/data/history.ts

No model calls. Pure assembly + validation. If this script prints "OK",
the frontend should work without touching its logic.

Reads:
  data/out/conversations_clean.json   (01_parse)
  data/out/metadata.json              (02_metadata)
  data/out/tags.json                  (03_tag)
  data/out/segments.json              (04_segment)
  data/out/bursts.json                (05_bursts)
  data/out/clusters.json              (06_clusters, phase A only)

Writes:
  data/out/history.json               (inspectable)
  app/src/data/history.ts             (what the app imports)
"""

import json
from pathlib import Path
import datetime 

OUT = Path("data/out")
TS_TARGET = Path("app/Frontend/src/data/history.ts")

# --- match these two names to whatever Figma Make generated ---
# Open the generated history.ts and copy its export names here.
EXPORT_TOPICS = "TOPICS"
EXPORT_CONVERSATIONS = "CONVERSATIONS"

# Colors assigned to clusters in descending size order.
PALETTE = ["#7C6FDE", "#2BA98C", "#E07B54", "#3D8BD4", "#C4699E"]
MISC_COLOR = "#A9A79E"
TOPIC_SUMMARIES = {
    "math": "Linear algebra coursework — eigenvectors, row reduction, subspaces, and projections.",
    "jobs": "Applications and outreach — resumes, cover letters, and messages to labs and mentors.",
    "media-psychology": "Psychology read through film and television for The Cognitive Script.",
    "education": "Education coursework and essays.",
    "humanities": "MMW coursework and religious history essays.",
    "misc": "One-off quick-answer sessions that produced no structured decisions.",
}

# Keep the .ts file a sane size; long pastes get clipped in the transcript.
MAX_MSG_CHARS = 1500
PROMPT_SUMMARY_CHARS = 95
DETAIL_CHARS = 150


def load(name):
    p = OUT / name
    if not p.exists():
        raise SystemExit(f"missing {p} — run that stage first")
    return json.load(open(p))


def squash(s, n):
    """Collapse whitespace and truncate with an ellipsis."""
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "\u2026"


def prettify(slug):
    """job-apps -> Job apps"""
    return slug.replace("-", " ").replace("_", " ").strip().capitalize()


def main():
    convos = load("conversations_clean.json")
    meta = load("metadata.json")
    tags = load("tags.json")
    segs = load("segments.json")
    bursts = load("bursts.json")
    clusters = load("clusters.json")

    # ---------------------------------------------------------------
    # TOPICS — biggest clusters get the strongest colors; misc is last
    # ---------------------------------------------------------------
    counts = {}
    for cid, slug in clusters.items():
        counts[slug] = counts.get(slug, 0) + 1
    ordered = sorted(
        [s for s in counts if s != "misc"], key=lambda s: -counts[s]
    )
    topics = []
    for i, slug in enumerate(ordered):
        topics.append(
            {
                "id": slug,
                "label": prettify(slug),
                "color": PALETTE[i % len(PALETTE)],
                "summary": TOPIC_SUMMARIES.get(slug) or f"{counts[slug]} conversations",
            }
        )
    if "misc" in counts:
        topics.append({"id": "misc", "label": "Misc", "color": MISC_COLOR, "summary": TOPIC_SUMMARIES.get("misc", "")})
    topic_ids = {t["id"] for t in topics}

    if len(ordered) > 5:
        print(
            f"WARNING: {len(ordered)} non-misc clusters. More than ~5 crowds "
            "the L1 axis — consider merging in clusters.json."
        )

    # ---------------------------------------------------------------
    # CONVERSATIONS
    # ---------------------------------------------------------------
    out_convos = []
    problems = []

    for c in convos:
        cid = c["id"]
        t = tags.get(cid)
        if t is None:
            problems.append(f"{cid}: no tags entry — skipped")
            continue

        user_msgs = [m for m in c["messages"] if m["role"] == "user"]
        prompt_nums = {m["prompt_n"] for m in user_msgs}
        by_prompt = {m["prompt_n"]: m["text"] for m in user_msgs}
        last_prompt = max(prompt_nums) if prompt_nums else 0

        def claims(key, prefix):
            """tags.json decisions/open_questions -> frontend shape.

            The frontend card wants a short title (claim) AND a longer body
            (detail). 03_tag only produces the claim, so detail falls back to
            an excerpt of the prompt the claim came from — which doubles as
            provenance the user can read. If you later add a "detail" field
            to the tagging prompt, it is used instead.
            """
            items = []
            for i, d in enumerate(t.get(key, []) or []):
                refs = [r for r in d.get("prompt_refs", []) if r in prompt_nums]
                if not refs:
                    problems.append(
                        f"{cid}: dropped {key} claim with no valid refs"
                    )
                    continue
                detail = d.get("detail") or (
                    "From prompt %d: %s"
                    % (refs[0], squash(by_prompt.get(refs[0], ""), DETAIL_CHARS))
                )
                items.append(
                    {
                        "id": f"{cid}-{prefix}{i}",
                        "claim": squash(d["claim"], 90),
                        "promptRefs": refs,
                        "detail": detail,
                    }
                )
            return items

        my_bursts = bursts.get(cid, []) or []
        for b in my_bursts:
            if b["atPrompt"] not in prompt_nums:
                problems.append(f"{cid}: burst atPrompt {b['atPrompt']} invalid")

        # segments + hasBurst computed in code, never by the model
        out_segs = []
        for i, s in enumerate(segs.get(cid, {}).get("segments", []) or []):
            lo, hi = s["prompt_range"]
            if lo < 1 or hi > last_prompt or lo > hi:
                problems.append(f"{cid}: segment range {lo}-{hi} out of bounds")
                continue
            out_segs.append(
                {
                    "id": f"{cid}-g{i}",
                    "label": squash(s["label"], 40),
                    "promptRange": [lo, hi],
                    "summary": squash(s["summary"], 200),
                    "hasBurst": any(lo <= b["atPrompt"] <= hi for b in my_bursts),
                }
            )

        # L5 prompt cards. No per-prompt LLM summaries exist yet, so the
        # prompt's own opening words act as its summary. Swap this line if
        # you later add a prompt-summarization stage.
        prompts = [
            {"n": n, "summary": squash(by_prompt[n], PROMPT_SUMMARY_CHARS)}
            for n in sorted(prompt_nums)
        ]

        transcript = [
            {
                "role": m["role"],
                "text": squash(m["text"], MAX_MSG_CHARS),
                **({"promptN": m["prompt_n"]} if m["role"] == "user" else {}),
            }
            for m in c["messages"]
        ]

        cluster = clusters.get(cid, "misc")
        if cluster not in topic_ids:
            problems.append(f"{cid}: cluster '{cluster}' not in topics")
            cluster = "misc"

        out_convos.append(
            {
                "id": cid,
                "title": squash(t.get("title_improved") or c["title"], 45),
                "cluster": cluster,
                "date": datetime.date.fromisoformat(c["created_at"][:10]).strftime("%b %-d"),
                "oneLiner": squash(t.get("one_liner", ""), 140),
                "messageCount": meta.get(cid, {}).get(
                    "message_count", len(c["messages"])
                ),
                "summary": squash(t.get("summary", ""), 400),
                "decisions": claims("decisions", "d"),
                "openQuestions": claims("open_questions", "q"),
                "artifacts": [],  # no source in the pipeline yet — see notes
                "segments": out_segs,
                "bursts": my_bursts,
                "prompts": prompts,
                "transcript": transcript,
            }
        )

    out_convos.sort(key=lambda x: x["date"])

    # ---------------------------------------------------------------
    # WRITE
    # ---------------------------------------------------------------
    payload = {"topics": topics, "conversations": out_convos}
    (OUT / "history.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    TYPE_BLOCK = '''export type Decision   = { id: string; claim: string; promptRefs: number[]; detail: string };
    export type Segment    = { id: string; label: string; promptRange: [number, number]; summary: string; hasBurst?: boolean };
    export type Burst      = { atPrompt: number; retries: string[] };
    export type PromptItem = { n: number; summary: string };
    export type Message    = { role: "user" | "assistant"; text: string; promptN?: number };
    export type Conversation = {
    id: string; title: string; cluster: string; date: string;
    oneLiner: string; messageCount: number; summary: string;
    decisions: Decision[]; openQuestions: Decision[]; artifacts: Decision[];
    segments: Segment[]; bursts: Burst[];
    prompts: PromptItem[]; transcript: Message[];
    };
    export type Topic = { id: string; label: string; color: string; summary: string };
'''

    HELPERS = '''
    export function getTopicById(id: string): Topic | undefined {
    return TOPICS.find(t => t.id === id);
    }
    export function getConversationById(id: string): Conversation | undefined {
    return CONVERSATIONS.find(c => c.id === id);
    }
    export function getConversationsByTopic(topicId: string): Conversation[] {
    return CONVERSATIONS.filter(c => c.cluster === topicId);
    }
'''

    ts = (
        "// GENERATED by pipeline/07_bundle.py — do not edit by hand\n\n"
        + TYPE_BLOCK + "\n"
        + f"export const {EXPORT_TOPICS}: Topic[] = "
        + json.dumps(topics, indent=2, ensure_ascii=False) + ";\n\n"
        + f"export const {EXPORT_CONVERSATIONS}: Conversation[] = "
        + json.dumps(out_convos, indent=2, ensure_ascii=False) + ";\n"
        + HELPERS
    )
    if TS_TARGET.parent.exists():
        TS_TARGET.write_text(ts, encoding="utf-8")
        where = str(TS_TARGET)
    else:
        (OUT / "history.ts").write_text(ts, encoding="utf-8")
        where = str(OUT / "history.ts") + "  (app/ not found — copy manually)"

    # ---------------------------------------------------------------
    # REPORT
    # ---------------------------------------------------------------
    n_dec = sum(len(c["decisions"]) for c in out_convos)
    n_q = sum(len(c["openQuestions"]) for c in out_convos)
    n_seg = sum(len(c["segments"]) for c in out_convos)
    n_burst = sum(len(c["bursts"]) for c in out_convos)
    no_struct = [
        c["id"]
        for c in out_convos
        if not c["decisions"] and not c["openQuestions"] and not c["segments"]
    ]

    print(f"\ntopics: {len(topics)} -> {[t['id'] for t in topics]}")
    print(f"conversations: {len(out_convos)}")
    print(f"decisions: {n_dec} | open questions: {n_q}")
    print(f"segments: {n_seg} | bursts: {n_burst}")
    print(f"conversations with no structure (empty-state path): {len(no_struct)}")
    print(f"wrote {where}")
    print(f"file size: {len(ts)/1024:.0f} KB")

    if problems:
        print(f"\n{len(problems)} problems:")
        for p in problems[:20]:
            print("  -", p)
        if len(problems) > 20:
            print(f"  ... and {len(problems)-20} more")
    else:
        print("\nOK — every prompt reference, segment range and cluster resolves.")


if __name__ == "__main__":
    main() 