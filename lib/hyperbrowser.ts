import { Hyperbrowser } from "@hyperbrowser/sdk";
import { chromium } from "playwright-core";
import { getSetting, setSetting } from "@/lib/db";

const PROFILE_ID_KEY = "hyperbrowser_profile_id";
const CANVAS_BASE_URL_KEY = "canvas_base_url";
const CANVAS_CONNECTED_AT_KEY = "canvas_connected_at";

let client: InstanceType<typeof Hyperbrowser> | null = null;

function getClient(): InstanceType<typeof Hyperbrowser> {
  if (client) return client;
  const apiKey = process.env.HYPERBROWSER_API_KEY;
  if (!apiKey) throw new Error("HYPERBROWSER_API_KEY must be set in .env.local");
  client = new Hyperbrowser({ apiKey });
  return client;
}

export function getCanvasBaseUrl(): string | null {
  return getSetting(CANVAS_BASE_URL_KEY);
}

export function getConnectionStatus(): { connected: boolean; baseUrl: string | null; connectedAt: string | null } {
  return {
    connected: !!getSetting(PROFILE_ID_KEY) && !!getSetting(CANVAS_CONNECTED_AT_KEY),
    baseUrl: getSetting(CANVAS_BASE_URL_KEY),
    connectedAt: getSetting(CANVAS_CONNECTED_AT_KEY),
  };
}

async function getOrCreateProfileId(): Promise<string> {
  const existing = getSetting(PROFILE_ID_KEY);
  if (existing) return existing;

  const hb = getClient();
  const profile = await hb.profiles.create({ name: "canvas-study-helper" });
  setSetting(PROFILE_ID_KEY, profile.id);
  return profile.id;
}

/**
 * Starts an interactive browser session bound to our persistent profile, navigates
 * it to the Canvas login page, and returns a live-view URL the user opens in their
 * own browser tab to log in themselves (handles school SSO/2FA safely — credentials
 * never pass through our server). Ending the session (see finishLogin) persists the
 * resulting cookies to the profile for future automated scraping.
 */
export async function startCanvasLogin(canvasBaseUrl: string): Promise<{ sessionId: string; liveUrl: string }> {
  const baseUrl = canvasBaseUrl.replace(/\/$/, "");
  setSetting(CANVAS_BASE_URL_KEY, baseUrl);

  const profileId = await getOrCreateProfileId();
  const hb = getClient();

  // Free-tier accounts only allow one concurrent session — close any left over
  // from an abandoned login attempt (e.g. the user never clicked "Done") so a
  // new one can start.
  try {
    const active = await hb.sessions.list({ status: "active" });
    await Promise.all(active.sessions.map((s) => hb.sessions.stop(s.id).catch(() => {})));
  } catch {
    // best effort
  }

  const session = await hb.sessions.create({
    profile: { id: profileId, persistChanges: true },
  });

  try {
    const browser = await chromium.connectOverCDP(session.wsEndpoint);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Deliberately not calling browser.close() here — for a CDP-attached browser,
    // Playwright's close() terminates the actual remote Hyperbrowser session, not
    // just this local connection, which would kill the session before the user
    // ever gets to use the live-view link.
  } catch {
    // Best effort — if navigation fails the user can still type the URL
    // themselves inside the live view.
  }

  return { sessionId: session.id, liveUrl: session.liveUrl ?? "" };
}

export async function finishCanvasLogin(sessionId: string): Promise<void> {
  const hb = getClient();
  await hb.sessions.stop(sessionId);
  setSetting(CANVAS_CONNECTED_AT_KEY, new Date().toISOString());
}

function requireProfileId(): string {
  const id = getSetting(PROFILE_ID_KEY);
  if (!id) throw new Error("Canvas is not connected yet. Go to /connect and log in first.");
  return id;
}

export interface CanvasCourseRef {
  canvasCourseId: string;
  name: string;
  url: string;
}

/**
 * Extracts the student's active course list from their Canvas "All Courses" page,
 * using the authenticated browser profile.
 */
export async function extractCourseList(canvasBaseUrl: string): Promise<CanvasCourseRef[]> {
  const profileId = requireProfileId();
  const hb = getClient();

  const result = await hb.extract.startAndWait({
    urls: [`${canvasBaseUrl}/courses`],
    prompt:
      "This is a student's Canvas 'All Courses' page. List every course the student is currently " +
      "actively enrolled in (skip past/concluded courses if labeled as such). For each, give its " +
      "Canvas course ID (the number in its URL, e.g. /courses/12345), its name, and its full URL.",
    schema: {
      type: "object",
      properties: {
        courses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              canvasCourseId: { type: "string" },
              name: { type: "string" },
              url: { type: "string" },
            },
            required: ["canvasCourseId", "name", "url"],
          },
        },
      },
      required: ["courses"],
    },
    sessionOptions: { profile: { id: profileId, persistChanges: true } },
  });

  const data = result.data as { courses?: CanvasCourseRef[] } | undefined;
  return data?.courses ?? [];
}

export interface ScrapedContentItem {
  canvasItemId: string;
  type: "page" | "assignment" | "announcement" | "video_transcript" | "other";
  title: string;
  url: string;
  text: string;
}

