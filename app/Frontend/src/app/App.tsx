import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  TOPICS, CONVERSATIONS,
  getTopicById, getConversationById, getConversationsByTopic,
  type Topic, type Conversation, type Decision, type Segment,
} from "../data/history";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  pageBg:      "#FAFAF7",
  cardBg:      "#FFFFFF",
  recessedBg:  "#F4F3EF",
  hairline:    "#E5E3DE",
  strongBorder:"#D3D1C9",
  textPrimary: "#1F1F1D",
  textSec:     "#5C5B56",
  textMuted:   "#96948C",
};

function topicColor(clusterId: string): string {
  const topic = TOPICS.find(t => t.id === clusterId);
  return topic?.color ?? C.textMuted;
}

function hex12(hex: string): string {
  return hex + "1F"; // 12 % opacity appended as hex
}

function trunc(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

const GUTTER = 120;
const CONNECTOR_H = 24;
const NODE_EXP = 14; // expanded node circle diameter
const NODE_COL = 9;  // collapsed node circle diameter

// ─── Node position fractions ──────────────────────────────────────────────────
// All return Map<nodeId, fraction [0,1]> of the content column width.

function l1Fractions(): Map<string, number> {
  const n = TOPICS.length;
  return new Map(TOPICS.map((t, i) => [t.id, (i + 0.5) / n]));
}

function l2Fractions(openTopicIds: string[]): Map<string, number> {
  const groups = openTopicIds.map(tid => ({
    tid,
    convs: getConversationsByTopic(tid),
  }));
  const total = groups.reduce((s, g) => s + g.convs.length, 0);
  if (total === 0) return new Map();
  const pos = new Map<string, number>();
  let cum = 0;
  for (const g of groups) {
    g.convs.forEach((c, ci) => {
      pos.set(c.id, (cum + ci + 0.5) / total);
    });
    cum += g.convs.length;
  }
  return pos;
}

function evenFractions(ids: string[]): Map<string, number> {
  const n = ids.length;
  return new Map(ids.map((id, i) => [id, (i + 0.5) / n]));
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
interface TooltipState { x: number; y: number; title: string; summary: string }

function Tooltip({ x, y, title, summary }: TooltipState) {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: "translate(-50%, -100%)",
        marginTop: -10,
        background: C.cardBg,
        border: `1px solid ${C.hairline}`,
        borderRadius: 8,
        padding: "8px 10px",
        maxWidth: 260,
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        zIndex: 1000,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, lineHeight: 1.35 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, marginTop: 2 }}>{trunc(summary, 80)}</div>
    </div>
  );
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ label, color, onClick }: { label: string; color: string; onClick?: () => void }) {
  return (
    <span
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        color: color,
        background: hex12(color),
        borderRadius: 10,
        padding: "2px 7px",
        cursor: onClick ? "pointer" : "default",
        lineHeight: 1.6,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// ─── Node circle ──────────────────────────────────────────────────────────────
interface NodeCircleProps {
  color: string;
  size: number;
  isActive: boolean;
  isHighlighted?: boolean; // cross-level L5 highlight
  isOnActivePath?: boolean; // collapsed ring
  collapsed?: boolean;
  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}

function NodeCircle({
  color, size, isActive, isHighlighted, isOnActivePath, collapsed, onClick, onMouseEnter, onMouseLeave,
}: NodeCircleProps) {
  const [hovered, setHovered] = useState(false);
  const opacity = collapsed && !isOnActivePath ? 0.4 : 1;

  let boxShadow: string | undefined;
  if (collapsed && isOnActivePath) {
    boxShadow = `0 0 0 3px rgba(${hexToRgb(color)}, 0.25)`;
  } else if (isHighlighted) {
    boxShadow = `0 0 0 3px rgba(${hexToRgb(color)}, 0.8)`;
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { setHovered(true); onMouseEnter?.(e); }}
      onMouseLeave={() => { setHovered(false); onMouseLeave?.(); }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity,
        cursor: "pointer",
        transition: "transform 180ms ease-out",
        transform: hovered ? "scale(1.3)" : "scale(1)",
        flexShrink: 0,
        boxSizing: "content-box",
        ...(boxShadow ? { boxShadow } : {}),
      }}
    />
  );
}

