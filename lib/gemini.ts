import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY must be set in .env.local");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export const MODEL = "gemini-3.5-flash";

export interface QuizQuestion {
  type: "mcq" | "short_answer";
  question: string;
  choices?: string[];
  answer: string;
}

export async function generateQuiz(
  topic: string,
  contextChunks: { title: string; text: string }[],
  count = 8
): Promise<QuizQuestion[]> {
  const gemini = getGemini();
  const context = contextChunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.text.slice(0, 2000)}`)
    .join("\n\n");

  const response = await gemini.models.generateContent({
    model: MODEL,
    contents: `Topic/test focus: ${topic || "general review of this course"}\n\nCourse content:\n${context}\n\nGenerate ${count} quiz questions covering this material.`,
    config: {
      systemInstruction:
        "You are a study quiz generator. Produce quiz questions strictly grounded in the provided course content.",
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["mcq", "short_answer"] },
            question: { type: "string" },
            choices: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
            answer: { type: "string" },
          },
          required: ["type", "question", "answer"],
        },
      },
    },
  });

  if (!response.text) throw new Error("No text response from Gemini");
  return JSON.parse(response.text);
}

export async function gradeShortAnswer(
  question: string,
  correctAnswer: string,
  userAnswer: string
): Promise<{ correct: boolean; feedback: string }> {
  const gemini = getGemini();
  const response = await gemini.models.generateContent({
    model: MODEL,
    contents: `Question: ${question}\nExpected answer: ${correctAnswer}\nStudent answer: ${userAnswer}`,
    config: {
      systemInstruction:
        "You grade short-answer quiz responses. Be lenient about phrasing but strict about factual correctness.",
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          correct: { type: "boolean" },
          feedback: { type: "string" },
        },
        required: ["correct", "feedback"],
      },
    },
  });

  if (!response.text) throw new Error("No text response from Gemini");
  return JSON.parse(response.text);
}

export interface AssignmentRef {
  title: string;
  text: string;
  dueAt?: string | null;
}

export async function chatAnswer(
  question: string,
  contextChunks: { title: string; text: string }[],
  webChunks: { title: string; text: string; url?: string }[],
  history: { role: "user" | "assistant"; content: string }[],
  assignment?: AssignmentRef | null
): Promise<string> {
  const gemini = getGemini();
  const courseContext = contextChunks
    .map((c, i) => `[Canvas ${i + 1}] ${c.title}\n${c.text.slice(0, 1500)}`)
    .join("\n\n");
  const webContext = webChunks
    .map((c, i) => `[Web ${i + 1}] ${c.title} (${c.url ?? "no url"})\n${c.text.slice(0, 1500)}`)
    .join("\n\n");

  const baseInstruction =
    "You are a study helper AI with access to the student's Canvas course content. " +
    "Ground your answers in the provided Canvas context when relevant, and cite which item you used. " +
    "If web context is provided, you may use it too, and note when info comes from the web instead of the course. " +
    "If neither source answers the question, say so plainly and answer from general knowledge, noting that clearly.";

  // Assignment-help guardrails: this mode is reached from a specific graded
  // assignment, so the student doing the actual work themselves is the point —
  // the assistant should teach and unblock, never hand over a submittable answer.
  const assignmentInstruction = assignment
    ? "\n\nThe student is asking for help with a specific graded assignment, included below. " +
      "You are in ASSIGNMENT HELP mode — the student must do the actual work themselves:\n" +
      "- Do NOT write text, code, essays, or answers that could be copied directly into their submission.\n" +
      "- DO explain the underlying concepts, break the problem into steps, ask guiding questions, point to " +
      "relevant course material, and work through a similar-but-different example.\n" +
      "- If they ask you to just do it / write the final answer / write their essay, decline briefly and " +
      "redirect to helping them understand it, without being preachy about it.\n" +
      `\nAssignment: ${assignment.title}${assignment.dueAt ? ` (due ${assignment.dueAt})` : ""}\n${assignment.text.slice(0, 3000)}`
    : "";

  const response = await gemini.models.generateContent({
    model: MODEL,
    contents: [
      ...history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      {
        role: "user",
        parts: [
          {
            text: `Canvas course context:\n${courseContext || "(none found)"}\n\nWeb context:\n${webContext || "(none)"}\n\nQuestion: ${question}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: baseInstruction + assignmentInstruction,
    },
  });

  if (!response.text) throw new Error("No text response from Gemini");
  return response.text;
}
