"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ConnectClient({
  initialBaseUrl,
  connected,
  connectedAt,
}: {
  initialBaseUrl: string;
  connected: boolean;
  connectedAt: string | null;
}) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "waiting" | "finishing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function startLogin() {
    setStatus("starting");
    setError(null);
    try {
      const res = await fetch("/api/canvas-connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasBaseUrl: baseUrl }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to start login session");
      setSessionId(body.sessionId);
      setLiveUrl(body.liveUrl);
      setStatus("waiting");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function finishLogin() {
    if (!sessionId) return;
    setStatus("finishing");
    setError(null);
    try {
      const res = await fetch("/api/canvas-connect/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to finish login session");
      setSessionId(null);
      setLiveUrl(null);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="text-sm">
        Status:{" "}
        {connected ? (
          <span className="text-emerald-400">
            Connected {connectedAt ? `(last login ${new Date(connectedAt).toLocaleString()})` : ""}
          </span>
        ) : (
          <span className="text-white/50">Not connected</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/70">Your Canvas URL</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://yourschool.instructure.com"
          disabled={status === "waiting" || status === "finishing"}
          className="rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
        />
      </div>

      {!sessionId ? (
        <button
          onClick={startLogin}
          disabled={status === "starting" || !baseUrl}
          className="w-fit rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
        >
          {status === "starting" ? "Starting..." : connected ? "Re-connect / log in again" : "Start login"}
        </button>
      ) : (
        <div className="flex flex-col gap-3 border border-white/10 rounded p-4">
          <p className="text-sm text-white/70">
            Open the link below in a new tab. It's a live, remote browser window — log into Canvas
            there yourself (including any school SSO / two-factor step). Your password is typed
            directly into Canvas in that window; it never passes through this app. When you're
            fully logged in and see your Canvas dashboard, come back here and click &quot;Done&quot;.
          </p>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline text-sm break-all"
            >
              Open Canvas login window →
            </a>
          )}
          <button
            onClick={finishLogin}
            disabled={status === "finishing"}
            className="w-fit rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-medium"
          >
            {status === "finishing" ? "Saving session..." : "Done — I'm logged in"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
