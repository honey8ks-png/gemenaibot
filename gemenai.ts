import { Bot } from "https://deno.land/x/grammy@v1.21.1/mod.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.3.0";
import "https://deno.land/std@0.220.1/dotenv/load.ts";

// 1. Setup Environment Variables
const telegramToken = Deno.env.get("TELEGRAM_TOKEN");
const geminiKey = Deno.env.get("GEMINI_API_KEY");

if (!telegramToken || !geminiKey) {
  throw new Error("Missing environment variables!");
}

// 2. Initialize Gemini
const genAI = new GoogleGenerativeAI(geminiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 3. Initialize Telegram Bot
const bot = new Bot(telegramToken);

// Handle /start command
bot.command("start", (ctx) => ctx.reply("I'm powered by Gemini! Ask me anything."));

// Handle text messages
bot.on("message:text", async (ctx) => {
  const prompt = ctx.message.text;

  // Let the user know the bot is "typing"
  await ctx.replyWithChatAction("typing");

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    await ctx.reply(text);
  } catch (error) {
    console.error("Gemini Error:", error);
    await ctx.reply("Sorry, I encountered an error processing your request.");
  }
});

// 4. Start the Bot
console.log("Bot is running...");
bot.start();
