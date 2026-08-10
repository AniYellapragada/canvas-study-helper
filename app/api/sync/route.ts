import { NextResponse } from "next/server";
import {
  extractCourseList,
  listCourseItems,
  scrapeItemContent,
  extractVideoTranscript,
  getCanvasBaseUrl,
  getConnectionStatus,
} from "@/lib/hyperbrowser";
import { upsertCourse, replaceContentItem } from "@/lib/db";

// Bounds how many items we scrape per course, so a huge course (a full semester of
// weekly modules) can't turn one sync into an hours-long run. Increase if needed.
const ITEMS_PER_COURSE_CAP = 50;

export async function POST() {
  const status = getConnectionStatus();
  const baseUrl = getCanvasBaseUrl();
  if (!status.connected || !baseUrl) {
    return NextResponse.json(
      { ok: false, error: "Canvas is not connected yet. Go to /connect and log in first." },
      { status: 400 }
    );
  }

  const summary = {
    courses: 0,
    items: 0,
    videoTranscripts: 0,
    itemErrors: 0,
  };

  try {
    const courses = await extractCourseList(baseUrl);

    for (const course of courses) {
      const canvasCourseId = Number(course.canvasCourseId);
      if (!Number.isFinite(canvasCourseId)) continue;

      const courseId = upsertCourse(canvasCourseId, course.name, null);
      summary.courses++;

      let refs;
      try {
        refs = await listCourseItems(baseUrl, course.canvasCourseId);
      } catch {
        continue;
      }

      const toScrape = refs.filter((r) => r.type !== "file").slice(0, ITEMS_PER_COURSE_CAP);

      // Sequential on purpose: the connected Hyperbrowser account is on the free
      // plan (1 concurrent session), so parallel scrape calls would just fail.
      for (const item of toScrape) {
        try {
          const { text, likelyVideo } = await scrapeItemContent(item.url);
          if (text && text.trim().length > 0) {
            replaceContentItem(
              courseId,
              item.canvasItemId,
              item.type,
              item.title,
              item.url,
              text.trim(),
              null,
              item.dueAt
            );
            summary.items++;
          }

          if (likelyVideo) {
            const transcript = await extractVideoTranscript(item.url);
            if (transcript) {
              replaceContentItem(courseId, item.canvasItemId, "video_transcript", item.title, item.url, transcript, null);
              summary.videoTranscripts++;
            }
          }
        } catch {
          summary.itemErrors++;
        }
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
