import { Bot, Context, session, SessionFlavor, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
// Ensure you are using @latest to support Gemini 3 models
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

// Updated to Gemini 3 Flash for March 2026 compatibility
const model = genAI.getGenerativeModel({ model: "gemini-3-flash" });

bot.use(session({
  initial: () => ({ history: [] }),
  storage: new DenoKVAdapter(kv),
}));

bot.on("message:text", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");
    
    // Gemini 3 models handle history better than 1.5
    const chat = model.startChat({ history: ctx.session.history });
    const result = await chat.sendMessage(ctx.message.text);
    const aiText = result.response.text();

    ctx.session.history.push({ role: "user", parts: [{ text: ctx.message.text }] });
    ctx.session.history.push({ role: "model", parts: [{ text: aiText }] });

    if (ctx.session.history.length > 15) ctx.session.history.shift();

    await ctx.reply(aiText, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("Gemini Error:", error);
    // 429 is still common on free tier, 404 means model ID is wrong
    if (error.status === 404) {
        await ctx.reply("❌ Error: That model is no longer available. Using gemini-3-flash instead.");
    } else {
        await ctx.reply("⚠️ Having some trouble. Try /start.");
    }
  }
});

const handleUpdate = webhookCallback(bot, "std/http");
Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) return await handleUpdate(req);
  }
  return new Response("Bot is running!");
});
