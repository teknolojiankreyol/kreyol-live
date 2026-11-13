// English -> Haitian Creole translation using Claude.
// Set TRANSLATOR=mock to test the app without an API key.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MOCK = process.env.TRANSLATOR === "mock";

function loadGlossary() {
  try {
    const raw = JSON.parse(fs.readFileSync(new URL("./glossary.json", import.meta.url), "utf8"));
    return Object.entries(raw)
      .filter(([k]) => !k.startsWith("_"))
      .map(([en, ht]) => `- ${en} → ${ht}`)
      .join("\n");
  } catch {
    return "";
  }
}

const SYSTEM = `You translate a live church service from English into Haitian Creole (Kreyòl ayisyen) for captions shown on the church screens and on members' phones.

Rules:
- Output ONLY the Haitian Creole translation of the new line. No quotes, notes, or English.
- Use standard Haitian Creole spelling (the official orthography), natural and warm, the way a Haitian pastor would say it — not word-for-word.
- Keep it short enough to read quickly on a screen.
- Keep names, numbers, and Bible references (e.g. "Jan 3:16") accurate. Use the Haitian Creole names of Bible books.
- The English comes from speech recognition and may have mistakes or be cut off mid-sentence. Translate the most likely meaning; use the earlier lines for context.
- If the line is only filler ("um", "okay so"), output a single dash: -

Preferred church vocabulary:
${loadGlossary()}`;

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// context: array of { en, ht } for the most recent lines (oldest first)
export async function translate(text, context = []) {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    return `[KREYÒL] ${text}`;
  }

  const history = context.length
    ? "Earlier lines (for context only, already translated):\n" +
      context.map((c) => `EN: ${c.en}\nHT: ${c.ht}`).join("\n") +
      "\n\n"
    : "";

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Low effort keeps captions fast; translation of one sentence doesn't need deep thinking.
    output_config: { effort: "low" },
    // If a safety classifier declines a line, the API retries it on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `${history}New line to translate:\n${text}` }],
  });

  if (response.stop_reason === "refusal") return null;

  const out = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!out || out === "-") return null;
  return out;
}

export const translatorInfo = { model: MOCK ? "mock (no API calls)" : MODEL };
