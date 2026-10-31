"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, apiJson } from "@/lib/apiClient";
import { tokenizeStudyText } from "@/lib/studyChemistry";

// ─── Types (same as study page) ────────────────────────────────────────────
interface CoachMessage {
  role: "user" | "coach";
  content: string;
  timestamp: string;
}

interface CoachProfile {
  coach_name?: string;
  next_best_action?: string;
  daily_strategy?: string;
}

// ─── Chemistry text rendering (reused from study page) ────────────────────
function renderChemistryText(value: string) {
  return tokenizeStudyText(value).map((part, pieceIndex) => {
    if (part.kind === "hybridization") {
      return (
        <span key={pieceIndex}>
          sp<sup>{part.superscript}</sup>
        </span>
      );
    }
    if (part.kind === "variable_subscript") return <span key={pieceIndex}>{part.value}<sub>{part.subscript}</sub></span>;
    if (part.kind === "variable_power") {
      return (
        <span key={pieceIndex}>
          {part.value}<sup>{part.superscript}</sup>
        </span>
      );
    }
    if (part.kind === "text") {
      return <span key={pieceIndex}>{part.value}</span>;
    }
    return (
      <span key={pieceIndex}>
        {part.atoms.map((atom, atomIndex) => (
          <span key={`${pieceIndex}-${atomIndex}`}>
            {atom.symbol}
            {atom.subscript ? <sub>{atom.subscript}</sub> : null}
          </span>
        ))}
        {part.superscript ? <sup>{part.superscript}</sup> : null}
      </span>
    );
  });
}

