PRD — Conversation History Navigator (stacked-axis branching interface)

1. What this is

A single-screen desktop web prototype for navigating an entire chatbot conversation history through stacked horizontal axes, where each axis is one level of abstraction. Clicking a node on any axis fans a branch down to the axis below it. Levels above the deepest open level collapse into thin strips, so the user always sees their full path while reading detail only at the bottom.

The defining property: summary text is part of the visualization, not a side panel. At the deepest open level, every node carries a card beneath it containing real summary content.

All data is hardcoded (provided in full in section 12). No backend, no authentication, no API calls, no database, no file uploads, no routing library required.

2. Global constraints


React + TypeScript, single page. All data in one file: src/data/history.ts.
Desktop only, designed for 1440 × 900. Do not build tablet or mobile layouts. Do not build responsive breakpoints.
Everything is mouse-driven; keyboard support is limited to what section 11 specifies.
No dark mode. Light theme only.
No horizontal page scrolling ever. Vertical page scrolling is allowed and expected when many levels are open.
No external icon libraries. The only glyphs used are the text characters ⟳, ›, ✕.


3. Design system

Colors — surfaces and text


Page background: #FAFAF7
Card / panel background: #FFFFFF
Recessed background (strips, chat area): #F4F3EF
Hairline border: #E5E3DE
Strong border (hover): #D3D1C9
Text primary: #1F1F1D
Text secondary: #5C5B56
Text muted: #96948C


Colors — topic accents. Each topic owns one accent color, used for its nodes, its branch connectors, its card tag pills, and its label text.


job-apps → #7C6FDE
emg-piano → #2BA98C
spawncast → #E07B54
misc → #A9A79E


Tag pill background = accent at 12% opacity; tag pill text = the accent itself.

Typography. Inter, or system sans-serif fallback.


Level label (left gutter): 12px, weight 400, text muted, right-aligned
Node label: 12px, weight 400 (weight 500 when the node is active)
Card title: 13px, weight 500, text primary, line-height 1.35
Card body: 12px, weight 400, text secondary, line-height 1.5
Tag pill: 11px, weight 500
Breadcrumb: 12px, weight 400
Never render text below 11px.


Geometry and motion


Card radius 10px, pill radius 10px, button radius 8px
Card border: 1px solid hairline. Card hover border: strong border. No shadows anywhere except the tooltip (section 10.4).
All state transitions 180ms ease-out. Connector lines draw in over 200ms. No spring or bounce easing.


4. Screen structure

Three stacked regions, top to bottom:


Header bar — 56px tall, white, 1px bottom hairline, full width. Contents left to right: the title "History Navigator" (14px, weight 500); then the breadcrumb (section 9); then pushed to the right edge, the Level 3 mode toggle (section 8) and a ghost "Reset" button.
Level stack — the main region, padding 24px 32px. Contains the level rows and connector strips.
There is no footer, no sidebar, no settings panel.


Left gutter. Every level row reserves a fixed 120px column on the left for its level label (e.g. L2 · conversations), right-aligned, vertically aligned to the axis line. Connector strips are indented to start at x = 120px so they align with the content column. The content column is everything to the right of the gutter.

5. The level model

Six levels exist. Which levels are visible depends on state, and Level 3 has two modes that produce two different chains:

Decisions mode (default) — 6 levels

LevelLabelNodes areL1L1 · topicsTopics (clusters)L2L2 · conversationsConversations inside the open topicsL3L3 · categoriesCurrent decisions / Open questions / ArtifactsL4L4 · itemsThe individual decisions or questionsL5L5 · promptsEvery user prompt in the conversationL6L6 · full chat(not an axis — a transcript panel)

Segments mode — 5 levels

LevelLabelNodes areL1L1 · topicsTopicsL2L2 · conversationsConversationsL3L3 · segmentsSegments of the conversationL4L4 · promptsEvery user prompt in the conversationL5L5 · full chat(transcript panel)

Segments mode is deliberately one level shorter. The mode is the user's choice and is toggled in the header.

6. Level rows — two visual states

Every level row is rendered in one of exactly two states.

6.1 Expanded (only the single deepest open axis level)

Structure inside the content column:


Axis line — a 1px hairline running the full width of the content column, positioned at the vertical center of the node row.
Node row — nodes distributed evenly across the width (see 6.3 for grouping). Node = 14px circle in the topic accent color. Below each node, its label: 12px, centered, max 2 lines, ellipsis after. Gap between node and label: 6px.
Card row — 12px below the labels. One card per node, each card horizontally aligned to its node, cards separated by 8px gutters, each card min-width 150px and otherwise flexing to fill.


