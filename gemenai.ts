const TELEGRAM_TOKEN = "8628665706:AAGaQpJE--Qh17zl5oWX69p29qAuCTE0uOs";
const GEMINI_API_KEY = "AIzaSyAhH_7EFGEuXkC_yTAUrQpMI2076k9cTjQ";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Bot running");
  }

  const update = await req.json();
  const msg = update.message;

  if (!msg || !msg.text) {
    return new Response("No message");
  }

  const chatId = msg.chat.id;
  const userText = msg.text;

  try {
    // Gemini API call (free model)
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userText }]
            }
          ]
        })
      }
    );

    const data = await aiRes.json();

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response";

    // Send message back to Telegram
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply
        })
      }
    );

    return new Response("OK");
  } catch (e) {
    return new Response("Error");
  }
});