export interface CanvasItemRef {
  canvasItemId: string;
  type: "page" | "assignment" | "discussion" | "quiz" | "file" | "other";
  title: string;
  url: string;
  /** ISO 8601 due date/time, if this item is an assignment/quiz with one. */
  dueAt: string | null;
}

/**
 * Lists every module item, announcement, and assignment (with due dates) for a
 * course, without following any further links. This is a cheap, single-page-per-
 * seed listing step — the actual content of each item is fetched separately by
 * scrapeItemContent, since asking one big crawl to both discover and read
 * everything tends to run out of its link budget on shallow content first.
 */
export async function listCourseItems(canvasBaseUrl: string, courseId: string): Promise<CanvasItemRef[]> {
  const profileId = requireProfileId();
  const hb = getClient();

  const result = await hb.extract.startAndWait({
    urls: [
      `${canvasBaseUrl}/courses/${courseId}/modules`,
      `${canvasBaseUrl}/courses/${courseId}/announcements`,
      `${canvasBaseUrl}/courses/${courseId}/assignments`,
    ],
    prompt:
      "The first page is a Canvas course's modules page, the second its announcements list, the " +
      "third its assignments list (which shows due dates). List EVERY module item shown on the " +
      "modules page (pages, assignments, discussions, quizzes, files — including ones nested inside " +
      "collapsed sections; expand sections if needed) and EVERY announcement. Do not visit or follow " +
      "any of these links — only read what's on these three pages. For each item give: a stable id " +
      "(the trailing number in its URL), its type, its title, its full URL, and — for assignments and " +
      "quizzes only — the due date/time shown on the assignments page for that same item (match by " +
      "title), as an ISO 8601 string, or null if there is no due date or the item isn't graded work. " +
      "Skip SubHeader/divider items with no real link.",
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              canvasItemId: { type: "string" },
              type: {
                type: "string",
                enum: ["page", "assignment", "discussion", "quiz", "file", "announcement", "other"],
              },
              title: { type: "string" },
              url: { type: "string" },
              dueAt: { type: ["string", "null"] },
            },
            required: ["canvasItemId", "type", "title", "url", "dueAt"],
          },
        },
      },
      required: ["items"],
    },
    sessionOptions: { profile: { id: profileId, persistChanges: true } },
  });

  const data = result.data as { items?: CanvasItemRef[] } | undefined;
  return (data?.items ?? []).filter((i) => i.url);
}

const VIDEO_HOST_HINTS = [
  "panopto",
  "arc.instructure",
  "studio.instructure",
  "youtube",
  "youtu.be",
  "vimeo",
  "kaltura",
  "brightcove",
];

/**
 * Scrapes a single item's page for its readable text content, and flags whether
 * the page appears to embed a video player (checked against the raw HTML, since
 * video embeds are usually iframes that don't show up in rendered text).
 */
export async function scrapeItemContent(
  url: string
): Promise<{ text: string; likelyVideo: boolean }> {
  const profileId = requireProfileId();
  const hb = getClient();

  const result = await hb.scrape.startAndWait({
    url,
    sessionOptions: { profile: { id: profileId, persistChanges: true } },
    scrapeOptions: { formats: ["markdown", "html"], onlyMainContent: true, timeout: 30000 },
  });

  const text = result.data?.markdown ?? "";
  const html = (result.data?.html ?? "").toLowerCase();
  const likelyVideo = VIDEO_HOST_HINTS.some((hint) => html.includes(hint));

  return { text, likelyVideo };
}

/**
 * For a page known/suspected to embed a video, opens it, expands its transcript
 * or closed-captions panel if present, and returns the transcript text. Best
 * effort — returns an empty string if no transcript is available.
 */
export async function extractVideoTranscript(url: string): Promise<string> {
  const profileId = requireProfileId();
  const hb = getClient();

  const result = await hb.extract.startAndWait({
    urls: [url],
    prompt:
      "This page contains an embedded video player. Open it, and open/expand its transcript or " +
      "closed-captions panel if present, then extract the full transcript text in order. If there " +
      "is no transcript or captions available, return an empty string.",
    schema: {
      type: "object",
      properties: { transcript: { type: "string" } },
      required: ["transcript"],
    },
    sessionOptions: { profile: { id: profileId, persistChanges: true } },
  });

  const data = result.data as { transcript?: string } | undefined;
  return data?.transcript?.trim() ?? "";
}

export interface WebResult {
  title: string;
  url: string;
  text: string;
}

/**
 * Searches the web and scrapes the top results' text content, for use as extra
 * context in the AI chat helper when Canvas content alone doesn't answer the question.
 */
export async function searchWeb(query: string, maxResults = 3): Promise<WebResult[]> {
  const hb = getClient();

  const result = await hb.extract.startAndWait({
    urls: [`https://www.bing.com/search?q=${encodeURIComponent(query)}`],
    prompt:
      `Search results for the query "${query}". Identify the top ${maxResults} organic result links, ` +
      "then visit each and extract its title, url, and a concise summary of the page's relevant text content.",
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              text: { type: "string" },
            },
            required: ["title", "url", "text"],
          },
        },
      },
      required: ["results"],
    },
  });

  const data = result.data as { results?: WebResult[] } | undefined;
  return data?.results?.slice(0, maxResults) ?? [];
}