function hexToRgb(hex: string): string {
  if (!hex.startsWith("#") || hex.length < 7) return "0,0,0";
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

// ─── Node card ────────────────────────────────────────────────────────────────
interface NodeCardProps {
  title: string;
  body: string;
  tagPill?: string;
  tagPillColor?: string;
  isBurst?: boolean;
  burstRetries?: string[];
  burstExpanded?: boolean;
  onToggleBurst?: () => void;
  isActive: boolean;
  onClick: () => void;
  accentColor: string;
}

function NodeCard({
  title, body, tagPill, tagPillColor, isBurst, burstRetries, burstExpanded, onToggleBurst,
  isActive, onClick, accentColor,
}: NodeCardProps) {
  const [hovered, setHovered] = useState(false);
  const border = hovered ? `1px solid ${C.strongBorder}` : `1px solid ${C.hairline}`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minWidth: 150,
        background: C.cardBg,
        border,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        transition: "border-color 180ms ease-out",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...(isActive ? { borderColor: accentColor } : {}),
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, lineHeight: 1.35 }}>
        {trunc(title, 60)}
      </div>
      {body && (
        <div
          style={{
            fontSize: 12, color: C.textSec, lineHeight: 1.5,
            overflow: "hidden",
            maxHeight: "72px",
          }}
        >
          {body}
        </div>
      )}
      {isBurst && burstRetries && (
        <div style={{ marginTop: 4 }}>
          <TagPill
            label={burstExpanded ? "⟳ hide retries" : `⟳ ${burstRetries.length} retries collapsed`}
            color={tagPillColor ?? accentColor}
            onClick={onToggleBurst}
          />
          {burstExpanded && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {burstRetries.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
                  retry — {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!isBurst && tagPill && tagPillColor && (
        <div style={{ marginTop: 4 }}>
          <TagPill label={tagPill} color={tagPillColor} />
        </div>
      )}
    </div>
  );
}

// ─── Connector strip (SVG beziers) ────────────────────────────────────────────
interface Connection { parentX: number; childX: number; color: string }

function ConnectorStrip({ connections, contentWidth }: { connections: Connection[]; contentWidth: number }) {
  return (
    <div style={{ marginLeft: GUTTER, height: CONNECTOR_H, position: "relative", overflow: "visible" }}>
      <svg
        width={contentWidth}
        height={CONNECTOR_H}
        style={{ display: "block", overflow: "visible" }}
      >
        {connections.map((cn, i) => {
          const x1 = cn.parentX;
          const x2 = cn.childX;
          return (
            <path
              key={i}
              d={`M ${x1},0 C ${x1},16 ${x2},8 ${x2},${CONNECTOR_H}`}
              stroke={cn.color}
              strokeWidth={1.2}
              strokeOpacity={0.6}
              fill="none"
            />
          );
        })}
      </svg>
    </div>
  );
}

// ─── Collapsed level strip ────────────────────────────────────────────────────
interface CollapsedNode {
  id: string;
  label: string;
  xFraction: number;
  color: string;
  isOnActivePath: boolean;
  tooltipTitle: string;
  tooltipSummary: string;
}

interface CollapsedStripProps {
  levelLabel: string;
  nodes: CollapsedNode[];
  contentWidth: number;
  groupDividers?: number[]; // x fractions where dashed dividers appear
  onNodeClick: (id: string) => void;
  onShowTooltip: (x: number, y: number, title: string, summary: string) => void;
  onHideTooltip: () => void;
}

function CollapsedStrip({
  levelLabel, nodes, contentWidth, groupDividers, onNodeClick, onShowTooltip, onHideTooltip,
}: CollapsedStripProps) {
  return (
    <div style={{ display: "flex", height: 36, alignItems: "center", position: "relative" }}>
      {/* Level gutter label */}
      <div
        style={{
          width: GUTTER,
          flexShrink: 0,
          paddingRight: 12,
          textAlign: "right",
          fontSize: 12,
          color: C.textMuted,
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {levelLabel}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, position: "relative", height: "100%" }}>
        {/* Axis line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 1,
            background: C.hairline,
            transform: "translateY(-50%)",
          }}
        />

        {/* Group dividers */}
        {groupDividers?.map((xFrac, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: xFrac * contentWidth,
              top: 0,
              bottom: 0,
              width: 1,
              borderLeft: `1px dashed ${C.hairline}`,
            }}
          />
        ))}

        {/* Nodes */}
        {nodes.map(node => {
          const cx = node.xFraction * contentWidth;
          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: cx,
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <NodeCircle
                color={node.color}
                size={NODE_COL}
                isActive={false}
                isOnActivePath={node.isOnActivePath}
                collapsed
                onClick={() => onNodeClick(node.id)}
                onMouseEnter={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onShowTooltip(rect.left + rect.width / 2, rect.top, node.tooltipTitle, node.tooltipSummary);
                }}
                onMouseLeave={onHideTooltip}
              />
              {node.isOnActivePath && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    color: C.textPrimary,
                    whiteSpace: "nowrap",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {node.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Expanded level row ───────────────────────────────────────────────────────
interface ExpandedNode {
  id: string;
  label: string;
  color: string;
  isActive: boolean;
  isHighlighted?: boolean;
  tooltipTitle: string;
  tooltipSummary: string;
  card: {
    body: string;
    tagPill?: string;
    tagPillColor?: string;
    isBurst?: boolean;
    burstRetries?: string[];
    burstExpanded?: boolean;
    onToggleBurst?: () => void;
  };
}

interface ExpandedGroup {
  id: string;
  color: string;
  weight: number;
  nodes: ExpandedNode[];
}

interface ExpandedLevelProps {
  levelLabel: string;
  groups: ExpandedGroup[];
  onNodeClick: (id: string) => void;
  onShowTooltip: (x: number, y: number, title: string, summary: string) => void;
  onHideTooltip: () => void;
}

function ExpandedLevel({ levelLabel, groups, onNodeClick, onShowTooltip, onHideTooltip }: ExpandedLevelProps) {
  const totalWeight = groups.reduce((s, g) => s + g.weight, 0) || 1;

  return (
    <div style={{ display: "flex" }}>
      {/* Gutter */}
      <div
        style={{
          width: GUTTER,
          flexShrink: 0,
          paddingRight: 12,
          textAlign: "right",
          fontSize: 12,
          color: C.textMuted,
          paddingTop: 28,
          lineHeight: 1,
        }}
      >
        {levelLabel}
      </div>

      {/* Content */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* Axis line positioned at center of node circles (NODE_EXP/2 = 7px below paddingTop 24px) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 24 + NODE_EXP / 2,
            height: 1,
            background: C.hairline,
          }}
        />

        {/* Groups */}
        <div style={{ display: "flex" }}>
          {groups.map((group, gi) => (
            <div
              key={group.id}
              style={{
                flex: group.weight,
                position: "relative",
                paddingTop: 24,
                paddingBottom: 20,
              }}
            >
              {/* Dashed group divider on the right (not on last group) */}
              {gi < groups.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    borderRight: `1px dashed ${C.hairline}`,
                  }}
                />
              )}

              {/* Node row */}
              <div style={{ display: "flex" }}>
                {group.nodes.map(node => (
                  <div
                    key={node.id}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => onNodeClick(node.id)}
                  >
                    <NodeCircle
                      color={node.color}
                      size={NODE_EXP}
                      isActive={node.isActive}
                      isHighlighted={node.isHighlighted}
                      onClick={() => onNodeClick(node.id)}
                      onMouseEnter={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onShowTooltip(rect.left + rect.width / 2, rect.top, node.tooltipTitle, node.tooltipSummary);
                      }}
                      onMouseLeave={onHideTooltip}
                    />
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        fontWeight: node.isActive ? 500 : 400,
                        color: node.isActive ? node.color : C.textPrimary,
                        textAlign: "center",
                        maxWidth: "90%",
                        overflow: "hidden",
                        maxHeight: "34px",
                        lineHeight: 1.4,
                      }}
                    >
                      {node.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Card row */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, paddingLeft: 4, paddingRight: 4 }}>
                {group.nodes.map(node => (
                  <NodeCard
                    key={node.id}
                    title={node.label}
                    body={node.card.body}
                    tagPill={node.card.tagPill}
                    tagPillColor={node.card.tagPillColor ?? group.color}
                    isBurst={node.card.isBurst}
                    burstRetries={node.card.burstRetries}
                    burstExpanded={node.card.burstExpanded}
                    onToggleBurst={node.card.onToggleBurst}
                    isActive={node.isActive}
                    onClick={() => onNodeClick(node.id)}
                    accentColor={group.color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state (misc conversations) ────────────────────────────────────────
function EmptyStateLevel({
  levelLabel,
  onViewChat,
}: { levelLabel: string; onViewChat: () => void }) {
  return (
    <div style={{ display: "flex", padding: "32px 0 24px" }}>
      <div
        style={{
          width: GUTTER,
          flexShrink: 0,
          paddingRight: 12,
          textAlign: "right",
          fontSize: 12,
          color: C.textMuted,
        }}
      >
        {levelLabel}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 13, color: C.textMuted }}>
          No structure extracted — this was a one-off exchange.
        </div>
        <button
          onClick={onViewChat}
          style={{
            fontSize: 12,
            color: C.textSec,
            background: "transparent",
            border: `1px solid ${C.hairline}`,
            borderRadius: 8,
            padding: "6px 14px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          View full chat →
        </button>
      </div>
    </div>
  );
}

// ─── Transcript panel ─────────────────────────────────────────────────────────
interface TranscriptPanelProps {
  conversation: Conversation;
  activePromptN: number | null;
  levelLabel: string;
  accentColor: string;
  onClose: () => void;
}

function TranscriptPanel({ conversation, activePromptN, levelLabel, accentColor, onClose }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [flashN, setFlashN] = useState<number | null>(null);

  useEffect(() => {
    if (activePromptN == null) return;
    const el = msgRefs.current.get(activePromptN);
    if (el && scrollRef.current) {
      const panelRect = scrollRef.current.getBoundingClientRect();
      const elOffset = el.offsetTop;
      const targetScroll = elOffset - (scrollRef.current.clientHeight * 0.25);
      scrollRef.current.scrollTop = Math.max(0, targetScroll);
    }
    setFlashN(activePromptN);
    const t = setTimeout(() => setFlashN(null), 2000);
    return () => clearTimeout(t);
  }, [activePromptN]);

  // Build segment divider positions
  const segmentStarts = new Map<number, string>();
  conversation.segments.forEach(seg => {
    segmentStarts.set(seg.promptRange[0], seg.label);
  });

  // Track which user message index a promptN corresponds to
  let userMsgCount = 0;

  return (
    <div style={{ display: "flex" }}>
      <div style={{ width: GUTTER, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        {/* Flash animation style */}
        <style>{`
          @keyframes flashOutline {
            0%   { outline: 2px solid ${accentColor}; outline-offset: 2px; }
            70%  { outline: 2px solid ${accentColor}; outline-offset: 2px; }
            100% { outline: 2px solid transparent; outline-offset: 2px; }
          }
          .flash-msg { animation: flashOutline 2s ease-out forwards; }
        `}</style>

        <div
          style={{
            background: C.recessedBg,
            borderRadius: 10,
            padding: "16px 20px",
            maxHeight: 420,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: C.textMuted }}>{levelLabel}</span>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: C.textMuted,
                padding: "2px 4px",
                fontFamily: "inherit",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable messages */}
          <div ref={scrollRef} style={{ overflowY: "auto", flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {conversation.transcript.map((msg, mi) => {
                if (msg.role === "user" && msg.promptN) userMsgCount++;
                const pN = msg.role === "user" ? msg.promptN : undefined;
                const isFlashing = pN != null && pN === flashN;

                // Segment divider before this user message
                const segLabel = pN ? segmentStarts.get(pN) : undefined;

                return (
                  <React.Fragment key={mi}>
                    {segLabel && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          margin: "8px 0 4px",
                        }}
                      >
                        <div style={{ flex: 1, height: 1, background: C.hairline }} />
                        <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>
                          — {segLabel} —
                        </span>
                        <div style={{ flex: 1, height: 1, background: C.hairline }} />
                      </div>
                    )}

                    {msg.role === "user" ? (
                      <div
                        style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
                        ref={(el: HTMLDivElement | null) => { if (pN && el) msgRefs.current.set(pN, el); }}
                      >
                        {pN && (
                          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>
                            prompt {pN}
                          </div>
                        )}
                        <div
                          className={isFlashing ? "flash-msg" : ""}
                          style={{
                            background: C.cardBg,
                            borderRadius: 10,
                            padding: "8px 12px",
                            maxWidth: "70%",
                            fontSize: 12,
                            color: C.textPrimary,
                            lineHeight: 1.5,
                          }}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: C.textSec,
                          lineHeight: 1.5,
                          maxWidth: "100%",
                        }}
                      >
                        {msg.text}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Breadcrumb ────────────────────────────────────────────────────────────────
interface BreadcrumbProps {
  openTopics: string[];
  activeConvId: string | null;
  activeL3Id: string | null;
  activeL4Id: string | null;
  transcriptOpen: boolean;
  mode: "decisions" | "segments";
  onCollapseToTopics: () => void;
  onCollapseToConv: () => void;
  onCollapseToL3: () => void;
  onCollapseToL4: () => void;
  onCloseTranscript: () => void;
}

function Breadcrumb({
  openTopics, activeConvId, activeL3Id, activeL4Id, transcriptOpen, mode,
  onCollapseToTopics, onCollapseToConv, onCollapseToL3, onCollapseToL4, onCloseTranscript,
}: BreadcrumbProps) {
  const sep = <span style={{ color: C.textMuted, margin: "0 4px" }}>›</span>;
  const crumbStyle = (clickable: boolean): React.CSSProperties => ({
    fontSize: 12,
    color: clickable ? C.textSec : C.textMuted,
    cursor: clickable ? "pointer" : "default",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    background: "transparent",
    border: "none",
    padding: 0,
  });

  if (openTopics.length === 0) {
    return (
      <span style={{ fontSize: 12, color: C.textMuted }}>Click a topic to branch</span>
    );
  }

  const topicLabels = openTopics
    .map(tid => TOPICS.find(t => t.id === tid)?.label ?? tid)
    .join(" + ");
  const conv = activeConvId ? getConversationById(activeConvId) : null;

  // L3 label
  let l3Label = "";
  if (activeL3Id) {
    if (mode === "decisions") {
      if (activeL3Id === "decisions") l3Label = "Current decisions";
      else if (activeL3Id === "open-questions") l3Label = "Open questions";
      else if (activeL3Id === "artifacts") l3Label = "Artifacts";
    } else {
      const seg = conv?.segments.find(s => s.id === activeL3Id);
      l3Label = seg?.label ?? activeL3Id;
    }
  }

  // L4 label
  let l4Label = "";
  if (activeL4Id && conv) {
    if (mode === "decisions") {
      const allItems = [...conv.decisions, ...conv.openQuestions, ...conv.artifacts];
      const item = allItems.find(d => d.id === activeL4Id);
      l4Label = item?.claim ?? activeL4Id;
    } else {
      // L4 in segments mode = prompts level
      const pn = parseInt(activeL4Id);
      const prompt = conv.prompts.find(p => p.n === pn);
      l4Label = prompt ? `prompt ${pn}` : activeL4Id;
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "nowrap", overflow: "hidden" }}>
      <button onClick={onCollapseToTopics} style={crumbStyle(true)}>{trunc(topicLabels, 30)}</button>

      {conv && (
        <>
          {sep}
          <button onClick={onCollapseToConv} style={crumbStyle(!!activeL3Id)}>{trunc(conv.title, 30)}</button>
        </>
      )}

      {l3Label && (
        <>
          {sep}
          <button onClick={onCollapseToL3} style={crumbStyle(!!activeL4Id)}>{trunc(l3Label, 30)}</button>
        </>
      )}

      {l4Label && (
        <>
          {sep}
          <button onClick={onCollapseToL4} style={crumbStyle(transcriptOpen)}>{trunc(l4Label, 30)}</button>
        </>
      )}

      {transcriptOpen && (
        <>
          {sep}
          <button onClick={onCloseTranscript} style={crumbStyle(false)}>full chat</button>
        </>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
interface HeaderProps {
  mode: "decisions" | "segments";
  onModeChange: (m: "decisions" | "segments") => void;
  onReset: () => void;
  breadcrumbProps: Omit<BreadcrumbProps, never>;
}

function Header({ mode, onModeChange, onReset, breadcrumbProps }: HeaderProps) {
  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 500,
    padding: "5px 12px",
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    background: active ? C.textPrimary : "transparent",
    color: active ? "#FFFFFF" : C.textSec,
    fontFamily: "inherit",
    transition: "background 180ms ease-out, color 180ms ease-out",
  });

  return (
    <div
      style={{
        height: 56,
        background: C.cardBg,
        borderBottom: `1px solid ${C.hairline}`,
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        gap: 16,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary, flexShrink: 0 }}>
        History Navigator
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <Breadcrumb {...breadcrumbProps} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            background: C.recessedBg,
            borderRadius: 10,
            padding: 2,
            gap: 2,
          }}
        >
          <button style={toggleBtnStyle(mode === "decisions")} onClick={() => onModeChange("decisions")}>
            Decisions
          </button>
          <button style={toggleBtnStyle(mode === "segments")} onClick={() => onModeChange("segments")}>
            Segments
          </button>
        </div>

        <button
          onClick={onReset}
          style={{
            fontSize: 12,
            color: C.textSec,
            background: "transparent",
            border: `1px solid ${C.hairline}`,
            borderRadius: 8,
            padding: "5px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ─── Level label helper ───────────────────────────────────────────────────────
function levelLabel(level: number, mode: "decisions" | "segments"): string {
  if (mode === "decisions") {
    const labels: Record<number, string> = {
      1: "L1 · topics",
      2: "L2 · conversations",
      3: "L3 · categories",
      4: "L4 · items",
      5: "L5 · prompts",
    };
    return labels[level] ?? `L${level}`;
  } else {
    const labels: Record<number, string> = {
      1: "L1 · topics",
      2: "L2 · conversations",
      3: "L3 · segments",
      4: "L4 · prompts",
    };
    return labels[level] ?? `L${level}`;
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [openTopics,    setOpenTopics]    = useState<string[]>([]);
  const [activeConvId,  setActiveConvId]  = useState<string | null>(null);
  const [activeL3Id,    setActiveL3Id]    = useState<string | null>(null);
  const [activeL4Id,    setActiveL4Id]    = useState<string | null>(null);
  const [activePromptN, setActivePromptN] = useState<number | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [mode,           setMode]          = useState<"decisions" | "segments">("decisions");
  const [expandedBursts, setExpandedBursts] = useState<Set<number>>(new Set());
  const [tooltip,        setTooltip]       = useState<TooltipState | null>(null);

  const containerRef   = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(1256);
  const tooltipTimer   = useRef<ReturnType<typeof setTimeout>>();

  // Measure content column width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContentWidth(Math.max(400, rect.width - 64 - GUTTER)); // 64 = horizontal padding
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard: Escape collapses deepest level
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (transcriptOpen) {
        setTranscriptOpen(false);
        setActivePromptN(null);
      } else if (activeL4Id !== null) {
        setActiveL4Id(null);
        setActivePromptN(null);
        setTranscriptOpen(false);
      } else if (activeL3Id !== null) {
        setActiveL3Id(null);
        setActiveL4Id(null);
        setActivePromptN(null);
        setTranscriptOpen(false);
      } else if (activeConvId !== null) {
        setActiveConvId(null);
        setActiveL3Id(null);
        setActiveL4Id(null);
        setActivePromptN(null);
        setTranscriptOpen(false);
      } else if (openTopics.length > 0) {
        setOpenTopics([]);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [transcriptOpen, activeL4Id, activeL3Id, activeConvId, openTopics]);

  // ── Tooltip helpers ────────────────────────────────────────────
  const showTooltip = useCallback((x: number, y: number, title: string, summary: string) => {
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ x, y, title, summary });
    }, 120);
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimeout(tooltipTimer.current);
    setTooltip(null);
  }, []);

  // ── Event handlers ─────────────────────────────────────────────
  function handleTopicClick(topicId: string) {
    if (openTopics.includes(topicId)) {
      const next = openTopics.filter(t => t !== topicId);
      setOpenTopics(next);
      // If active conv belongs to this topic, clear below
      const conv = activeConvId ? getConversationById(activeConvId) : null;
      if (conv?.cluster === topicId) {
        setActiveConvId(null);
        setActiveL3Id(null);
        setActiveL4Id(null);
        setActivePromptN(null);
        setTranscriptOpen(false);
      }
    } else {
      setOpenTopics([...openTopics, topicId]);
    }
  }

  function handleConvClick(convId: string) {
    if (convId === activeConvId) {
      setActiveConvId(null);
      setActiveL3Id(null);
      setActiveL4Id(null);
      setActivePromptN(null);
      setTranscriptOpen(false);
    } else {
      setActiveConvId(convId);
      setActiveL3Id(null);
      setActiveL4Id(null);
      setActivePromptN(null);
      setTranscriptOpen(false);
      setExpandedBursts(new Set());
    }
  }

  function handleL3Click(nodeId: string) {
    if (nodeId === activeL3Id) {
      setActiveL3Id(null);
      setActiveL4Id(null);
      setActivePromptN(null);
      setTranscriptOpen(false);
    } else {
      setActiveL3Id(nodeId);
      setActiveL4Id(null);
      setActivePromptN(null);
      setTranscriptOpen(false);
    }
  }

  function handleL4Click(nodeId: string) {
    if (nodeId === activeL4Id) {
      setActiveL4Id(null);
      setActivePromptN(null);
      setTranscriptOpen(false);
    } else {
      setActiveL4Id(nodeId);
      setActivePromptN(null);
      setTranscriptOpen(false);
    }
  }

  function handlePromptClick(promptN: number) {
    if (promptN === activePromptN && transcriptOpen) {
      setActivePromptN(null);
      setTranscriptOpen(false);
    } else {
      setActivePromptN(promptN);
      setTranscriptOpen(true);
    }
  }

  function handleModeChange(newMode: "decisions" | "segments") {
    setMode(newMode);
    setActiveL3Id(null);
    setActiveL4Id(null);
    setActivePromptN(null);
    setTranscriptOpen(false);
  }

  function handleReset() {
    setOpenTopics([]);
    setActiveConvId(null);
    setActiveL3Id(null);
    setActiveL4Id(null);
    setActivePromptN(null);
    setTranscriptOpen(false);
    setExpandedBursts(new Set());
  }

  function toggleBurst(n: number) {
    setExpandedBursts(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  // ── Derived state ──────────────────────────────────────────────
  const activeConv = activeConvId ? getConversationById(activeConvId) : null;
  const isMiscConv = activeConv?.cluster === "misc";

  // Which levels are visible
  const showL2 = openTopics.length > 0;
  const showL3 = activeConvId !== null;
  const showL4 = activeL3Id !== null && !isMiscConv && (
    mode === "decisions" || (mode === "segments" && activeL3Id !== null)
  );
  const showL5 = mode === "decisions" && activeL4Id !== null;

  // Deepest axis level: 1=L1, 2=L2, 3=L3, 4=L4, 5=L5
  const deepest = showL5 ? 5 : showL4 ? 4 : showL3 ? 3 : showL2 ? 2 : 1;

  // For cross-level highlighting: which prompt numbers are referenced by active L4 item
  const activeL4PromptRefs = useMemo<number[]>(() => {
    if (!activeL4Id || !activeConv || mode !== "decisions") return [];
    const allItems = [...activeConv.decisions, ...activeConv.openQuestions, ...activeConv.artifacts];
    return allItems.find(d => d.id === activeL4Id)?.promptRefs ?? [];
  }, [activeL4Id, activeConv, mode]);

  // ── Position fractions ─────────────────────────────────────────
  const l1Fracs = useMemo(() => l1Fractions(), []);
  const l2Fracs = useMemo(() => l2Fractions(openTopics), [openTopics]);

  // L3 node ids depend on mode
  const l3NodeIds = useMemo<string[]>(() => {
    if (!activeConv) return [];
    if (mode === "decisions") return ["decisions", "open-questions", "artifacts"];
    return activeConv.segments.map(s => s.id);
  }, [activeConv, mode]);

  const l3Fracs = useMemo(() => evenFractions(l3NodeIds), [l3NodeIds]);

  // L4 node ids
  const l4NodeIds = useMemo<string[]>(() => {
    if (!activeConv || !activeL3Id) return [];
    if (mode === "decisions") {
      if (activeL3Id === "decisions")      return activeConv.decisions.map(d => d.id);
      if (activeL3Id === "open-questions") return activeConv.openQuestions.map(d => d.id);
      if (activeL3Id === "artifacts")      return activeConv.artifacts.map(d => d.id);
      return [];
    } else {
      // segments mode: L4 = prompts
      return activeConv.prompts.map(p => String(p.n));
    }
  }, [activeConv, activeL3Id, mode]);

  const l4Fracs = useMemo(() => evenFractions(l4NodeIds), [l4NodeIds]);

  // L5 node ids (decisions mode only: prompts)
  const l5NodeIds = useMemo<string[]>(() => {
    if (mode !== "decisions" || !activeConv) return [];
    return activeConv.prompts.map(p => String(p.n));
  }, [mode, activeConv]);

  const l5Fracs = useMemo(() => evenFractions(l5NodeIds), [l5NodeIds]);

  // ── Connector computations ──────────────────────────────────────
  const connectorsL1L2 = useMemo<Connection[]>(() => {
    if (!showL2) return [];
    const conns: Connection[] = [];
    openTopics.forEach(tid => {
      const pFrac = l1Fracs.get(tid);
      if (pFrac == null) return;
      const convs = getConversationsByTopic(tid);
      convs.forEach(conv => {
        const cFrac = l2Fracs.get(conv.id);
        if (cFrac == null) return;
        conns.push({ parentX: pFrac * contentWidth, childX: cFrac * contentWidth, color: topicColor(tid) });
      });
    });
    return conns;
  }, [showL2, openTopics, l1Fracs, l2Fracs, contentWidth]);

  const connectorsL2L3 = useMemo<Connection[]>(() => {
    if (!showL3 || !activeConvId) return [];
    const parentFrac = l2Fracs.get(activeConvId);
    if (parentFrac == null) return [];
    const color = topicColor(activeConv?.cluster ?? "misc");
    return l3NodeIds.map(nid => {
      const cFrac = l3Fracs.get(nid) ?? 0.5;
      return { parentX: parentFrac * contentWidth, childX: cFrac * contentWidth, color };
    });
  }, [showL3, activeConvId, l2Fracs, l3NodeIds, l3Fracs, contentWidth, activeConv]);

  const connectorsL3L4 = useMemo<Connection[]>(() => {
    if (!showL4 || !activeL3Id) return [];
    const parentFrac = l3Fracs.get(activeL3Id);
    if (parentFrac == null) return [];
    const color = topicColor(activeConv?.cluster ?? "misc");
    return l4NodeIds.map(nid => {
      const cFrac = l4Fracs.get(nid) ?? 0.5;
      return { parentX: parentFrac * contentWidth, childX: cFrac * contentWidth, color };
    });
  }, [showL4, activeL3Id, l3Fracs, l4NodeIds, l4Fracs, contentWidth, activeConv]);

  const connectorsL4L5 = useMemo<Connection[]>(() => {
    if (!showL5 || !activeL4Id) return [];
    const parentFrac = l4Fracs.get(activeL4Id);
    if (parentFrac == null) return [];
    const color = topicColor(activeConv?.cluster ?? "misc");
    return l5NodeIds.map(nid => {
      const cFrac = l5Fracs.get(nid) ?? 0.5;
      return { parentX: parentFrac * contentWidth, childX: cFrac * contentWidth, color };
    });
  }, [showL5, activeL4Id, l4Fracs, l5NodeIds, l5Fracs, contentWidth, activeConv]);

  // ── L2 group divider fractions ─────────────────────────────────
  const l2DividerFracs = useMemo<number[]>(() => {
    const groups = openTopics.map(tid => getConversationsByTopic(tid).length);
    const total = groups.reduce((s, n) => s + n, 0);
    if (total === 0) return [];
    const divs: number[] = [];
    let cum = 0;
    for (let i = 0; i < groups.length - 1; i++) {
      cum += groups[i];
      divs.push(cum / total);
    }
    return divs;
  }, [openTopics]);

  // ── Breadcrumb handlers ────────────────────────────────────────
  function collapseToTopics() {
    setActiveConvId(null);
    setActiveL3Id(null);
    setActiveL4Id(null);
    setActivePromptN(null);
    setTranscriptOpen(false);
  }
  function collapseToConv() {
    setActiveL3Id(null);
    setActiveL4Id(null);
    setActivePromptN(null);
    setTranscriptOpen(false);
  }
  function collapseToL3() {
    setActiveL4Id(null);
    setActivePromptN(null);
    setTranscriptOpen(false);
  }
  function collapseToL4() {
    setActivePromptN(null);
    setTranscriptOpen(false);
  }

  // ── Build level data: groups for collapsed/expanded L1 ─────────
  function buildL1Groups(): ExpandedGroup[] {
    return [{
      id: "all-topics",
      color: C.textMuted,
      weight: 1,
      nodes: TOPICS.map(topic => ({
        id: topic.id,
        label: topic.label,
        color: topic.color,
        isActive: openTopics.includes(topic.id),
        tooltipTitle: topic.label,
        tooltipSummary: topic.summary,
        card: {
          body: topic.summary,
          tagPill: `${getConversationsByTopic(topic.id).length} conversations`,
          tagPillColor: topic.color,
        },
      })),
    }];
  }

  function buildL1CollapsedNodes(): CollapsedNode[] {
    return TOPICS.map(topic => ({
      id: topic.id,
      label: topic.label,
      xFraction: l1Fracs.get(topic.id) ?? 0,
      color: topic.color,
      isOnActivePath: activeConv?.cluster === topic.id,
      tooltipTitle: topic.label,
      tooltipSummary: topic.summary,
    }));
  }

  function buildL2Groups(): ExpandedGroup[] {
    return openTopics.map(tid => {
      const topic = getTopicById(tid)!;
      const convs = getConversationsByTopic(tid);
      return {
        id: tid,
        color: topic.color,
        weight: convs.length,
        nodes: convs.map(conv => ({
          id: conv.id,
          label: conv.title,
          color: topic.color,
          isActive: conv.id === activeConvId,
          tooltipTitle: conv.title,
          tooltipSummary: conv.oneLiner,
          card: {
            body: conv.oneLiner,
            tagPill: `${conv.date} · ${conv.messageCount} msgs`,
            tagPillColor: topic.color,
          },
        })),
      };
    });
  }

  function buildL2CollapsedNodes(): CollapsedNode[] {
    return openTopics.flatMap(tid => {
      const topic = getTopicById(tid)!;
      return getConversationsByTopic(tid).map(conv => ({
        id: conv.id,
        label: conv.title,
        xFraction: l2Fracs.get(conv.id) ?? 0,
        color: topic.color,
        isOnActivePath: conv.id === activeConvId,
        tooltipTitle: conv.title,
        tooltipSummary: conv.oneLiner,
      }));
    });
  }

  function buildL3Groups(): ExpandedGroup[] {
    if (!activeConv) return [];
    const color = topicColor(activeConv.cluster);

    if (mode === "decisions") {
      const cats = [
        {
          id: "decisions",
          label: "Current decisions",
          items: activeConv.decisions,
          bodyFn: (items: Decision[]) => `${items.length} decision${items.length !== 1 ? "s" : ""}`,
        },
        {
          id: "open-questions",
          label: "Open questions",
          items: activeConv.openQuestions,
          bodyFn: (items: Decision[]) => `${items.length} question${items.length !== 1 ? "s" : ""}`,
        },
        {
          id: "artifacts",
          label: "Artifacts",
          items: activeConv.artifacts,
          bodyFn: (items: Decision[]) => `${items.length} artifact${items.length !== 1 ? "s" : ""}`,
        },
      ];
      return [{
        id: "l3-cats",
        color,
        weight: 1,
        nodes: cats.map(cat => ({
          id: cat.id,
          label: cat.label,
          color,
          isActive: cat.id === activeL3Id,
          tooltipTitle: cat.label,
          tooltipSummary: cat.bodyFn(cat.items),
          card: {
            body: cat.bodyFn(cat.items),
          },
        })),
      }];
    } else {
      // segments mode
      return [{
        id: "l3-segs",
        color,
        weight: 1,
        nodes: activeConv.segments.map(seg => {
          const hasBurst = seg.hasBurst && activeConv.bursts.some(b =>
            b.atPrompt >= seg.promptRange[0] && b.atPrompt <= seg.promptRange[1]
          );
          const pill = `prompts ${seg.promptRange[0]}–${seg.promptRange[1]}${hasBurst ? " · ⟳ burst" : ""}`;
          return {
            id: seg.id,
            label: seg.label,
            color,
            isActive: seg.id === activeL3Id,
            tooltipTitle: seg.label,
            tooltipSummary: seg.summary,
            card: {
              body: seg.summary,
              tagPill: pill,
              tagPillColor: color,
            },
          };
        }),
      }];
    }
  }

  function buildL3CollapsedNodes(): CollapsedNode[] {
    if (!activeConv) return [];
    const color = topicColor(activeConv.cluster);
    return l3NodeIds.map(id => {
      let label = id;
      let summary = "";
      if (mode === "decisions") {
        if (id === "decisions")      { label = "Current decisions"; summary = `${activeConv.decisions.length} decisions`; }
        if (id === "open-questions") { label = "Open questions";    summary = `${activeConv.openQuestions.length} questions`; }
        if (id === "artifacts")      { label = "Artifacts";         summary = `${activeConv.artifacts.length} artifacts`; }
      } else {
        const seg = activeConv.segments.find(s => s.id === id);
        if (seg) { label = seg.label; summary = seg.summary; }
      }
      return {
        id, label, color,
        xFraction: l3Fracs.get(id) ?? 0,
        isOnActivePath: id === activeL3Id,
        tooltipTitle: label,
        tooltipSummary: summary,
      };
    });
  }

  function buildL4Groups(): ExpandedGroup[] {
    if (!activeConv || !activeL3Id) return [];
    const color = topicColor(activeConv.cluster);

    if (mode === "decisions") {
      let items: Decision[] = [];
      if (activeL3Id === "decisions")      items = activeConv.decisions;
      if (activeL3Id === "open-questions") items = activeConv.openQuestions;
      if (activeL3Id === "artifacts")      items = activeConv.artifacts;

      return [{
        id: "l4-items",
        color,
        weight: 1,
        nodes: items.map(item => {
          const refs = item.promptRefs;
          const pill = refs.length === 1 ? `prompt ${refs[0]}` : `prompts ${refs.join(", ")}`;
          return {
            id: item.id,
            label: item.claim,
            color,
            isActive: item.id === activeL4Id,
            tooltipTitle: item.claim,
            tooltipSummary: item.detail,
            card: {
              body: item.detail,
              tagPill: pill,
              tagPillColor: color,
            },
          };
        }),
      }];
    } else {
      // segments mode: L4 = prompts
      return [{
        id: "l4-prompts",
        color,
        weight: 1,
        nodes: activeConv.prompts.map(prompt => {
          const burst = activeConv.bursts.find(b => b.atPrompt === prompt.n);
          const isExpanded = expandedBursts.has(prompt.n);
          return {
            id: String(prompt.n),
            label: `prompt ${prompt.n}`,
            color,
            isActive: String(prompt.n) === activeL4Id || (transcriptOpen && activePromptN === prompt.n),
            tooltipTitle: `prompt ${prompt.n}`,
            tooltipSummary: prompt.summary,
            card: {
              body: prompt.summary,
              isBurst: !!burst,
              burstRetries: burst?.retries,
              burstExpanded: isExpanded,
              onToggleBurst: burst ? () => toggleBurst(prompt.n) : undefined,
            },
          };
        }),
      }];
    }
  }

  function buildL4CollapsedNodes(): CollapsedNode[] {
    if (!activeConv || !activeL3Id) return [];
    const color = topicColor(activeConv.cluster);
    return l4NodeIds.map(id => {
      let label = id, summary = "";
      if (mode === "decisions") {
        const allItems = [...activeConv.decisions, ...activeConv.openQuestions, ...activeConv.artifacts];
        const item = allItems.find(d => d.id === id);
        if (item) { label = item.claim; summary = item.detail; }
      } else {
        const pn = parseInt(id);
        const p = activeConv.prompts.find(p => p.n === pn);
        if (p) { label = `prompt ${pn}`; summary = p.summary; }
      }
      return {
        id, label, color,
        xFraction: l4Fracs.get(id) ?? 0,
        isOnActivePath: id === activeL4Id,
        tooltipTitle: label,
        tooltipSummary: summary,
      };
    });
  }

  function buildL5Groups(): ExpandedGroup[] {
    if (!activeConv || mode !== "decisions") return [];
    const color = topicColor(activeConv.cluster);
    return [{
      id: "l5-prompts",
      color,
      weight: 1,
      nodes: activeConv.prompts.map(prompt => {
        const burst = activeConv.bursts.find(b => b.atPrompt === prompt.n);
        const isExpanded = expandedBursts.has(prompt.n);
        const isHighlighted = activeL4PromptRefs.includes(prompt.n);
        return {
          id: String(prompt.n),
          label: `prompt ${prompt.n}`,
          color,
          isActive: transcriptOpen && activePromptN === prompt.n,
          isHighlighted,
          tooltipTitle: `prompt ${prompt.n}`,
          tooltipSummary: prompt.summary,
          card: {
            body: prompt.summary,
            isBurst: !!burst,
            burstRetries: burst?.retries,
            burstExpanded: isExpanded,
            onToggleBurst: burst ? () => toggleBurst(prompt.n) : undefined,
          },
        };
      }),
    }];
  }

  // ── Active prompt for transcript ───────────────────────────────
  // handlePromptClick always sets activePromptN; works for both modes
  const transcriptPromptN = transcriptOpen ? activePromptN : null;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.pageBg,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
        color: C.textPrimary,
      }}
    >
      <Header
        mode={mode}
        onModeChange={handleModeChange}
        onReset={handleReset}
        breadcrumbProps={{
          openTopics,
          activeConvId,
          activeL3Id,
          activeL4Id,
          transcriptOpen,
          mode,
          onCollapseToTopics: collapseToTopics,
          onCollapseToConv: collapseToConv,
          onCollapseToL3: collapseToL3,
          onCollapseToL4: collapseToL4,
          onCloseTranscript: () => { setTranscriptOpen(false); setActivePromptN(null); },
        }}
      />

      <div ref={containerRef} style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── L1 ── */}
        {deepest === 1 ? (
          <ExpandedLevel
            levelLabel={levelLabel(1, mode)}
            groups={buildL1Groups()}
            onNodeClick={handleTopicClick}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
          />
        ) : (
          <CollapsedStrip
            levelLabel={levelLabel(1, mode)}
            nodes={buildL1CollapsedNodes()}
            contentWidth={contentWidth}
            onNodeClick={handleTopicClick}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
          />
        )}

        {/* ── L1→L2 connector ── */}
        {showL2 && (
          <ConnectorStrip connections={connectorsL1L2} contentWidth={contentWidth} />
        )}

        {/* ── L2 ── */}
        {showL2 && (deepest === 2 ? (
          <ExpandedLevel
            levelLabel={levelLabel(2, mode)}
            groups={buildL2Groups()}
            onNodeClick={handleConvClick}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
          />
        ) : (
          <CollapsedStrip
            levelLabel={levelLabel(2, mode)}
            nodes={buildL2CollapsedNodes()}
            contentWidth={contentWidth}
            groupDividers={l2DividerFracs}
            onNodeClick={handleConvClick}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
          />
        ))}

        {/* ── L2→L3 connector ── */}
        {showL3 && !isMiscConv && l3NodeIds.length > 0 && (
          <ConnectorStrip connections={connectorsL2L3} contentWidth={contentWidth} />
        )}

        {/* ── L3 ── */}
        {showL3 && (
          isMiscConv ? (
            deepest === 3 && (
              <EmptyStateLevel
                levelLabel={levelLabel(3, mode)}
                onViewChat={() => { setTranscriptOpen(true); setActivePromptN(null); }}
              />
            )
          ) : (
            deepest === 3 ? (
              <ExpandedLevel
                levelLabel={levelLabel(3, mode)}
                groups={buildL3Groups()}
                onNodeClick={handleL3Click}
                onShowTooltip={showTooltip}
                onHideTooltip={hideTooltip}
              />
            ) : (
              <CollapsedStrip
                levelLabel={levelLabel(3, mode)}
                nodes={buildL3CollapsedNodes()}
                contentWidth={contentWidth}
                onNodeClick={handleL3Click}
                onShowTooltip={showTooltip}
                onHideTooltip={hideTooltip}
              />
            )
          )
        )}

        {/* ── L3→L4 connector ── */}
        {showL4 && l4NodeIds.length > 0 && (
          <ConnectorStrip connections={connectorsL3L4} contentWidth={contentWidth} />
        )}

        {/* ── L4 ── */}
        {showL4 && l4NodeIds.length > 0 && (
          deepest === 4 ? (
            <ExpandedLevel
              levelLabel={levelLabel(4, mode)}
              groups={buildL4Groups()}
              onNodeClick={mode === "decisions" ? handleL4Click : n => handlePromptClick(parseInt(n))}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
            />
          ) : (
            <CollapsedStrip
              levelLabel={levelLabel(4, mode)}
              nodes={buildL4CollapsedNodes()}
              contentWidth={contentWidth}
              onNodeClick={mode === "decisions" ? handleL4Click : n => handlePromptClick(parseInt(n))}
              onShowTooltip={showTooltip}
              onHideTooltip={hideTooltip}
            />
          )
        )}

        {/* ── L4→L5 connector (decisions mode only) ── */}
        {showL5 && l5NodeIds.length > 0 && (
          <ConnectorStrip connections={connectorsL4L5} contentWidth={contentWidth} />
        )}

        {/* ── L5 (prompts, decisions mode) ── */}
        {showL5 && l5NodeIds.length > 0 && (
          <ExpandedLevel
            levelLabel={levelLabel(5, mode)}
            groups={buildL5Groups()}
            onNodeClick={n => handlePromptClick(parseInt(n))}
            onShowTooltip={showTooltip}
            onHideTooltip={hideTooltip}
          />
        )}

        {/* ── Transcript panel ── */}
        {transcriptOpen && activeConv && (
          <div style={{ marginTop: 8 }}>
            <TranscriptPanel
              conversation={activeConv}
              activePromptN={transcriptPromptN}
              levelLabel={mode === "decisions" ? "L6 · full chat" : "L5 · full chat"}
              accentColor={topicColor(activeConv.cluster)}
              onClose={() => { setTranscriptOpen(false); setActivePromptN(null); }}
            />
          </div>
        )}

        {/* ── Hint line when nothing open ── */}
        {openTopics.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: C.textMuted,
              fontSize: 13,
              marginTop: 32,
            }}
          >
            Click a topic to open a branch. Open more than one to compare.
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && <Tooltip {...tooltip} />}
    </div>
  );
}
