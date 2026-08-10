import { listCourses, getContentItem } from "@/lib/db";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; assignmentId?: string }>;
}) {
  const { courseId, assignmentId } = await searchParams;
  const courses = listCourses() as { id: number; name: string }[];

  const assignmentItem = assignmentId ? getContentItem(Number(assignmentId)) : undefined;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">AI Study Helper</h1>
      <ChatClient
        courses={courses}
        initialCourseId={courseId ?? (assignmentItem ? String(assignmentItem.course_id) : "")}
        initialAssignment={
          assignmentItem ? { id: assignmentItem.id, title: assignmentItem.title } : null
        }
      />
    </div>
  );
}
