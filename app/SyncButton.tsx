"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setStatus("syncing");
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Sync failed");
      const s = body.summary;
      setMessage(
        `Synced ${s.courses} courses: ${s.items} content items, ${s.videoTranscripts} video transcripts` +
          (s.itemErrors ? ` (${s.itemErrors} items failed to load).` : ".")
      );
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSync}
        disabled={status === "syncing"}
        className="w-fit rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
      >
        {status === "syncing" ? "Syncing..." : "Sync Canvas now"}
      </button>
      {message && (
        <p className={`text-sm ${status === "error" ? "text-red-400" : "text-white/70"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
