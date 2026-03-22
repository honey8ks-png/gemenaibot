import { Bot, Context, session, SessionFlavor, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";
import { DenoKVAdapter } from "https://deno.land/x/grammy_storages@v2.4.2/denokv/src/mod.ts";

// 1. Setup Session Type
interface SessionData {
  history: { role: "user" | "model"; parts: { text: string }[] }[];
}
type MyContext = Context & SessionFlavor<SessionData>;

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// 2. Database Connection (Fallback to memory if KV isn't provisioned)
let kv;
try {
  kv = await Deno.openKv();
} catch {
  console.warn("KV not provisioned in dashboard. Falling back to temporary RAM storage.");
  kv = await Deno.openKv(":memory:");
}

const bot = new Bot<MyContext>(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 3. Setup Persistent Memory
bot.use(session({
  initial: () => ({ history: [] }),
  storage: new DenoKVAdapter(kv),
}));

// 4. Helper: Protect Telegram from "Bad" AI characters
function safeHTML(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 5. Model List for 2026 (Priority Order)
const MODELS = [
  "gemini-2.5-flash",       // High Quota (250+ RPD)
  "gemini-2.5-flash-lite",  // Massive Quota (1000+ RPD)
  "gemini-pro",             // Reliable fallback
  "gemini-3-flash-preview"  // Tiny limit (20 RPD) - try last
];

bot.on("message:text", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  const userPrompt = ctx.message.text;

  // AUTO-SWITCHER LOOP
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const chat = model.startChat({ history: ctx.session.history });
      
      const result = await chat.sendMessage(userPrompt);
      const aiText = result.response.text();

      // Update History
      ctx.session.history.push({ role: "user", parts: [{ text: userPrompt }] });
      ctx.session.history.push({ role: "model", parts: [{ text: aiText }] });

      // Clean history to prevent "Token Overflow" (last 10 messages)
      if (ctx.session.history.length > 10) ctx.session.history.shift();

      // Reply using HTML to prevent Markdown parse errors
      return await ctx.reply(safeHTML(aiText), { parse_mode: "HTML" });

    } catch (err: any) {
      const status = err.status || 0;
      // If Quota Reached (429) or Model Retired (404), try the next one
      if (status === 429 || status === 404) {
        console.warn(`Model ${modelName} failed. Trying next model...`);
        continue;
      }
      // For any other weird errors, show a message
      console.error("Critical Error:", err);
      return ctx.reply("⚠️ My brain is a bit scrambled. Try /start to reset.");
    }
  }

  await ctx.reply("🚀 **System Limit:** All free Gemini models are busy right now. Try again in 15 minutes.");
});

bot.command("start", (ctx) => {
  ctx.session.history = [];
  return ctx.reply("✨ **Auto-Bot Active.**\nI will remember our chat and switch models automatically if one gets full.");
});

// 6. Deno Deploy Serve Logic
const handleUpdate = webhookCallback(bot, "std/http");
Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) return await handleUpdate(req);
  }
  return new Response("Bot Status: 🟢 Online");
});
