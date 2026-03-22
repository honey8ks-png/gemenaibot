import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.3.0";

// 1. Setup API Keys (Set these in Deno Deploy Environment Variables)
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const bot = new Bot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 2. Bot Logic
bot.command("start", (ctx) => ctx.reply("Hi! I'm Gemini AI. Send me a message!"));

bot.on("message:text", async (ctx) => {
  try {
    // Show "typing" status while Gemini thinks
    await ctx.replyWithChatAction("typing");

    const result = await model.generateContent(ctx.message.text);
    const response = await result.response;
    const text = response.text();

    await ctx.reply(text);
  } catch (error) {
    console.error("Gemini Error:", error);
    await ctx.reply("Sorry, I encountered an error processing your request.");
  }
});

// 3. Serve via Webhook (Optimized for Deno Deploy)
const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === bot.token) {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error(err);
      }
    }
  }
  return new Response("Bot is running!");
});
