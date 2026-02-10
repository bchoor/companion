// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionStats, formatTokens, formatDuration } from "./SessionStats.js";
import { useStore } from "../store.js";
import type { SessionState, SdkSessionInfo, ChatMessage } from "../types.js";

// ─── Helper Function Tests ───────────────────────────────────────────────────

describe("formatTokens", () => {
  it("formats 0 as '0'", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("formats 500 as '500'", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("formats 1000 as '1.0K'", () => {
    expect(formatTokens(1000)).toBe("1.0K");
  });

  it("formats 1500 as '1.5K'", () => {
    expect(formatTokens(1500)).toBe("1.5K");
  });

  it("formats 45200 as '45.2K'", () => {
    expect(formatTokens(45200)).toBe("45.2K");
  });

  it("formats 1000000 as '1.0M'", () => {
    expect(formatTokens(1000000)).toBe("1.0M");
  });

  it("formats 2500000 as '2.5M'", () => {
    expect(formatTokens(2500000)).toBe("2.5M");
  });
});

describe("formatDuration", () => {
  beforeEach(() => {
    // Mock Date.now() for consistent testing
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats 30 seconds as '30s'", () => {
    const now = Date.now();
    const startMs = now - 30_000; // 30 seconds ago
    expect(formatDuration(startMs)).toBe("30s");
  });

  it("formats 5 minutes 30 seconds as '5m 30s'", () => {
    const now = Date.now();
    const startMs = now - (5 * 60 + 30) * 1000; // 5m 30s ago
    expect(formatDuration(startMs)).toBe("5m 30s");
  });

  it("formats 1 hour 23 minutes as '1h 23m'", () => {
    const now = Date.now();
    const startMs = now - (60 * 60 + 23 * 60) * 1000; // 1h 23m ago
    expect(formatDuration(startMs)).toBe("1h 23m");
  });

  it("formats 0 elapsed time as '0s'", () => {
    const now = Date.now();
    expect(formatDuration(now)).toBe("0s");
  });

  it("handles future times by returning '0s'", () => {
    const now = Date.now();
    const futureMs = now + 10_000; // 10 seconds in the future
    expect(formatDuration(futureMs)).toBe("0s");
  });
});

// ─── Store Token Accumulation Tests ──────────────────────────────────────────

describe("accumulateTokens store action", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("sets initial token values when called once", () => {
    const sessionId = "test-session-1";

    useStore.getState().accumulateTokens(sessionId, {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 25,
      cache_creation_input_tokens: 10,
    });

    const state = useStore.getState();
    expect(state.sessionTokensIn.get(sessionId)).toBe(100);
    expect(state.sessionTokensOut.get(sessionId)).toBe(50);
    expect(state.sessionCacheRead.get(sessionId)).toBe(25);
    expect(state.sessionCacheCreation.get(sessionId)).toBe(10);
  });

  it("accumulates tokens when called twice", () => {
    const sessionId = "test-session-2";

    useStore.getState().accumulateTokens(sessionId, {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 25,
      cache_creation_input_tokens: 10,
    });

    useStore.getState().accumulateTokens(sessionId, {
      input_tokens: 200,
      output_tokens: 75,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 5,
    });

    const state = useStore.getState();
    expect(state.sessionTokensIn.get(sessionId)).toBe(300);
    expect(state.sessionTokensOut.get(sessionId)).toBe(125);
    expect(state.sessionCacheRead.get(sessionId)).toBe(55);
    expect(state.sessionCacheCreation.get(sessionId)).toBe(15);
  });

  it("tracks different session IDs independently", () => {
    const sessionId1 = "test-session-3";
    const sessionId2 = "test-session-4";

    useStore.getState().accumulateTokens(sessionId1, {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 25,
      cache_creation_input_tokens: 10,
    });

    useStore.getState().accumulateTokens(sessionId2, {
      input_tokens: 200,
      output_tokens: 75,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 5,
    });

    const state = useStore.getState();
    expect(state.sessionTokensIn.get(sessionId1)).toBe(100);
    expect(state.sessionTokensIn.get(sessionId2)).toBe(200);
    expect(state.sessionTokensOut.get(sessionId1)).toBe(50);
    expect(state.sessionTokensOut.get(sessionId2)).toBe(75);
  });
});

// ─── Component Render Tests ──────────────────────────────────────────────────

describe("SessionStats component", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("renders with all stats visible when expanded", () => {
    const sessionId = "test-session-render-1";

    // Set up minimal state
    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId, total_cost_usd: 1.25 } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 1500]]),
      sessionTokensOut: new Map([[sessionId, 2500]]),
      sessionCacheRead: new Map([[sessionId, 500]]),
      sessionCacheCreation: new Map([[sessionId, 100]]),
      sdkSessions: [{ sessionId, createdAt: Date.now() - 60_000 } as SdkSessionInfo],
    });

    render(<SessionStats sessionId={sessionId} />);

    // Check for key labels
    expect(screen.getByText("Cost")).toBeTruthy();
    expect(screen.getByText("Tokens")).toBeTruthy();
    expect(screen.getByText("Cache")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
  });

  it("shows cost formatted to 2 decimal places", () => {
    const sessionId = "test-session-cost";

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId, total_cost_usd: 3.456 } as SessionState]]),
      messages: new Map([[sessionId, []]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    // Cost should be formatted to 2 decimals
    expect(container.textContent).toContain("$3.46");
  });

  it("shows token counts formatted with K/M suffix", () => {
    const sessionId = "test-session-tokens";

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 45200]]),
      sessionTokensOut: new Map([[sessionId, 1500000]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    // Tokens should be formatted with suffix
    expect(container.textContent).toContain("45.2K in");
    expect(container.textContent).toContain("1.5M out");
  });

  it("shows cache hit rate as percentage", () => {
    const sessionId = "test-session-cache";

    // Cache hit rate = cacheRead / (cacheRead + cacheCreation + tokensIn) * 100
    // = 1000 / (1000 + 500 + 500) * 100 = 50%
    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 500]]),
      sessionCacheRead: new Map([[sessionId, 1000]]),
      sessionCacheCreation: new Map([[sessionId, 500]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    // The component shows just "50%" in the Cache row, not "50% hit rate"
    expect(container.textContent).toContain("Cache");
    expect(container.textContent).toContain("50%");
  });

  it("shows '--' for cache when no tokens exist", () => {
    const sessionId = "test-session-no-cache";

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 0]]),
      sessionCacheRead: new Map([[sessionId, 0]]),
      sessionCacheCreation: new Map([[sessionId, 0]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    // Find the Cache row and check it contains "--"
    const text = container.textContent || "";
    expect(text).toContain("Cache");
    expect(text).toContain("--");
  });

  it("collapses and hides stats when clicking the header", () => {
    const sessionId = "test-session-collapse";

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId, total_cost_usd: 1.0 } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 1000]]),
    });

    render(<SessionStats sessionId={sessionId} />);

    // Initially expanded - cost should be visible
    expect(screen.getByText("Cost")).toBeTruthy();

    // Click the "Stats" button to collapse
    const statsButton = screen.getByText("Stats");
    fireEvent.click(statsButton);

    // After collapse, cost should not be visible
    expect(screen.queryByText("Cost")).toBeNull();
  });

  it("shows duration in correct format", () => {
    const sessionId = "test-session-duration";
    const createdAt = Date.now() - 5 * 60 * 1000 - 45 * 1000; // 5m 45s ago

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sdkSessions: [{ sessionId, createdAt } as SdkSessionInfo],
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("5m 45s");
  });

  it("counts tool calls correctly from messages", () => {
    const sessionId = "test-session-tool-calls";

    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        contentBlocks: [
          { type: "tool_use", id: "tu-1", name: "Read", input: {} },
          { type: "tool_use", id: "tu-2", name: "Bash", input: {} },
        ],
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        contentBlocks: [
          { type: "text", text: "Some text" },
          { type: "tool_use", id: "tu-3", name: "Write", input: {} },
        ],
      },
    ];

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, messages]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    // Should count 3 tool calls total
    expect(container.textContent).toContain("Tool calls");
    expect(container.textContent).toContain("3");
  });

  it("displays context percentage correctly", () => {
    const sessionId = "test-session-context";

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId, context_used_percent: 75 } as SessionState]]),
      messages: new Map([[sessionId, []]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("Context");
    expect(container.textContent).toContain("75%");
  });

  it("displays files changed count", () => {
    const sessionId = "test-session-files";
    const changedFiles = new Set(["/path/to/file1.ts", "/path/to/file2.ts"]);

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      changedFiles: new Map([[sessionId, changedFiles]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("Files changed");
    expect(container.textContent).toContain("2");
  });

  it("displays lines added and removed", () => {
    const sessionId = "test-session-lines";

    useStore.setState({
      sessions: new Map([[sessionId, {
        session_id: sessionId,
        total_lines_added: 150,
        total_lines_removed: 75,
      } as SessionState]]),
      messages: new Map([[sessionId, []]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("Lines");
    expect(container.textContent).toContain("+150");
    expect(container.textContent).toContain("-75");
  });

  it("displays model name", () => {
    const sessionId = "test-session-model";

    useStore.setState({
      sessions: new Map([[sessionId, {
        session_id: sessionId,
        model: "claude-sonnet-4-5-20250929",
      } as SessionState]]),
      messages: new Map([[sessionId, []]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("Model");
    expect(container.textContent).toContain("claude-sonnet-4-5-20250929");
  });

  it("displays number of turns", () => {
    const sessionId = "test-session-turns";

    useStore.setState({
      sessions: new Map([[sessionId, {
        session_id: sessionId,
        num_turns: 12,
      } as SessionState]]),
      messages: new Map([[sessionId, []]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("Turns");
    expect(container.textContent).toContain("12");
  });

  it("displays message count", () => {
    const sessionId = "test-session-messages";

    const messages: ChatMessage[] = [
      { id: "msg-1", role: "user", content: "Hello", timestamp: Date.now() },
      { id: "msg-2", role: "assistant", content: "Hi", timestamp: Date.now() },
      { id: "msg-3", role: "user", content: "How are you?", timestamp: Date.now() },
    ];

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, messages]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    expect(container.textContent).toContain("Messages");
    expect(container.textContent).toContain("3");
  });

  it("renders cache progress bar with bg-cc-success class when tokens exist", () => {
    const sessionId = "test-session-cache-bar";

    // Set up token data to produce a cache hit rate
    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 1000]]),
      sessionCacheRead: new Map([[sessionId, 500]]),
      sessionCacheCreation: new Map([[sessionId, 500]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    // Find the progress bar div with bg-cc-success class
    const progressBar = container.querySelector(".bg-cc-success");
    expect(progressBar).toBeTruthy();
    expect(progressBar?.classList.contains("rounded-full")).toBe(true);
    expect(progressBar?.classList.contains("transition-all")).toBe(true);
  });

  it("renders cache bar width matching cache hit rate percentage", () => {
    const sessionId = "test-session-cache-bar-width";

    // Cache hit rate = cacheRead / (cacheRead + cacheCreation + tokensIn) * 100
    // = 600 / (600 + 200 + 200) * 100 = 60%
    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 200]]),
      sessionCacheRead: new Map([[sessionId, 600]]),
      sessionCacheCreation: new Map([[sessionId, 200]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    const progressBar = container.querySelector(".bg-cc-success") as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.style.width).toBe("60%");
  });

  it("renders cache bar with zero width when no tokens exist", () => {
    const sessionId = "test-session-cache-bar-zero";

    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 0]]),
      sessionCacheRead: new Map([[sessionId, 0]]),
      sessionCacheCreation: new Map([[sessionId, 0]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    const progressBar = container.querySelector(".bg-cc-success") as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.style.width).toBe("0%");
  });

  it("caps cache bar width at 100% even if cache hit rate exceeds 100", () => {
    const sessionId = "test-session-cache-bar-cap";

    // Artificially create a scenario where cache hit rate could theoretically exceed 100%
    // This shouldn't happen in practice, but the component has Math.min(cacheHitRate, 100)
    useStore.setState({
      sessions: new Map([[sessionId, { session_id: sessionId } as SessionState]]),
      messages: new Map([[sessionId, []]]),
      sessionTokensIn: new Map([[sessionId, 10]]),
      sessionCacheRead: new Map([[sessionId, 1000]]), // Very high cache read
      sessionCacheCreation: new Map([[sessionId, 10]]),
    });

    const { container } = render(<SessionStats sessionId={sessionId} />);

    const progressBar = container.querySelector(".bg-cc-success") as HTMLElement;
    expect(progressBar).toBeTruthy();
    // Should be capped at 100%
    const width = parseFloat(progressBar.style.width);
    expect(width).toBeLessThanOrEqual(100);
  });
});
