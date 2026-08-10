import { notFound } from "next/navigation";
import { getCourse, listContentItems } from "@/lib/db";
import QuizForm from "./QuizForm";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = Number(id);
  const course = getCourse(courseId);
  if (!course) notFound();

  const items = listContentItems(courseId);
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">{course.name}</h1>
        <p className="text-sm text-white/50">{course.course_code}</p>
      </div>

      <QuizForm courseId={courseId} />

      {items.length === 0 ? (
        <p className="text-white/60 text-sm">
          No content synced for this course yet. Go to the dashboard and click &quot;Sync
          Canvas now&quot;.
        </p>
      ) : (
        Object.entries(grouped).map(([type, list]) => (
          <div key={type}>
            <h2 className="text-sm font-medium text-white/70 uppercase mb-2">
              {type.replace("_", " ")} ({list.length})
            </h2>
            <ul className="flex flex-col gap-1">
              {list.map((item) => (
                <li key={item.id} className="text-sm">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
