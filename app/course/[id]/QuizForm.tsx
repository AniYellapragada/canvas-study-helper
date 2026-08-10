"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QuizForm({ courseId }: { courseId: number }) {
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, topic, count: 8 }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Quiz generation failed");
      router.push(`/quiz/${body.quizId}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border border-white/10 rounded p-4">
      <label className="text-sm text-white/70">
        Test / topic focus (optional — leave blank for a general review quiz)
      </label>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="e.g. Midterm 2: cell respiration"
        className="rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-fit rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
      >
        {status === "loading" ? "Generating..." : "Generate quiz"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