// ─── Main Widget ───────────────────────────────────────────────────────────
export default function CoachWidget() {
  const { user, profile: accountProfile } = useAuth();
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

  const [open, setOpen] = useState(false);
  const [coachName, setCoachName] = useState("AI Coach");
  const [nextBestAction, setNextBestAction] = useState("Loading your personal coach…");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [coachReady, setCoachReady] = useState(false);
  const [progress, setProgress] = useState<{ accuracy: number; total_tests: number } | null>(null);
  const [greeting, setGreeting] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch coach data + user progress
  useEffect(() => {
    if (!user) return;
    const activeUser = user;
    let cancelled = false;

    async function loadCoach() {
      try {
        const token = await activeUser.getIdToken();
        const [coachData, progressData] = await Promise.all([
          apiJson<{ profile?: CoachProfile }>(`${backendURL}/coach/${activeUser.uid}`, {
            headers: { Authorization: `Bearer ${token}` },
            cacheKey: `coach:${activeUser.uid}`,
            cacheTtlMs: 30000,
            retries: 1,
            timeoutMs: 7000,
          }).catch((): { profile?: CoachProfile } => ({ profile: {} })),
          apiJson<{ accuracy?: number; total_tests?: number }>(`${backendURL}/get-progress/${activeUser.uid}`, {
            headers: { Authorization: `Bearer ${token}` },
            cacheKey: `progress:${activeUser.uid}`,
            cacheTtlMs: 30000,
            retries: 1,
            timeoutMs: 7000,
          }).catch((): { accuracy?: number; total_tests?: number } => ({})),
        ]);

        if (cancelled) return;

        const profile: CoachProfile = coachData.profile ?? {};
        setCoachName(profile.coach_name || "AI Coach");
        setNextBestAction(
          profile.next_best_action || profile.daily_strategy || "Ask me anything about your study plan."
        );
        setProgress({
          accuracy: progressData.accuracy ?? 0,
          total_tests: progressData.total_tests ?? 0,
        });

        const hour = new Date().getHours();
        const timeGreet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const name = accountProfile?.name || "Student";
        setGreeting(`${timeGreet}, ${name}!`);
      } catch {
        if (!cancelled) {
          setNextBestAction("I'm waking up… try again in a moment.");
        }
      } finally {
        if (!cancelled) {
          setCoachReady(true);
        }
      }
    }

    void loadCoach();

    return () => {
      cancelled = true;
    };
  }, [accountProfile?.name, user, backendURL]);

  // Auto‑scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Send message to coach (real backend)
  const handleSend = async () => {
    if (!input.trim() || !user || loading) return;
    const userMsg: CoachMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const res = await apiFetch(`${backendURL}/coach/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.uid,
          message: userMsg.content,
          mode: "coach",
          intent: "quick_chat",
          session_id: `widget-${user.uid}`,
        }),
        retries: 1,
        timeoutMs: 12000,
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "coach",
            content: data.answer || "I'm online, but couldn't generate a response right now.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "coach", content: "I'm having trouble connecting. Try again.", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "coach", content: "Network error. Please check your connection.", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick suggestion click
  const askSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-[#0E7490]/30 bg-[#0A0A0F]/90 backdrop-blur-md px-4 py-3 shadow-[0_0_30px_rgba(14,116,144,0.2)] transition-all hover:border-[#0E7490]/60 hover:shadow-[0_0_50px_rgba(14,116,144,0.4)] animate-pulse-subtle"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-sm font-bold text-[#0E7490] font-mono">{coachName}</span>
        </button>
      )}

      {/* Expanded Chat Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 w-full max-w-[420px] sm:bottom-6 sm:right-6 sm:w-auto sm:max-w-[420px] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex h-[70vh] sm:h-[540px] flex-col rounded-t-2xl sm:rounded-2xl border border-[#0E7490]/20 bg-[#0A0A0F]/95 backdrop-blur-md shadow-[0_0_60px_rgba(14,116,144,0.15)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black/30 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-bold text-[#0E7490] font-mono">{coachName}</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Clear chat button */}
                <button
                  onClick={clearChat}
                  className="rounded-md border border-white/20 px-2 py-1 text-[10px] text-gray-400 hover:border-red-400/40 hover:text-red-400"
                  title="Clear chat"
                >
                  Clear
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-white/20 px-2 py-1 text-[10px] text-gray-400 hover:border-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Greeting & dynamic suggestion */}
            <div className="border-b border-white/10 px-4 py-2.5">
              {greeting && (
                <p className="text-xs text-gray-400 mb-1 font-mono">{greeting}</p>
              )}
              {nextBestAction && (
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-400 flex-1 pr-2 leading-relaxed">
                    {renderChemistryText(nextBestAction)}
                  </p>
                  {coachReady && (
                    <button
                      onClick={() => askSuggestion(nextBestAction)}
                      className="shrink-0 rounded-md border border-orange-400/30 bg-orange-400/10 px-2 py-1 text-[10px] text-orange-400 hover:bg-orange-400/20"
                    >
                      Ask
                    </button>
                  )}
                </div>
              )}
              {/* Performance‑aware nudge */}
              {progress && (
                <p className="text-[10px] text-gray-500 mt-1 font-mono">
                  {progress.total_tests === 0
                    ? "You haven’t taken a test yet. I can create one for you."
                    : progress.accuracy >= 75
                    ? `Your accuracy is ${progress.accuracy}% — you're doing great!`
                    : `Your accuracy is ${progress.accuracy}%. Let’s work on improving it together.`}
                </p>
              )}
            </div>

            {/* Quick actions (contextual) */}
            {coachReady && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {nextBestAction && (
                  <button
                    onClick={() => askSuggestion(nextBestAction)}
                    className="rounded-md border border-[#0E7490]/20 bg-[#0E7490]/10 px-3 py-1.5 text-[10px] text-[#0E7490] hover:bg-[#0E7490]/20"
                  >
                    {nextBestAction}
                  </button>
                )}
                <button
                  onClick={() => askSuggestion("What should I study next?")}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] text-gray-400 hover:text-white"
                >
                  Study plan
                </button>
                <button
                  onClick={() => askSuggestion("Find my weakest topic.")}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] text-gray-400 hover:text-white"
                >
                  Weak topics
                </button>
                <button
                  onClick={() => askSuggestion("Give me a quick revision summary.")}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] text-gray-400 hover:text-white"
                >
                  Revision
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-gray-600">
                  <p>Ask {coachName} anything about your study, weak topics, or exam strategies.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-500/10 text-blue-100"
                        : "bg-white/5 text-gray-200"
                    }`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`text-xs font-semibold ${msg.role === "user" ? "text-blue-400" : "text-orange-400"}`}>
                          {msg.role === "user" ? "You" : coachName}
                        </span>
                        <span className="text-[10px] text-gray-600">{msg.timestamp}</span>
                      </div>
                      <div>{renderChemistryText(msg.content)}</div>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl bg-white/5 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-orange-400" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-orange-400" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-orange-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/10 p-3">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${coachName}...`}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-gray-600 outline-none focus:border-[#0E7490]"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="rounded-lg bg-[#0E7490] px-5 text-xs font-bold text-white transition-all hover:bg-[#0E7490]/80 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  SEND
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtle pulse animation */}
      <style jsx global>{`
        @keyframes pulse-subtle {
          0%, 100% { box-shadow: 0 0 30px rgba(14,116,144,0.2); }
          50% { box-shadow: 0 0 50px rgba(14,116,144,0.4); }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s infinite;
        }
        @keyframes slide-in-from-bottom-4 {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-in.slide-in-from-bottom-4 {
          animation: slide-in-from-bottom-4 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
