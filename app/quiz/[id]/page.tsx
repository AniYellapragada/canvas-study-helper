import { notFound } from "next/navigation";
import { getQuiz } from "@/lib/db";
import type { QuizQuestion } from "@/lib/gemini";
import QuizRunner from "./QuizRunner";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quiz = getQuiz(Number(id));
  if (!quiz) notFound();

  const questions = JSON.parse(quiz.questions_json) as QuizQuestion[];

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Quiz{quiz.topic ? `: ${quiz.topic}` : ""}</h1>
        <p className="text-sm text-white/50">{questions.length} questions</p>
      </div>
      <QuizRunner quizId={quiz.id} questions={questions} />
    </div>
  );
}
