import { NextResponse } from "next/server";
import { searchContent, addChatMessage, listChatMessages, getContentItem } from "@/lib/db";
import { chatAnswer } from "@/lib/gemini";
import { searchWeb } from "@/lib/hyperbrowser";

export async function POST(req: Request) {
  const { question, courseId, assignmentItemId } = (await req.json()) as {
    question: string;
    courseId?: number | null;
    assignmentItemId?: number | null;
  };

  if (!question || !question.trim()) {
    return NextResponse.json({ ok: false, error: "Question is required" }, { status: 400 });
  }

  try {
    const cid = courseId ?? null;
    const chunks = searchContent(cid, question, 6);

    // Canvas content and the open web are both treated as standing data sources
    // for every question, not an opt-in extra.
    let webChunks: { title: string; text: string; url?: string }[] = [];
    try {
      webChunks = await searchWeb(question, 3);
    } catch {
      // best-effort; proceed without web results
    }

    const assignmentItem = assignmentItemId ? getContentItem(assignmentItemId) : undefined;
    const assignment = assignmentItem
      ? { title: assignmentItem.title, text: assignmentItem.text, dueAt: assignmentItem.due_at }
      : null;

    const history = listChatMessages(cid, 10);
    const answer = await chatAnswer(question, chunks, webChunks, history, assignment);

    addChatMessage(cid, "user", question);
    addChatMessage(cid, "assistant", answer);

    return NextResponse.json({ ok: true, answer, sources: chunks.map((c) => c.title) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
