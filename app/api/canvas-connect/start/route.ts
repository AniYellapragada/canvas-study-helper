import { NextResponse } from "next/server";
import { startCanvasLogin } from "@/lib/hyperbrowser";

export async function POST(req: Request) {
  const { canvasBaseUrl } = (await req.json()) as { canvasBaseUrl: string };

  if (!canvasBaseUrl || !/^https?:\/\//.test(canvasBaseUrl)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid Canvas URL, e.g. https://yourschool.instructure.com" },
      { status: 400 }
    );
  }

  try {
    const { sessionId, liveUrl } = await startCanvasLogin(canvasBaseUrl);
    return NextResponse.json({ ok: true, sessionId, liveUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
