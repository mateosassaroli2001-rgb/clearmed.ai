import Anthropic from "@anthropic-ai/sdk";
import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false,
  },
};

const SUPPORTED_TYPES = {
  "image/jpeg": { type: "image", mediaType: "image/jpeg" },
  "image/png": { type: "image", mediaType: "image/png" },
  "image/gif": { type: "image", mediaType: "image/gif" },
  "image/webp": { type: "image", mediaType: "image/webp" },
  "application/pdf": { type: "document", mediaType: "application/pdf" },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let filePath = null;

  try {
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB
      keepExtensions: true,
    });

    const [, files] = await form.parse(req);

    const fileArray = files.file;
    if (!fileArray || fileArray.length === 0) {
      return res.status(400).json({ error: "No se recibió ningún archivo." });
    }

    const file = fileArray[0];
    filePath = file.filepath;
    const mimeType = file.mimetype || "";

    console.log(`[analyze] File received: ${file.originalFilename}, type: ${mimeType}, size: ${file.size}`);

    // Validate file type
    const supportedType = SUPPORTED_TYPES[mimeType];
    if (!supportedType) {
      return res.status(400).json({
        error: `Tipo de archivo no soportado: ${mimeType}. Sube un PDF o imagen (JPEG, PNG, WEBP, GIF).`,
      });
    }

    // Read file to buffer → base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString("base64");

    console.log(`[analyze] File read OK. Base64 length: ${base64Data.length}`);

    // Init Anthropic client
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build message content
    let contentBlocks;

    if (supportedType.type === "image") {
      contentBlocks = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: supportedType.mediaType,
            data: base64Data,
          },
        },
        {
          type: "text",
          text: `Eres un médico especialista con gran capacidad de comunicación. El usuario te ha enviado un estudio médico (imagen o PDF).

Tu tarea:
1. Identificá qué tipo de estudio es (análisis de sangre, radiografía, ecografía, etc.)
2. Explicá los resultados en lenguaje simple y claro, como si le hablaras a alguien sin conocimientos médicos
3. Indicá qué valores o hallazgos son normales y cuáles podrían requerir atención
4. Cerrá con una recomendación general (sin reemplazar la consulta médica)

Sé empático, claro y ordenado. Usá viñetas cuando sea útil. No uses términos técnicos sin explicarlos.`,
        },
      ];
    } else {
      // PDF
      contentBlocks = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64Data,
          },
        },
        {
          type: "text",
          text: `Eres un médico especialista con gran capacidad de comunicación. El usuario te ha enviado un estudio médico en PDF.

Tu tarea:
1. Identificá qué tipo de estudio es (análisis de sangre, radiografía, informe médico, etc.)
2. Explicá los resultados en lenguaje simple y claro, como si le hablaras a alguien sin conocimientos médicos
3. Indicá qué valores o hallazgos son normales y cuáles podrían requerir atención
4. Cerrá con una recomendación general (sin reemplazar la consulta médica)

Sé empático, claro y ordenado. Usá viñetas cuando sea útil. No uses términos técnicos sin explicarlos.`,
        },
      ];
    }

    console.log("[analyze] Calling Claude API...");

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    console.log("[analyze] Claude response received. Stop reason:", message.stop_reason);

    const analysisText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return res.status(200).json({ analysis: analysisText });

  } catch (err) {
    console.error("[analyze] ERROR:", err);

    // Anthropic API errors
    if (err?.status && err?.error) {
      return res.status(502).json({
        error: `Error de la API de Claude: ${err.error?.error?.message || err.message}`,
      });
    }

    // Formidable errors
    if (err.code === 1009) {
      return res.status(413).json({ error: "El archivo es demasiado grande. Máximo 20MB." });
    }

    return res.status(500).json({
      error: `Error interno del servidor: ${err.message || "Error desconocido"}`,
    });
  } finally {
    // Clean up temp file
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
        console.log("[analyze] Temp file deleted.");
      } catch (_) {}
    }
  }
}
