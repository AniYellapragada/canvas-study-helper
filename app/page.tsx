import Link from "next/link";
import { listCourses, listUpcomingAssignments } from "@/lib/db";
import { getConnectionStatus } from "@/lib/hyperbrowser";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const courses = listCourses() as {
    id: number;
    name: string;
    course_code: string | null;
    last_synced_at: string | null;
    content_count: number;
  }[];
  const { connected } = getConnectionStatus();
  const upcoming = listUpcomingAssignments(2, 4);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold mb-2">Your Courses</h1>
        {connected ? (
          <SyncButton />
        ) : (
          <p className="text-sm text-white/60">
            Canvas isn&apos;t connected yet.{" "}
            <Link href="/connect" className="text-blue-400 hover:underline">
              Connect Canvas
            </Link>{" "}
            to get started.
          </p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-amber-300">Coming up</h2>
            <Link href="/schedule" className="text-xs text-amber-300/70 hover:underline">
              View full schedule
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium">{a.title}</span>
                  <span className="text-white/50"> — {a.course_name}</span>
                  <span className="text-white/40 text-xs block">
                    due {new Date(a.due_at).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <Link
                  href={`/chat?assignmentId=${a.id}`}
                  className="shrink-0 rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-medium"
                >
                  Need help?
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {courses.length === 0 ? (
        <p className="text-white/60 text-sm">
          No courses synced yet. {connected ? 'Click "Sync Canvas now" to pull in your active courses and content.' : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((c) => (
            <li
              key={c.id}
              className="border border-white/10 rounded p-4 flex items-center justify-between"
            >
              <div>
                <Link href={`/course/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <p className="text-xs text-white/50">
                  {c.course_code ?? ""} · {c.content_count} content items
                  {c.last_synced_at
                    ? ` · last synced ${new Date(c.last_synced_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <Link
                href={`/course/${c.id}`}
                className="text-sm text-blue-400 hover:underline"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
