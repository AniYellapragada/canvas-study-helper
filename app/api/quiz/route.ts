import { NextResponse } from "next/server";
import { searchContent, createQuiz, getCourse } from "@/lib/db";
import { generateQuiz } from "@/lib/gemini";

export async function POST(req: Request) {
  const { courseId, topic, count } = (await req.json()) as {
    courseId: number;
    topic?: string;
    count?: number;
  };

  const course = getCourse(courseId);
  if (!course) {
    return NextResponse.json({ ok: false, error: "Course not found" }, { status: 404 });
  }

  try {
    const query = topic && topic.trim() ? topic : course.name;
    let chunks = searchContent(courseId, query, 10);
    if (chunks.length === 0) {
      // fall back to broad course name search, then to any content for the course
      chunks = searchContent(courseId, course.name, 10);
    }

    const questions = await generateQuiz(
      topic ?? "",
      chunks.map((c) => ({ title: c.title, text: c.text })),
      count ?? 8
    );

    const quizId = createQuiz(courseId, topic ?? "", JSON.stringify(questions));

    return NextResponse.json({ ok: true, quizId });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
