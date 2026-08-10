import { NextResponse } from "next/server";
import { finishCanvasLogin } from "@/lib/hyperbrowser";

export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId: string };

  try {
    await finishCanvasLogin(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
