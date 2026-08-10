"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/gemini";

type GradeResult = { correct: boolean; feedback: string };

export default function QuizRunner({
  quizId,
  questions,
}: {
  quizId: number;
  questions: QuizQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, GradeResult>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});

  function setAnswer(i: number, value: string) {
    setAnswers((a) => ({ ...a, [i]: value }));
  }

  async function submit(i: number, q: QuizQuestion) {
    const userAnswer = answers[i] ?? "";
    if (q.type === "mcq") {
      setResults((r) => ({
        ...r,
        [i]: {
          correct: userAnswer.trim() === q.answer.trim(),
          feedback: userAnswer.trim() === q.answer.trim() ? "Correct." : `Correct answer: ${q.answer}`,
        },
      }));
      return;
    }

    setGrading((g) => ({ ...g, [i]: true }));
    try {
      const res = await fetch("/api/quiz/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.question, correctAnswer: q.answer, userAnswer }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Grading failed");
      setResults((r) => ({ ...r, [i]: { correct: body.correct, feedback: body.feedback } }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [i]: { correct: false, feedback: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setGrading((g) => ({ ...g, [i]: false }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {questions.map((q, i) => {
        const result = results[i];
        return (
          <div key={i} className="border border-white/10 rounded p-4 flex flex-col gap-3">
            <p className="font-medium">
              {i + 1}. {q.question}
            </p>

            {q.type === "mcq" ? (
              <div className="flex flex-col gap-1">
                {(q.choices ?? []).map((choice) => (
                  <label key={choice} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`q-${quizId}-${i}`}
                      value={choice}
                      checked={answers[i] === choice}
                      onChange={() => setAnswer(i, choice)}
                    />
                    {choice}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[i] ?? ""}
                onChange={(e) => setAnswer(i, e.target.value)}
                className="rounded bg-black/30 border border-white/10 px-3 py-2 text-sm"
                rows={2}
              />
            )}

            <button
              onClick={() => submit(i, q)}
              disabled={grading[i] || !answers[i]}
              className="w-fit rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-sm"
            >
              {grading[i] ? "Grading..." : "Submit answer"}
            </button>

            {result && (
              <p className={`text-sm ${result.correct ? "text-emerald-400" : "text-red-400"}`}>
                {result.correct ? "✓ " : "✗ "}
                {result.feedback}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
