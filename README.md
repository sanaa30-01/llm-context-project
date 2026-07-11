# llm-context-project

building a tool that compresses chat histories - subject to change

# Chat history navigator — prototype build plan

**Goal:** a clickable prototype on a small slice of real exported chat data that demonstrates one complete flow:

> open app → see thread lanes over time → click a thread → living state card opens → click a source chip → see the original conversation.

**Explicitly out of scope for v1:** semantic zoom canvas, streamgraph, embedding clusters, automatic thread induction at scale, live syncing, anyone's data but yours. Write these down and say them to your mentor — a tight scope is a feature.

**Total time estimate:** ~2 weeks part-time (Phases overlap fine).

---



## Phase 0 — Decisions before touching code (30 min)

1. **The demo sentence.** Everything you build must serve: *"I can answer 'what did I decide about X and why' from months of history in under 30 seconds, with proof."* If a task doesn't serve that sentence, cut it.
2. **Dataset size:** 30–80 conversations covering 2–4 real projects plus some incidental noise. Small on purpose — big enough to show bursts and threads, small enough to hand-verify everything.
3. **Architecture:** offline Python pipeline → one `enriched.json` → static React app. **No backend, no database.** This mirrors PhotoDance exactly (offline enrichment, client-side rendering) and removes 80% of possible failure points.

---



## Phase 1 — Get and clean the data (Day 1)

1. **Export.** Claude: Settings → Privacy → Export data (JSON arrives by email). ChatGPT: Settings → Data controls → Export. Pick one source for v1; mixing formats doubles parsing work for zero demo value.
2. **Privacy pass FIRST.** You will screen-share this with your mentor. Skim the export and delete anything personal/sensitive from your working subset *now*, not the night before the demo. Also add `/data` to `.gitignore` immediately — this is your actual life.
3. **Write** `01_parse.py`**.** Normalize the export into one clean schema and save as `data/conversations_clean.json`:

```json
{
  "id": "c_014",
  "title": "EMG window size debugging",
  "created_at": "2026-03-02T18:44:00Z",
  "updated_at": "2026-03-02T19:20:00Z",
  "messages": [
    {"idx": 0, "role": "user", "text": "...", "ts": "..."}
  ]
}
```

Expect format quirks (nested `chat_messages`, sender fields, branched/regenerated messages). Flatten branches by taking the final path — note this as a known simplification.

1. **Sanity check:** print count, date range, median message count. If the subset doesn't span at least ~2 months, the lanes view will look empty — pick a wider slice.

**Done when:** one clean JSON file, loadable in 3 lines of Python.

---



## Phase 2 — Enrichment pipeline (Days 2–4)

This is your equivalent of PhotoDance's four offline stages. One numbered script per stage; each reads the previous output and writes its own. Re-runnable, debuggable, and it *demos well* — you can literally show the pipeline to your mentor stage by stage.

### 02_metadata.py — cheap metadata (no LLM)

