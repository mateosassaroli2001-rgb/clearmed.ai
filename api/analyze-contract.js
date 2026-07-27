import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SYSTEM_PROMPT = `Sos un asistente legal educativo de Contratos Claros.
Tu tarea es analizar contratos (alquiler, laborales, freelance/servicios, seguros, préstamos, términos de adhesión, etc.) y explicarlos en lenguaje simple y accesible en español argentino.

IMPORTANTE: No sos abogado y esto no es asesoramiento legal vinculante. Siempre recomendás consultar a un abogado antes de firmar cualquier cosa. Tu función es educativa e informativa.

Analizá el contrato y respondé ÚNICAMENTE con un JSON válido con esta estructura exacta (sin markdown, sin texto extra):

{
  "tipo_contrato": "tipo de contrato detectado (ej: Contrato de alquiler, Contrato laboral, Acuerdo de freelance, etc.)",
  "resumen": "Resumen en 3-5 oraciones de qué trata el contrato, quiénes son las partes y sus puntos principales, en lenguaje simple y cotidiano.",
  "puntos_clave": [
    { "titulo": "Duración", "detalle": "explicación breve" },
    { "titulo": "Monto / Precio", "detalle": "explicación breve" },
    { "titulo": "Forma de pago", "detalle": "explicación breve" }
  ],
  "clausulas_riesgo": [
    {
      "clausula": "nombre corto de la cláusula",
      "nivel": "bajo | medio | alto",
      "explicacion": "por qué conviene prestarle atención, en lenguaje simple, sin tecnicismos legales"
    }
  ],
  "preguntas": [
    "Pregunta concreta y útil para hacer antes de firmar"
  ]
}

Reglas:
- "nivel" de riesgo: "alto" para cláusulas muy desfavorables o inusuales (penalidades desproporcionadas, renuncias de derechos, cláusulas abusivas, rescisión unilateral sin aviso); "medio" para cláusulas que conviene revisar con cuidado; "bajo" para cláusulas estándar que solo vale la pena notar.
- Incluí entre 3 y 6 elementos en "puntos_clave" y entre 2 y 6 en "clausulas_riesgo", según lo que tenga el contrato.
- Incluí entre 3 y 5 preguntas concretas y accionables.
- Si el documento no parece ser un contrato o acuerdo legal, respondé con: {"error": "El archivo no contiene un contrato reconocible."}`;

function buildMessageContent({ fileData, mimeType, text }) {
  if (fileData && mimeType) {
    const block =
      mimeType === "application/pdf"
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: fileData },
          }
        : {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: fileData },
          };

    return [
      block,
      {
        type: "text",
        text: "Este es un contrato en formato documento/imagen. Analizalo y respondé con el JSON solicitado.",
      },
    ];
  }

  if (text && text.trim()) {
    return [
      {
        type: "text",
        text: `Texto del contrato:\n\n${text.trim()}\n\nAnalizá este contrato y respondé con el JSON solicitado.`,
      },
    ];
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fileData, mimeType, text } = req.body || {};

    if (fileData && mimeType && !SUPPORTED_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({
        error: `Formato no soportado: ${mimeType}. Subí un PDF, JPG, PNG o WEBP.`,
      });
    }

    const messageContent = buildMessageContent({ fileData, mimeType, text });
    if (!messageContent) {
      return res.status(400).json({ error: "No se recibió ningún archivo ni texto para analizar." });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log("[analyze-contract] Calling Claude API...");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: messageContent }],
    });

    const raw = response.content.map((b) => b.text || "").join("").trim();
    const clean = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      console.error("[analyze-contract] Claude devolvió JSON inválido:", clean);
      return res.status(500).json({ error: "La IA devolvió una respuesta con formato incorrecto. Intentá de nuevo." });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("[analyze-contract] ERROR:", err);

    if (err?.status) {
      return res.status(err.status).json({ error: `Error de la IA: ${err.message}` });
    }

    return res.status(500).json({
      error: `Error interno del servidor: ${err.message || "Error desconocido"}`,
    });
  }
}
