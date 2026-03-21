import { Bot, webhookCallback } from "https://deno.land/x/grammy/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const token = Deno.env.get("8628665706:AAGaQpJE--Qh17zl5oWX69p29qAuCTE0uOs");
const genAI = new GoogleGenerativeAI(Deno.env.get("AIzaSyAhH_7EFGEuXkC_yTAUrQpMI2076k9cTjQ") || "");

if (!token) throw new Error("TELEGRAM_TOKEN is missing!");

const bot = new Bot(token);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

bot.on("message:text", async (ctx) => {
  const result = await model.generateContent(ctx.message.text);
  await ctx.reply(result.response.text());
});

// CRITICAL: Use Deno.serve to handle requests from Telegram
const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  if (req.method === "POST") {
    const url = new URL(req.url);
    // Security check: ensure the request is actually from Telegram
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
