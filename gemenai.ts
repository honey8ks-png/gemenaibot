import { Bot, Context, session, SessionFlavor, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";
import { DenoKVAdapter } from "https://deno.land/x/grammy_storages@v2.4.2/denokv/src/mod.ts";

// 1. Define what we want to remember
interface SessionData {
  history: { role: "user" | "model"; parts: [{ text: string }] }[];
}
type MyContext = Context & SessionFlavor<SessionData>;

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// 2. Open Deno's built-in Database
const kv = await Deno.openKv();
const bot = new Bot<MyContext>(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 3. Setup persistent memory using Deno KV
bot.use(session({
  initial: () => ({ history: [] }),
  storage: new DenoKVAdapter(kv),
}));

bot.command("start", (ctx) => {
  ctx.session.history = []; // Reset memory
  return ctx.reply("🧠 **Memory Active!** I will now remember what we talk about. Use /reset to clear my mind.");
});

bot.command("reset", (ctx) => {
  ctx.session.history = [];
  return ctx.reply("Memory cleared! Who are you again? Just kidding.");
});

bot.on("message:text", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");

    // Load history into a "Chat" object
    const chat = model.startChat({
      history: ctx.session.history,
    });

    const result = await chat.sendMessage(ctx.message.text);
    const responseText = result.response.text();

    // Save this exchange to our database
    ctx.session.history.push({ role: "user", parts: [{ text: ctx.message.text }] });
    ctx.session.history.push({ role: "model", parts: [{ text: responseText }] });

    // Keep memory lean (last 10 messages) to save space
    if (ctx.session.history.length > 20) {
      ctx.session.history = ctx.session.history.slice(-20);
    }

    await ctx.reply(responseText, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("Gemini Error:", error);
    await ctx.reply("⚠️ I'm having trouble remembering things right now. Try /reset.");
  }
});

// Webhook handling
const handleUpdate = webhookCallback(bot, "std/http");
Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) {
      return await handleUpdate(req);
    }
  }
  return new Response("Bot is running with Deno KV memory.");
});
