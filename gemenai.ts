import { Bot, Context, session, SessionFlavor, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";
import { DenoKVAdapter } from "https://deno.land/x/grammy_storages@v2.4.2/denokv/src/mod.ts";

interface SessionData {
  history: { role: "user" | "model"; parts: { text: string }[] }[];
}
type MyContext = Context & SessionFlavor<SessionData>;

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// 1. Initialize KV with fallback
let kv;
try {
  kv = await Deno.openKv();
} catch {
  kv = await Deno.openKv(":memory:");
}

const bot = new Bot<MyContext>(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

bot.use(session({
  initial: () => ({ history: [] }),
  storage: new DenoKVAdapter(kv),
}));

// 2. SMART FORMATTER: Converts AI Markdown to Telegram HTML
function formatAIResponse(text: string) {
  return text
    // Step 1: Escape raw HTML characters to prevent crashes
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Step 2: Convert Gemini Bold (**text**) to HTML <b>
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    // Step 3: Convert Gemini Italic (*text*) to HTML <i>
    .replace(/\*(.*?)\*/g, "<i>$1</i>")
    // Step 4: Convert Gemini Code (`text`) to HTML <code>
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

// 3. MODEL LIST (Order of priority for Free Tier)
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-pro"];

bot.on("message:text", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  const userPrompt = ctx.message.text;

  // AUTO-SWITCHER LOOP
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const chat = model.startChat({ history: ctx.session.history });
      
      const result = await chat.sendMessage(userPrompt);
      const aiRawText = result.response.text();

      // Update Session History (Keep last 10 exchanges)
      ctx.session.history.push({ role: "user", parts: [{ text: userPrompt }] });
      ctx.session.history.push({ role: "model", parts: [{ text: aiRawText }] });
      if (ctx.session.history.length > 10) ctx.session.history = ctx.session.history.slice(-10);

      // Format and Send
      const safeText = formatAIResponse(aiRawText);
      try {
        return await ctx.reply(safeText, { parse_mode: "HTML" });
      } catch (e) {
        // Final fallback if HTML fails: Send plain text
        return await ctx.reply(aiRawText);
      }

    } catch (err: any) {
      if (err.status === 429 || err.status === 404) {
        console.warn(`${modelName} failed, trying next...`);
        continue; // Try next model in the list
      }
      console.error("Critical Error:", err);
      return ctx.reply("⚠️ Error occurred. Try /start.");
    }
  }
  await ctx.reply("❌ All free limits reached. Please try again later.");
});

bot.command("start", (ctx) => {
  ctx.session.history = [];
  return ctx.reply("✅ **Bot Reset.** Send me a message!");
});

// 4. Serve
Deno.serve(webhookCallback(bot, "std/http"));
