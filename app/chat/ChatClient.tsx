"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string; sources?: string[] };

export default function ChatClient({
  courses,
  initialCourseId = "",
  initialAssignment = null,
}: {
  courses: { id: number; name: string }[];
  initialCourseId?: string;
  initialAssignment?: { id: number; title: string } | null;
}) {
  const [courseId, setCourseId] = useState<string>(initialCourseId);
  const [assignment] = useState(initialAssignment);
  const [input, setInput] = useState(
    initialAssignment ? `Can you help me understand "${initialAssignment.title}"?` : ""
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const question = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          courseId: courseId ? Number(courseId) : null,
          assignmentItemId: assignment?.id ?? null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Chat failed");
      setMessages((m) => [...m, { role: "assistant", content: body.answer, sources: body.sources }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {assignment && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          <p className="font-medium text-emerald-300">
            Assignment help mode: {assignment.title}
          </p>
          <p className="text-emerald-100/70 text-xs mt-1">
            I&apos;ll help you understand this and work through it, but I won&apos;t write
            answers, code, or text you can submit directly — the work should stay yours.
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Course scope:
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="rounded bg-black/30 border border-white/10 px-2 py-1"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-white/40">Sources: your Canvas courses + the open web</span>
      </div>

      <div className="flex flex-col gap-3 min-h-[200px]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded p-3 text-sm ${
              m.role === "user" ? "bg-blue-600/20 self-end" : "bg-white/5"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.sources && m.sources.length > 0 && (
              <p className="text-xs text-white/40 mt-2">Sources: {m.sources.join(", ")}</p>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-white/50">Thinking...</p>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about your courses..."
          className="flex-1 rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={loading}
          className="rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
