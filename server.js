// ─────────────────────────────────────────────────────────────
//  ClearMed AI — Backend Server
//  Node.js + Express · llama a la API de Claude del lado servidor
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// ── Validar que exista la API key ────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n❌  Falta la variable ANTHROPIC_API_KEY en el archivo .env');
  console.error('    Copiá .env.example como .env y completá tu API key.\n');
  process.exit(1);
}

const app     = express();
const PORT    = process.env.PORT || 3000;
const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Servir el frontend (public/index.html) como archivo estático
app.use(express.static(path.join(__dirname, 'public')));

// multer: recibe archivos en memoria (sin guardarlos en disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // máx 15 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no soportado. Usá PDF, JPG o PNG.'));
    }
  }
});

// ── System prompt para Claude ────────────────────────────────
const SYSTEM_PROMPT = `Sos un asistente médico educativo de ClearMed AI.
Tu tarea es analizar resultados de estudios médicos y explicarlos en lenguaje simple y accesible en español argentino.

IMPORTANTE: Nunca hacés diagnósticos. Siempre recomendás consultar con un profesional médico. Tu función es educativa e informativa.

Analizá el estudio y respondé ÚNICAMENTE con un JSON válido con esta estructura exacta (sin markdown, sin texto extra):

{
  "nombre_estudio": "nombre del tipo de estudio detectado",
  "valores": [
    {
      "nombre": "nombre del parámetro",
      "valor": "valor numérico o textual",
      "unidad": "unidad de medida o vacío",
      "rango": "rango de referencia si está disponible",
      "estado": "ok | warn | alert",
      "etiqueta": "✓ Normal | ⚠ Leve elevación | 🔴 Fuera de rango"
    }
  ],
  "explicacion": "Explicación clara en 3-5 oraciones en lenguaje cotidiano sin tecnicismos. Mencioná qué valores están bien y cuáles merecen atención.",
  "preguntas": [
    "Pregunta 1 útil para llevar al médico",
    "Pregunta 2 útil para llevar al médico",
    "Pregunta 3 útil para llevar al médico"
  ]
}

Reglas:
- "estado": "ok" si está en rango normal, "warn" si está levemente fuera, "alert" si está muy fuera de rango.
- Si el documento no parece ser un estudio médico, respondé con: {"error": "El archivo no contiene un estudio médico reconocible."}
- Incluí entre 2 y 8 valores según el estudio.
- Las preguntas deben ser concretas y útiles para la consulta médica.`;

// ── POST /analyze ────────────────────────────────────────────
//    Acepta:
//      - multipart/form-data con campo "file" (PDF o imagen)
//      - application/json con campo "text" (texto ya extraído)
// ─────────────────────────────────────────────────────────────
app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    let messageContent;

    // ── Caso A: se recibe un archivo ────────────────────────
    if (req.file) {
      const { mimetype, buffer } = req.file;
      const base64Data = buffer.toString('base64');

      if (mimetype === 'application/pdf') {
        // PDF → lo enviamos como documento base64 a Claude
        messageContent = [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Este es un resultado de estudio médico en PDF. Analizalo y respondé con el JSON solicitado.'
          }
        ];
      } else {
        // Imagen (jpg/png/webp) → visión de Claude
        messageContent = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimetype,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Esta es una imagen de un resultado de estudio médico. Analizala y respondé con el JSON solicitado.'
          }
        ];
      }
    }

    // ── Caso B: se recibe texto ya extraído (desde PDF.js) ──
    else if (req.body && req.body.text) {
      const text = req.body.text.trim();
      if (!text) {
        return res.status(400).json({ error: 'El texto del estudio está vacío.' });
      }
      messageContent = [
        {
          type: 'text',
          text: `Texto extraído del estudio médico:\n\n${text}\n\nAnalizá este resultado y respondé con el JSON solicitado.`
        }
      ];
    }

    else {
      return res.status(400).json({ error: 'No se recibió ningún archivo ni texto para analizar.' });
    }

    // ── Llamada a Claude ─────────────────────────────────────
    console.log(`🔍 Analizando estudio (${req.file ? req.file.originalname : 'texto'})...`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }]
    });

    const raw = response.content.map(b => b.text || '').join('').trim();

    // Limpiar posibles bloques markdown que Claude agregue
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      console.error('❌ Claude devolvió JSON inválido:', clean);
      return res.status(500).json({ error: 'La IA devolvió una respuesta con formato incorrecto. Intentá de nuevo.' });
    }

    console.log(`✅ Análisis completado: ${result.nombre_estudio || 'Estudio detectado'}`);
    return res.json(result);

  } catch (err) {
    // Error de Anthropic SDK
    if (err?.status) {
      console.error(`❌ Error de API Anthropic [${err.status}]:`, err.message);
      return res.status(err.status).json({ error: `Error de la IA: ${err.message}` });
    }
    // Error de multer (archivo inválido, muy grande, etc.)
    if (err.message?.includes('Formato') || err.message?.includes('large')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('❌ Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor. Revisá la consola.' });
  }
});

// ── System prompt para Contratos Claros ────────────────────────
const CONTRACT_SYSTEM_PROMPT = `Sos un asistente legal educativo de Contratos Claros.
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

// ── POST /analyze-contract ──────────────────────────────────
//    Acepta application/json con:
//      - { fileData: base64, mimeType } → PDF o imagen
//      - { text } → texto ya extraído / pegado
// ─────────────────────────────────────────────────────────────
app.post('/analyze-contract', async (req, res) => {
  try {
    const { fileData, mimeType, text } = req.body || {};
    let messageContent;

    if (fileData && mimeType) {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(mimeType)) {
        return res.status(400).json({ error: `Formato no soportado: ${mimeType}. Subí un PDF, JPG, PNG o WEBP.` });
      }

      const block = mimeType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } }
        : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileData } };

      messageContent = [
        block,
        { type: 'text', text: 'Este es un contrato en formato documento/imagen. Analizalo y respondé con el JSON solicitado.' }
      ];
    } else if (text && text.trim()) {
      messageContent = [
        { type: 'text', text: `Texto del contrato:\n\n${text.trim()}\n\nAnalizá este contrato y respondé con el JSON solicitado.` }
      ];
    } else {
      return res.status(400).json({ error: 'No se recibió ningún archivo ni texto para analizar.' });
    }

    console.log('🔍 Analizando contrato...');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: CONTRACT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }]
    });

    const raw = response.content.map(b => b.text || '').join('').trim();
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      console.error('❌ Claude devolvió JSON inválido:', clean);
      return res.status(500).json({ error: 'La IA devolvió una respuesta con formato incorrecto. Intentá de nuevo.' });
    }

    console.log(`✅ Análisis de contrato completado: ${result.tipo_contrato || 'Contrato detectado'}`);
    return res.json(result);

  } catch (err) {
    if (err?.status) {
      console.error(`❌ Error de API Anthropic [${err.status}]:`, err.message);
      return res.status(err.status).json({ error: `Error de la IA: ${err.message}` });
    }
    console.error('❌ Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor. Revisá la consola.' });
  }
});

// ── Ruta catch-all: devuelve el index.html para SPA ──────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Arrancar el servidor ─────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log(`║  ✦ ClearMed AI corriendo en             ║`);
  console.log(`║    http://localhost:${PORT}               ║`);
  console.log('╚════════════════════════════════════════╝\n');
});
