// ============================================================
// ClearMed AI — /api/analyze.js
// Versión corregida para Vercel Serverless
// Soporta: PDF, JPG, PNG via multipart/form-data
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { IncomingForm } from "formidable";
import fs from "fs";
import path from "path";

// ⚠️ CRÍTICO: Deshabilitar el body parser de Next.js/Vercel
// Sin esto, el stream del request se consume antes de que formidable pueda leerlo
export const config = {
  api: {
    bodyParser: false,
  },
};

// Tipos MIME permitidos
const ALLOWED_TYPES = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
};

// Tamaño máximo: 4MB (límite de Vercel es 4.5MB, dejamos margen)
const MAX_FILE_SIZE = 4 * 1024 * 1024;

// ── Helpers ──────────────────────────────────────────────────

/**
 * Parsea el multipart/form-data usando formidable
 * Devuelve { fields, files }
 */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
      // En Vercel el /tmp es el único directorio escribible
      uploadDir: "/tmp",
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error("[ClearMed] ❌ Error al parsear el form:", err.message);
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
}

/**
 * Construye el bloque de contenido correcto para la API de Anthropic
 * según el tipo de archivo.
 */
function buildContentBlock(fileBuffer, mimeType) {
  const base64Data = fileBuffer.toString("base64");

  if (mimeType === "application/pdf") {
    // PDFs → type: "document" con source base64
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64Data,
      },
    };
  }

  // Imágenes → type: "image"
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mimeType,
      data: base64Data,
    },
  };
}

