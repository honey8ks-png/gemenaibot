import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";

// 1. Setup Environment Variables
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// 2. Initialize Bot and Gemini
// We use 'gemini-2.0-flash' as it's the stable standard for 2026 bots
const bot = new Bot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// 3. Bot Logic
bot.command("start", (ctx) => 
  ctx.reply("✨ **Gemini AI Bot is Online!**\nSend me a message to start chatting.", { parse_mode: "Markdown" })
);

bot.on("message:text", async (ctx) => {
  try {
    // Show "typing" status in Telegram
    await ctx.replyWithChatAction("typing");

    // Generate content from Gemini
    const result = await model.generateContent(ctx.message.text);
    const response = await result.response;
    const text = response.text();

    // Send the response back to the user
    // We use a try-catch on the reply in case Gemini sends weird characters that break Markdown
    try {
      await ctx.reply(text, { parse_mode: "Markdown" });
    } catch {
      await ctx.reply(text); // Fallback to plain text if Markdown fails
    }

  } catch (error) {
    console.error("Gemini Error:", error);
    
    // Detailed error feedback for you to see in Telegram
    if (error.message.includes("404")) {
      await ctx.reply("❌ **Model Error:** Gemini 2.0 Flash was not found. Please check your API key permissions.");
    } else {
      await ctx.reply("⚠️ Sorry, I'm having trouble thinking right now.");
    }
  }
});

// 4. Deno Deploy Webhook Handler
const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    // Secure the webhook by checking that the URL path matches the bot token
    if (url.pathname.slice(1) === TELEGRAM_TOKEN) {
      try {
        return await handleUpdate(req);
      } catch (err) {
        console.error("Update Error:", err);
      }
    }
  }
  return new Response("Bot is running properly!");
});
