import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const bot = new Bot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Use 1.5-flash as it is the most reliable for Free Tier in 2026
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

bot.command("start", (ctx) => 
  ctx.reply("✨ **Gemini AI Bot is Online!**\nSend me a message to start chatting.", { parse_mode: "Markdown" })
);

bot.on("message:text", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");

    const result = await model.generateContent(ctx.message.text);
    const response = await result.response;
    const text = response.text();

    try {
      await ctx.reply(text, { parse_mode: "Markdown" });
    } catch {
      // Fallback if Gemini uses Markdown characters that Telegram doesn't like
      await ctx.reply(text); 
    }

  } catch (error: any) {
    console.error("Gemini Error:", error);

    // Specific fix for your 429 / Limit 0 error
    if (error.message?.includes("429") || error.message?.includes("limit: 0")) {
      await ctx.reply("🚫 **Quota Restricted:** Your API key has a limit of 0. \n\n**To fix this:**\n1. Go to [Google AI Studio](https://aistudio.google.com/)\n2. Ensure your project has 'Pay-as-you-go' enabled (it still has a free tier, but unlocks the limits).\n3. Check if your region supports Free Tier.");
    } else {
      await ctx.reply("⚠️ I'm having trouble processing that right now.");
    }
  }
});

const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error("Update Error:", err);
      }
    }
  }
  return new Response("Bot is running!");
});
