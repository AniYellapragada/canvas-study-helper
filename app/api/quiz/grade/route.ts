import { NextResponse } from "next/server";
import { gradeShortAnswer } from "@/lib/gemini";

export async function POST(req: Request) {
  const { question, correctAnswer, userAnswer } = (await req.json()) as {
    question: string;
    correctAnswer: string;
    userAnswer: string;
  };

  try {
    const result = await gradeShortAnswer(question, correctAnswer, userAnswer);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
