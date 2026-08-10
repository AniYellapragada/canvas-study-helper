import Link from "next/link";
import { listUpcomingAssignments } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDue(dueAt: string): { label: string; urgent: boolean; overdue: boolean } {
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) return { label: dueAt, urgent: false, overdue: false };

  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const label = due.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return {
    label,
    urgent: diffHours >= 0 && diffHours <= 48,
    overdue: diffHours < 0,
  };
}

export default function SchedulePage() {
  const assignments = listUpcomingAssignments();

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Schedule</h1>
        <p className="text-sm text-white/60">
          Upcoming and recently-due assignments and quizzes across your synced courses.
        </p>
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-white/60">
          Nothing with a due date yet. This fills in once you sync courses that have graded
          work with due dates on Canvas.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => {
            const due = formatDue(a.due_at);
            return (
              <li
                key={a.id}
                className={`border rounded p-4 flex items-center justify-between gap-4 ${
                  due.overdue
                    ? "border-red-500/30 bg-red-500/5"
                    : due.urgent
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/10"
                }`}
              >
                <div>
                  <p className="font-medium">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                  </p>
                  <p className="text-xs text-white/50">{a.course_name}</p>
                  <p
                    className={`text-xs mt-1 ${
                      due.overdue ? "text-red-400" : due.urgent ? "text-amber-400" : "text-white/50"
                    }`}
                  >
                    {due.overdue ? "Was due" : "Due"} {due.label}
                  </p>
                </div>
                <Link
                  href={`/chat?assignmentId=${a.id}`}
                  className="shrink-0 rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium"
                >
                  Get help
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
