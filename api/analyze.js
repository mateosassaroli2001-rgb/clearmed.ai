import { Anthropic } from "@anthropic-ai/sdk";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const { text } = req.body;

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Explicá este estudio médico en lenguaje simple: ${text}`
        }
      ]
    });

    res.status(200).json({
      result: response.content[0].text
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Error analizando estudio"
    });

  }

}