// ── Handler principal ─────────────────────────────────────────

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usá POST." });
  }

  console.log("[ClearMed] 📥 Nueva solicitud recibida");
  console.log("[ClearMed] Content-Type:", req.headers["content-type"]);

  // ── 1. Validar API Key ──────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[ClearMed] ❌ ANTHROPIC_API_KEY no está definida en las variables de entorno de Vercel.");
    return res.status(500).json({
      error: "Error de configuración del servidor. Contactá al administrador.",
      debug: "Missing ANTHROPIC_API_KEY",
    });
  }
  console.log("[ClearMed] ✅ API Key presente (primeros 8 chars):", apiKey.substring(0, 8) + "...");

  // ── 2. Parsear el archivo ───────────────────────────────────
  let filePath, mimeType, fileName;

  try {
    const { files } = await parseForm(req);

    console.log("[ClearMed] 📂 Archivos recibidos:", JSON.stringify(Object.keys(files)));

    // El campo puede llamarse "file", "archivo", "pdf", etc.
    // Buscamos el primero que exista
    const fileEntry = files.file || files.archivo || files.pdf || files.image || Object.values(files)[0];

    if (!fileEntry) {
      console.error("[ClearMed] ❌ No se encontró ningún archivo en el form.");
      return res.status(400).json({
        error: "No se recibió ningún archivo. Asegurate de enviar el campo 'file'.",
      });
    }

    // formidable v2+ devuelve arrays; tomamos el primer elemento
    const file = Array.isArray(fileEntry) ? fileEntry[0] : fileEntry;

    filePath = file.filepath || file.path;
    mimeType = file.mimetype || file.type;
    fileName = file.originalFilename || file.name || "archivo";

    console.log("[ClearMed] 📄 Archivo:", fileName);
    console.log("[ClearMed] 📄 MIME type:", mimeType);
    console.log("[ClearMed] 📄 Tamaño:", file.size, "bytes");

    if (!ALLOWED_TYPES[mimeType]) {
      console.error("[ClearMed] ❌ Tipo de archivo no soportado:", mimeType);
      return res.status(400).json({
        error: `Tipo de archivo no soportado: ${mimeType}. Usá PDF, JPG o PNG.`,
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      console.error("[ClearMed] ❌ Archivo demasiado grande:", file.size);
      return res.status(400).json({
        error: "El archivo supera el límite de 4MB.",
      });
    }
  } catch (err) {
    console.error("[ClearMed] ❌ Error al parsear el archivo:", err.message);
    return res.status(400).json({
      error: "No se pudo leer el archivo enviado. Verificá el formato.",
      debug: err.message,
    });
  }

  // ── 3. Leer el buffer del archivo ──────────────────────────
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
    console.log("[ClearMed] ✅ Buffer leído correctamente:", fileBuffer.length, "bytes");
  } catch (err) {
    console.error("[ClearMed] ❌ No se pudo leer el archivo temporal:", err.message);
    return res.status(500).json({
      error: "Error interno al procesar el archivo.",
      debug: err.message,
    });
  }

  // ── 4. Construir el mensaje para Claude ────────────────────
  const contentBlock = buildContentBlock(fileBuffer, mimeType);

  const systemPrompt = `Sos un asistente médico educativo especializado en explicar estudios y análisis clínicos en lenguaje simple y accesible para pacientes sin formación médica. Tu objetivo es ayudar a las personas a entender sus resultados de salud.

IMPORTANTE:
- Explicá cada valor o hallazgo en lenguaje cotidiano, sin jerga médica innecesaria.
- Indicá si cada valor está dentro del rango normal o si se desvía, y qué significa eso en términos simples.
- Nunca hagas diagnósticos ni recomendés tratamientos específicos.
- Siempre recordá al usuario que consulte con su médico de cabecera.
- Formulá entre 3 y 5 preguntas concretas que el paciente podría llevar a su próxima consulta médica.
- Respondé siempre en español, de manera empática y clara.`;

  const userMessage = {
    role: "user",
    content: [
      contentBlock,
      {
        type: "text",
        text: `Por favor, analizá este estudio médico y explicalo en lenguaje simple y comprensible para un paciente sin formación médica. 

Incluí:
1. Un resumen general del estudio en 2-3 oraciones.
2. Explicación de cada valor o hallazgo relevante, indicando si está dentro del rango normal.
3. Qué podría significar para la salud del paciente, en términos simples.
4. Entre 3 y 5 preguntas útiles para llevar a la próxima consulta médica.

Recordá al final que esta explicación es orientativa y no reemplaza la consulta médica profesional.`,
      },
    ],
  };

  // ── 5. Llamar a Claude ─────────────────────────────────────
  console.log("[ClearMed] 🧠 Enviando a Claude...");

  let claudeResponse;
  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514", // ← Modelo activo y soportado
      max_tokens: 2048,
      system: systemPrompt,
      messages: [userMessage],
    });

    console.log("[ClearMed] ✅ Respuesta de Claude recibida");
    console.log("[ClearMed] Stop reason:", response.stop_reason);
    console.log("[ClearMed] Tokens usados:", response.usage);

    // Extraer el texto de la respuesta
    claudeResponse = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!claudeResponse || claudeResponse.trim() === "") {
      throw new Error("Claude devolvió una respuesta vacía.");
    }
  } catch (err) {
    console.error("[ClearMed] ❌ Error al llamar a Claude:");
    console.error("  Mensaje:", err.message);
    console.error("  Status:", err.status);
    console.error("  Error type:", err.error?.type);

    // Errores específicos de Anthropic
    if (err.status === 401) {
      return res.status(500).json({
        error: "Error de autenticación con la IA. Verificá la API Key en Vercel.",
        debug: "Invalid API Key",
      });
    }
    if (err.status === 429) {
      return res.status(429).json({
        error: "Demasiadas solicitudes. Por favor esperá unos segundos e intentá de nuevo.",
        debug: "Rate limit exceeded",
      });
    }
    if (err.status === 413 || err.message?.includes("too large")) {
      return res.status(400).json({
        error: "El archivo es demasiado grande para ser procesado. Intentá con un archivo más pequeño.",
        debug: "File too large for Claude",
      });
    }

    return res.status(500).json({
      error: "Error al procesar el análisis. Por favor intentá de nuevo.",
      debug: err.message,
    });
  } finally {
    // Limpiar el archivo temporal
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log("[ClearMed] 🗑️ Archivo temporal eliminado");
      }
    } catch (cleanupErr) {
      console.warn("[ClearMed] ⚠️ No se pudo eliminar el archivo temporal:", cleanupErr.message);
    }
  }

  // ── 6. Devolver respuesta al frontend ──────────────────────
  console.log("[ClearMed] ✅ Enviando respuesta al frontend");

  return res.status(200).json({
    success: true,
    analysis: claudeResponse,
    fileName: fileName,
  });
}  

