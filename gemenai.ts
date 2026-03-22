import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
// Use the newest unified SDK for 2026
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const bot = new Bot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * 2026 MODEL SELECTION:
 * If 'gemini-1.5-flash' is 404, use the current stable 'flash' model.
 * Common IDs now: 'gemini-2.5-flash' or 'gemini-3-flash'
 */
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash" 
});

bot.on("message:text", async (ctx) => {
  try {
    await ctx.replyWithChatAction("typing");

    const result = await model.generateContent(ctx.message.text);
    const text = result.response.text();

    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (error: any) {
    console.error("Gemini Error:", error);

    // If you get another 404, the code below will help you find the right name
    if (error.message?.includes("404")) {
      await ctx.reply("❌ **Model ID Error:** The model version has changed. Please check Google AI Studio for the latest ID (e.g., gemini-3-flash).");
    } else {
      await ctx.reply("⚠️ Sorry, I'm having trouble thinking right now.");
    }
  }
});

// Deno.serve logic remains the same...
const handleUpdate = webhookCallback(bot, "std/http");
Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) {
      return await handleUpdate(req);
    }
  }
  return new Response("Bot Active");
});
