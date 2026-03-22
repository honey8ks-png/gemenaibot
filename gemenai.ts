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

// Use 'gemini-1.5-flash' or 'gemini-2.0-flash'. 
// If both 404, try 'gemini-pro' as a final fallback.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

bot.use(session({
  initial: () => ({ history: [] }),
  storage: new DenoKVAdapter(kv),
}));

bot.on("message:text", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");
    const chat = model.startChat({ history: ctx.session.history });
    const result = await chat.sendMessage(ctx.message.text);
    const aiText = result.response.text();

    ctx.session.history.push({ role: "user", parts: [{ text: ctx.message.text }] });
    ctx.session.history.push({ role: "model", parts: [{ text: aiText }] });

    if (ctx.session.history.length > 10) ctx.session.history.splice(0, 2);

    await ctx.reply(aiText, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.status === 404) {
      await ctx.reply("❌ **Setup Error:** The AI model ID in the code is incorrect. Check Deno logs for the correct name.");
    } else {
      await ctx.reply("⚠️ Thinking is hard right now. Try /start.");
    }
  }
});

Deno.serve(webhookCallback(bot, "std/http"));