Per conversation: message count, total chars, duration, day-of-week, has-code-blocks (regex ``` fences), user/assistant turn ratio. Free, instant, and powers tooltips.

### 03_tag.py — LLM tagging

One API call per conversation (Haiku-class model — this is a classification task; total cost for 80 conversations is on the order of a dollar or two). Prompt returns **JSON only**:

```json
{
  "topic_label": "3-6 words",
  "project_guess": "short name or 'misc'",
  "entities": ["..."],
  "significance": "substantive | incidental",
  "decisions": [{"claim": "...", "message_idxs": [4, 11]}],
  "open_questions": [{"claim": "...", "message_idxs": [17]}]
}
```

Practical notes:

- Truncate long conversations: first ~15 + last ~15 messages is usually enough for tagging.
- Require `message_idxs` on every decision/question **at this stage** — provenance is cheapest to capture per-conversation, nearly impossible to recover later.
- Strip markdown fences before `json.loads`; retry once on parse failure; log failures and move on.



### 04_threads.py — thread assignment (semi-manual, on purpose)

1. Auto-suggest: group by `project_guess`.
2. Then hand-correct in a plain `threads.json` mapping (`{"c_014": "emg-piano", ...}`).

At 30–80 conversations, manual correction takes 20 minutes and gives you *correct* threads, which makes everything downstream look good. Say this openly to your mentor: automatic thread induction is one of the actual research questions; the prototype uses human-in-the-loop assignment, which is also exactly PhotoDance's curatorial loop (human decisions in the overview feed the composed views).

### 05_bursts.py — burst collapse (your novel bit — don't skip)

1. Embed each conversation's title + first user message (API embeddings or `sentence-transformers` locally).
2. Within each thread: pairs with cosine similarity above a threshold (start ~0.85, tune by eye) **and** within a 48h window → burst group.
3. Representative = longest conversation in the group. Others get `collapsed_into: <rep_id>` — kept, not deleted.
4. Print the count. "Collapsed 14 of 62 conversations into 5 bursts" is a demo line.



### 06_state_cards.py — living state card per thread

1. Input per thread: the *tagged summaries* (not raw transcripts) in chronological order, plus each conversation's decisions/questions with their sources.
2. One call per thread (use a stronger model here — Sonnet-class; there are only 2–4 threads):

```json
{
  "thread": "emg-piano",
  "current_decisions": [{"claim": "...", "source_convs": ["c_009"], "superseded": ["c_004"]}],
  "open_questions": [{"claim": "...", "source_convs": ["c_013"]}],
  "evolving_values": [{"name": "classifier accuracy", "trajectory": [["c_006","71%"],["c_014","89%"]]}],
  "last_updated": "..."
}
```

1. **Hard rule: any claim without a** `source_convs` **entry gets dropped in code.** This is your anti-hallucination mechanism and the single most defensible design decision in the prototype.



### 07_bundle.py — merge everything into `data/enriched.json`

Conversations (with metadata, tags, thread, burst info) + threads (with state cards). This one file is the entire frontend contract.

**Done when:** `enriched.json` exists and you've read it top to bottom with your own eyes.

---



## Phase 3 — Frontend (Days 5–9)

**Stack:** React + Vite + TypeScript, plain SVG for the lanes (at <100 conversations you don't need D3 or canvas — a `<rect>` per tick is fine; use `d3-scale` alone for the time axis if you want). Import `enriched.json` directly.

Build in this exact order — each step is independently demoable, so you always have *something* working:

1. **Lanes view.** X = time scale across the full date range. One lane per thread, ordered by most-recently-active. One tick `<rect>` per representative conversation. Incidental lane at the bottom, dimmed. Burst representatives get a small "×3" badge.
2. **Hover tooltip:** title, date, topic label, message count. (Cheap, makes it feel alive immediately.)
3. **Click thread label → state card** slides in as a right-side panel: current decisions, open questions, evolving values (render the trajectory as `71% → 84% → 89%`), each claim with its source chips.
4. **Click source chip → conversation view.** Simple transcript modal. If you kept `message_idxs`, scroll to and highlight the cited message — this moment (claim → exact message) is the strongest 5 seconds of your demo. If highlighting is fiddly, conversation-level linking is acceptable for v1.
5. **Click a burst tick → expand its members** inline or in a popover. One click that demonstrates the burst-collapse idea.
6. **Only if time remains:** brushing the time axis to zoom, thread filter toggles. Nothing else.

Skip: routing, auth, settings, responsiveness beyond your laptop, dark mode.

---



## Phase 4 — Validate and prep the demo (Days 10–12)

1. **Re-finding test on yourself.** Write 5 questions about your own history *before* opening the tool ("what did I decide about IMU filtering?", "when did SpawnCast go dormant?"). Time yourself answering with the prototype vs. the app's native search. Record wins AND losses — the losses are research findings, not embarrassments.
2. **Hallucination audit.** For every claim on every state card, open the source conversation and verify it. With 2–4 threads this is under an hour. Report it as a number: "17/19 state-card claims verified correct against sources." A PhD student will trust the whole project more because of this one number.
3. **Demo script (3 minutes):** lanes overview ("my last 5 months, 62 conversations, 4 threads") → point at a burst ("these 4 are one collapsed retry burst") → click into a thread ("here's its current state, not a transcript") → click a source chip ("and here's the proof"). End with the limitations list.
4. **Known-limitations list (say them before he does):** thread assignment is human-corrected; conversation "thumbnail" problem untouched; N is small; state cards are only as fresh as the last pipeline run; branched conversations flattened.

---



## Repo structure

```
chat-history-navigator/
├── pipeline/
│   ├── 01_parse.py ... 07_bundle.py
│   └── prompts/          (tagging + state card prompts as .txt — versionable)
├── app/                  (Vite React app)
│   └── src/ (LanesView.tsx, StateCard.tsx, ConversationModal.tsx, Tooltip.tsx)
├── data/                 (GITIGNORED — your personal history lives here)
└── README.md             (the demo script + limitations list live here)
```



## Risks, honestly ranked

1. **State cards come out generic or wrong** (highest risk, highest visibility). Mitigations: summaries-in not transcripts-in, source-required claims, hallucination audit, start with your smallest thread.
2. **Bad thread assignment poisons everything downstream.** Mitigation: the manual correction pass — do not skip it to seem more "automatic."
3. **Over-building the pipeline.** Hardcode thresholds, hardcode thread names if needed. The demo is the *interaction*; nobody is grading your infra.
4. **Export format surprises** eat Day 1. Mitigation: budget the whole day for parsing; it's boring and it's fine.

