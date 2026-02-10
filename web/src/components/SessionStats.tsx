import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store.js";
import type { ContentBlock } from "../types.js";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(startMs: number): string {
  const elapsed = Math.max(0, Date.now() - startMs);
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function SessionStats({ sessionId }: { sessionId: string }) {
  const [isOpen, setIsOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const session = useStore((s) => s.sessions.get(sessionId));
  const messages = useStore((s) => s.messages.get(sessionId)) || [];
  const changedFiles = useStore((s) => s.changedFiles.get(sessionId));
  const tokensIn = useStore((s) => s.sessionTokensIn.get(sessionId)) || 0;
  const tokensOut = useStore((s) => s.sessionTokensOut.get(sessionId)) || 0;
  const cacheRead = useStore((s) => s.sessionCacheRead.get(sessionId)) || 0;
  const cacheCreation = useStore((s) => s.sessionCacheCreation.get(sessionId)) || 0;
  const sdkSession = useStore((s) => s.sdkSessions.find((sdk) => sdk.sessionId === sessionId));

  // Update timer every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Compute derived stats
  const { toolCallCount, cacheHitRate, contextPct, duration } = useMemo(() => {
    // Tool calls: count ContentBlocks with type === "tool_use"
    let toolCalls = 0;
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.contentBlocks) {
        for (const block of msg.contentBlocks) {
          if (block.type === "tool_use") {
            toolCalls++;
          }
        }
      }
    }

    // Cache hit rate: cacheRead / (cacheRead + cacheCreation + tokensIn) * 100
    const totalTokens = cacheRead + cacheCreation + tokensIn;
    const hitRate = totalTokens > 0 ? (cacheRead / totalTokens) * 100 : 0;

    // Context percentage
    const ctx = session?.context_used_percent ?? 0;

    // Duration from createdAt
    const dur = sdkSession?.createdAt ? formatDuration(sdkSession.createdAt) : "--";

    return {
      toolCallCount: toolCalls,
      cacheHitRate: hitRate,
      contextPct: ctx,
      duration: dur,
    };
  }, [messages, cacheRead, cacheCreation, tokensIn, session, sdkSession, currentTime]);

  const filesChanged = changedFiles?.size || 0;
  const linesAdded = session?.total_lines_added || 0;
  const linesRemoved = session?.total_lines_removed || 0;
  const numTurns = session?.num_turns || 0;
  const model = session?.model || "--";
  const cost = session?.total_cost_usd ?? 0;

  return (
    <div className="shrink-0 border-b border-cc-border">
      {/* Collapsible header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-cc-hover transition-colors"
      >
        <span className="text-[12px] font-semibold text-cc-fg">Stats</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 text-cc-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2.5">
          {/* Cost */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Cost</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">
              ${cost.toFixed(2)}
            </span>
          </div>

          {/* Tokens */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Tokens</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">
              {formatTokens(tokensIn)} in / {formatTokens(tokensOut)} out
            </span>
          </div>

          {/* Cache — with bar chart */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-cc-muted uppercase tracking-wider">Cache</span>
              <span className="text-[11px] text-cc-muted tabular-nums">
                {tokensIn + cacheRead + cacheCreation > 0 ? `${cacheHitRate.toFixed(0)}%` : "--"}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-cc-hover overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 bg-cc-success"
                style={{ width: `${tokensIn + cacheRead + cacheCreation > 0 ? Math.min(cacheHitRate, 100) : 0}%` }}
              />
            </div>
          </div>

          {/* Context usage */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-cc-muted uppercase tracking-wider">Context</span>
              <span className="text-[11px] text-cc-muted tabular-nums">
                {contextPct > 0 ? `${contextPct}%` : "--"}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-cc-hover overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  contextPct > 80
                    ? "bg-cc-error"
                    : contextPct > 50
                    ? "bg-cc-warning"
                    : "bg-cc-primary"
                }`}
                style={{ width: `${Math.min(contextPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Duration</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">{duration}</span>
          </div>

          {/* Turns */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Turns</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">{numTurns}</span>
          </div>

          {/* Messages */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Messages</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">
              {messages.length}
            </span>
          </div>

          {/* Tool calls */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Tool calls</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">
              {toolCallCount}
            </span>
          </div>

          {/* Files changed */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">
              Files changed
            </span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">{filesChanged}</span>
          </div>

          {/* Lines */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Lines</span>
            <span className="text-[13px] font-medium text-cc-fg tabular-nums">
              +{linesAdded} / -{linesRemoved}
            </span>
          </div>

          {/* Model */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cc-muted uppercase tracking-wider">Model</span>
            <span className="text-[13px] font-medium text-cc-fg truncate max-w-[180px]">
              {model}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