Card contents, top to bottom: title (the node's label, repeated), body (the summary text, max 4 lines then ellipsis), and optionally one tag pill (prompt reference, prompt range, or burst indicator).

6.2 Collapsed (every level above the deepest)

A thin strip, total height 36px:


Axis line as above.
Nodes are 9px circles at 40% opacity, except the node on the active path, which is full opacity with a 3px ring in its accent color at 25% opacity.
Only the active-path node shows a label (12px, weight 500, one line, ellipsis). All other nodes show no label.
No cards.


6.3 Node grouping and horizontal partitioning

On L1, all topic nodes sit in one group spread evenly across the full content column width.

On L2, the content column is partitioned into one group per open topic. Each group's width is proportional to how many conversations it contains (a topic with 3 conversations gets 3 units of width, one with 2 gets 2 units). Groups are separated by a 1px dashed vertical divider in hairline color, running the full height of the row. Within a group, that topic's conversation nodes spread evenly.

On L3 and deeper, there is always exactly one group, because only one conversation is ever drilled into (see section 7.2).

7. Branching behavior

7.1 Level 1 → Level 2: multiple simultaneous branches

Clicking a topic node toggles it open or closed. Multiple topics can be open at once. When two or more are open, L2 partitions as described in 6.3 and each group's nodes and connectors use that topic's accent color. This is the "all topics branch out simultaneously" behavior.

Closing a topic removes its group from L2. If the currently active conversation belonged to that topic, all levels below L2 collapse and clear.

7.2 Level 2 and below: one active path

Only one conversation may be drilled below L2 at a time. Clicking a conversation node makes it the active conversation, opens L3, and clears any L4/L5/L6 state. Other open topics keep their L2 groups visible, but do not drill deeper.

Rationale to state plainly if asked: two parallel paths drilling to card-bearing depth cannot both fit at 1440px. Parallel exploration is preserved at the topic and conversation levels, where comparison actually matters.

7.3 Deeper levels


L3 node click → opens L4 with that node's children, clears L5/L6.
L4 node click (decisions mode) → opens L5, clears L6.
L5 (or L4 in segments mode) prompt node click → opens the transcript panel.
Clicking an already-active node collapses everything below it (a toggle).


7.4 Cross-level highlight

When an L4 item is active in decisions mode, the L5 prompt node(s) matching its promptRefs render with a filled ring in the accent color. This is the visual link from a claim to its evidence and must be present.

8. Level 3 mode toggle

Two small segmented buttons in the header: Decisions and Segments. The active one has an accent-neutral dark fill (#1F1F1D background, white text); the inactive one is a ghost button.

Switching modes preserves L1 and L2 state (open topics, active conversation) and clears L3 and everything below. The level labels and the chain update per section 5.

9. Breadcrumb

Sits in the header, left of the mode toggle. Format:

Job apps + EMG piano  ›  Cover letter drafts  ›  Current decisions  ›  Variant B, under 250 words  ›  full chat

Rules:


Open topics are joined with +. Separator between levels is  ›  in text muted.
Each crumb is clickable and collapses the view back to that level.
When nothing is open, show the hint text: Click a topic to branch in text muted.
Truncate any single crumb over 30 characters with an ellipsis.


10. Connectors, hover, tooltips, bursts

10.1 Connector strips

Between every pair of adjacent visible levels sits a 24px-tall strip. For each parent→child relationship it draws a cubic bezier from the parent node's center (top of the strip) to the child node's center (bottom of the strip), with control points that keep the curve mostly vertical: M x1,0 C x1,16 x2,8 x2,24. Stroke 1.2px, the branch's accent color, 60% opacity. Curves draw in over 200ms when a branch opens.

10.2 Hover on nodes

Node scales to 1.3× over 180ms. A tooltip appears (10.4). Cursor is pointer.

10.3 Hover on cards

Border changes to strong border. Cursor is pointer. Clicking a card does exactly what clicking its node does.

10.4 Tooltip

Appears 10px above the hovered node, after a 120ms delay, and disappears immediately on mouse-out. White, 1px hairline border, radius 8px, 0 2px 8px rgba(0,0,0,0.08) shadow, padding 8px 10px, max-width 260px, pointer-events: none. Contents: title (13px weight 500) and the one-line summary (12px secondary). On L2 nodes this tooltip is the primary way the one-liner is read while the level is collapsed, so it must work on collapsed strips too.

10.5 Bursts

A prompt that is a burst representative shows a tag pill on its card reading ⟳ 2 retries collapsed (with the real count). Clicking that pill expands, inside the same card, the retry prompt texts as 11px lines in text muted, each prefixed retry —, with the pill relabeling to ⟳ hide retries. A segment containing a burst shows ⟳ burst appended to its prompt-range pill.

11. Transcript panel (final level)

Not an axis. A full-width panel in the content column, recessed background, radius 10px, padding 16px 20px, max-height 420px with internal vertical scroll.


Header row: L6 · full chat (or L5 · full chat in segments mode) in text muted 12px, and a ghost ✕ button at the right that closes the panel.
User messages: right-aligned, white background, radius 10px, padding 8px 12px, max-width 70%. A 11px muted label sits above each: prompt 4.
Assistant messages: left-aligned, no bubble, plain text on the recessed background, full width, text secondary.
On open, auto-scroll so the prompt the user clicked sits in the upper third, and flash a 2px outline in the accent color on that message, fading over 2 seconds.
Segment dividers: a hairline rule with a centered 11px muted label, e.g. — Segment 2 · Chose variant B —.


12. Fake data

Put all of this in src/data/history.ts. It is deliberately shaped to match a real pipeline output, so swapping in real data later is a file replacement.

tsexport type Decision   = { id: string; claim: string; promptRefs: number[]; detail: string };
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

export type Topic = { id: string; label: string; color: string };

12.1 Topics

job-apps    "Job apps"     #7C6FDE
emg-piano   "EMG piano"    #2BA98C
spawncast   "SpawnCast"    #E07B54
misc        "Misc"         #A9A79E

12.2 Conversations — light entries

Give each of these: id, title, cluster, date, oneLiner, messageCount. Give each a prompts array of 4–6 plausible entries, a 6-message transcript, 1–2 decisions, 1 openQuestion, and 2–3 segments so every path is navigable. Content can be brief but must be specific — never lorem ipsum, never "Discussion about the topic."

job-apps


j1 "Resume reorder" · Apr 5 · 12 msgs · Restructured the resume to lead with lab research instead of coursework.
j3 "Interview prep" · Apr 20 · 18 msgs · Behavioral question drills and a portfolio walkthrough plan.
j4 "Cold email to lab director" · Apr 22 · 8 msgs · Drafted a short intro email referencing a specific paper.


emg-piano


e1 "Feature extraction" · Apr 12 · 16 msgs · Compared RMS against spectral features for gesture detection.
e2 "SVM vs CNN latency" · Apr 15 · 22 msgs · Benchmarked both models and chose SVM for real-time latency.
e3 "Electrode debugging" · May 2 · 14 msgs · Traced a noisy channel to placement rather than hardware.


spawncast


s1 "NOAA dataset schema" · May 10 · 10 msgs · Mapped the dataset structure before starting any modeling.
s2 "Random forest baseline" · May 12 · 20 msgs · Built a first baseline and read the feature importances.


misc (these have NO decisions, NO openQuestions, NO segments — see 12.4)


m1 "Convert HEIC to PNG" · Apr 9 · 4 msgs · One-off file conversion question.
m2 "Regex for timestamps" · Apr 28 · 6 msgs · Quick pattern fix for log parsing.
m3 "Timezone conversion" · May 6 · 4 msgs · Single-answer scheduling question.


12.3 The hero conversation — j2, build completely


title: "Cover letter drafts" · cluster job-apps · date Apr 8 · messageCount 22
oneLiner: Three near-identical attempts, then settled on the shorter variant B.
summary: The user drafted a cover letter for a UX research internship. After three closely similar first attempts, they chose a shorter variant under 250 words, kept the interface-study line as the opening hook, and cut the closing paragraph. Whether to mention GPA and how to format the portfolio were both left unresolved.


decisions

idclaimpromptRefsdetaild1Variant B, under 250 words[5]Chose the shorter draft after three near-identical attempts produced the same structure.d2Open with the interface-study line[4]Kept the specific reference to the lab's interface study as the first sentence.d3Cut the third paragraph[6]Removed the generic closing paragraph entirely to hit the length target.

openQuestions

idclaimpromptRefsdetailq1Whether to include GPA[7]Raised and discussed; no conclusion reached. Depends on the specific lab.q2Portfolio: one case study or four projects[10]Weighed depth against range. Left open at the end of the conversation.

artifacts

idclaimpromptRefsdetaila1Final cover letter text[6]The variant B text as confirmed at prompt 6.

segments

idlabelpromptRangesummaryhasBurstg1Draft attempts[1, 5]Three closely similar requests for a first draft, then a length correction.trueg2Chose variant B[6, 8]Compared the two variants and locked the shorter one as final.falseg3GPA and portfolio[9, 11]Two open questions raised near the end, neither resolved.false

bursts: one entry — atPrompt: 4, retries: [ "Write me a cover letter for this UX research internship, make it professional", "Can you redo that cover letter but less generic and more specific to the lab" ]

prompts (11 entries; these are the L5 cards)

nsummary1Described the internship and asked where to start.2Asked what the letter should emphasize.3Asked for the tone to be less formal.4Asked for a cover letter tied to the lab's interface work.5Asked for a tighter version under 250 words.6Confirmed variant B as final.7Asked whether to include GPA at all.8Said they would think about the GPA question.9Asked when to send the application.10Asked whether the portfolio should be one case study or four projects.11Asked for a final proofread.

transcript: 22 messages alternating user/assistant, with promptN set on each user message 1–11, matching the prompt summaries above. Write plausible content — the assistant replies should be 1–3 sentences each and reference the actual subject matter.

12.4 Empty states


A misc conversation has no decisions, questions, artifacts, or segments. Opening one shows L3 with a single centered line in text muted: No structure extracted — this was a one-off exchange. plus a ghost button View full chat → that opens the transcript panel directly.
With no topics open, the level stack shows only L1, expanded, and a centered 13px muted line beneath it: Click a topic to open a branch. Open more than one to compare.


13. Interaction summary (implement exactly)

ActionResultClick topic nodeToggle that topic open/closed at L2Click conversation nodeSet active conversation, open L3, clear belowClick L3 nodeOpen L4, clear belowClick L4 item (decisions mode)Open L5, highlight matching prompt nodesClick prompt node or cardOpen transcript panel scrolled to that promptClick any cardSame as clicking its nodeClick an already-active nodeCollapse everything below itClick burst pillExpand/collapse retry texts inside that cardClick breadcrumb crumbCollapse back to that levelClick mode toggleSwitch L3 chain, preserve L1–L2, clear L3+Click ResetReturn to L1-only statePress EscapeCollapse the deepest open level by oneHover nodeScale 1.3× and show tooltip

14. Acceptance checklist


On load: only L1 is visible and expanded, with 4 topic nodes and the hint line. No other level renders.
Clicking "Job apps" opens L2 with 4 conversation nodes and connector curves from the topic node to each; L1 collapses to a 36px strip with only "Job apps" labeled.
Clicking "EMG piano" as well: L2 now shows two groups separated by a dashed divider, sized 4:3 by conversation count, each group's nodes and connectors in their own accent color.
Clicking conversation "Cover letter drafts": L3 opens with three category nodes and cards; L2 collapses to a strip showing only that conversation's label; the breadcrumb reads Job apps + EMG piano › Cover letter drafts.
Clicking "Current decisions": L4 opens with three item nodes, each card showing its claim, its detail text, and a prompt-reference pill.
Clicking item "Variant B, under 250 words": L5 opens with 11 prompt nodes and cards; prompt 5's node shows the filled ring from section 7.4.
Prompt 4's card shows ⟳ 2 retries collapsed; clicking it reveals two retry lines inside the card and relabels the pill.
Clicking prompt 5 opens the transcript panel, scrolled so prompt 5 is in the upper third with a fading accent outline.
Switching to Segments mode: L3 becomes three segment nodes with prompt-range pills (prompts 1–5 · ⟳ burst on the first), L4 becomes the prompts level, and the chain is one level shorter.
Opening a misc conversation shows the empty state from 12.4 rather than an empty axis.
Closing a topic that contained the active conversation collapses every level below L2.
Every crumb in the breadcrumb navigates correctly; Escape collapses one level; Reset returns to L1.
No horizontal scrolling at 1440×900. No console errors. All transitions ≤200ms.
Connector curves stay visually attached to their nodes when the window is resized between 1280px and 1600px.


15. Out of scope — do not build

No search, no filters, no sorting controls, no zooming or panning, no settings page, no data import or upload, no editing of any content, no AI or API calls, no localStorage or persistence, no mobile or tablet layout, no dark mode, no user accounts, no export, no animations beyond those specified in section 3, no additional levels beyond those in section 5, and no side panels — all summary text lives in cards on the axis, which is the entire point of this design.