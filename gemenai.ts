import { Bot, Context, session, SessionFlavor, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";
import { DenoKVAdapter } from "https://deno.land/x/grammy_storages@v2.4.2/denokv/src/mod.ts";

interface SessionData {
  history: { role: "user" | "model"; parts: { text: string }[] }[];
}
type MyContext = Context & SessionFlavor<SessionData>;

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const kv = await Deno.openKv();
const bot = new Bot<MyContext>(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 1. Memory Setup (Deno KV)
bot.use(session({
  initial: () => ({ history: [] }),
  storage: new DenoKVAdapter(kv),
}));

// 2. The "Auto-Switcher" Logic
const MODEL_PRIORITY = [
  "gemini-2.5-flash",       // Best balance (250 msgs/day)
  "gemini-2.5-flash-lite",  // High Quota (1000 msgs/day)
  "gemini-2.0-flash",       // Legacy Fallback
  "gemini-pro"              // Final Fallback
];

bot.on("message:text", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  const userText = ctx.message.text;

  // Try each model until one works
  for (const modelName of MODEL_PRIORITY) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const chat = model.startChat({ history: ctx.session.history });
      
      const result = await chat.sendMessage(userText);
      const aiResponse = result.response.text();

      // If successful, update memory and send reply
      ctx.session.history.push({ role: "user", parts: [{ text: userText }] });
      ctx.session.history.push({ role: "model", parts: [{ text: aiResponse }] });
      
      // Keep memory lean
      if (ctx.session.history.length > 16) ctx.session.history = ctx.session.history.slice(-16);
      
      return await ctx.reply(aiResponse, { parse_mode: "Markdown" });

    } catch (error: any) {
      const isQuotaError = error.message?.includes("429") || error.status === 429;
      const isNotFoundError = error.message?.includes("404") || error.status === 404;

      if (isQuotaError || isNotFoundError) {
        console.warn(`Model ${modelName} failed (${error.status}). Trying next...`);
        continue; // Move to next model in MODEL_PRIORITY
      }

      console.error(`Serious Error with ${modelName}:`, error);
      return ctx.reply("⚠️ Unexpected error. Please try /start to reset.");
    }
  }

  // If the loop finishes without returning, all models failed
  await ctx.reply("🚀 **All Free Tier limits reached.**\nGoogle is limiting all available models right now. Please try again in 1 hour.");
});

bot.command("start", (ctx) => {
  ctx.session.history = [];
  return ctx.reply("✨ **Gemini 2026 Auto-Bot Active**\nI will automatically switch models if limits are reached.");
});

// 3. Standard Deno.serve Logic
const handleUpdate = webhookCallback(bot, "std/http");
Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) return await handleUpdate(req);
  }
  return new Response("Bot is running with Auto-Fallback.");
});
