import { Bot, webhookCallback } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@latest";

// 1. Setup Environment Variables
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

// 2. Initialize Bot and Gemini
// We use 'gemini-2.0-flash' as it's the stable standard for 2026 bots
const bot = new Bot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Change from 2.0 to 1.5

// Use 1.5-flash as it is the most reliable for Free Tier in 2026
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
      // Fallback if Gemini uses Markdown characters that Telegram doesn't like
      await ctx.reply(text); 
    }

  } catch (error) {
  } catch (error: any) {
    console.error("Gemini Error:", error);
    
    // Detailed error feedback for you to see in Telegram
    if (error.message.includes("404")) {
      await ctx.reply("❌ **Model Error:** Gemini 2.0 Flash was not found. Please check your API key permissions.");

    // Specific fix for your 429 / Limit 0 error
    if (error.message?.includes("429") || error.message?.includes("limit: 0")) {
      await ctx.reply("🚫 **Quota Restricted:** Your API key has a limit of 0. \n\n**To fix this:**\n1. Go to [Google AI Studio](https://aistudio.google.com/)\n2. Ensure your project has 'Pay-as-you-go' enabled (it still has a free tier, but unlocks the limits).\n3. Check if your region supports Free Tier.");
    } else {
      await ctx.reply("⚠️ Sorry, I'm having trouble thinking right now.");
      await ctx.reply("⚠️ I'm having trouble processing that right now.");
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
@@ -62,5 +54,5 @@ Deno.serve(async (req) => {
      }
    }
  }
  return new Response("Bot is running properly!");
  return new Response("Bot is running!");
});
