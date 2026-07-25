require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const templates = require('./lib/templates');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DEMO_MODE = !process.env.STRIPE_SECRET_KEY;

const stripe = DEMO_MODE ? null : require('stripe')(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers para guardar los datos del formulario sin base de datos ---
// Los metemos partidos en la metadata de la sesión de Stripe (o los pasamos
// codificados en la URL en modo demo) para no necesitar persistencia propia.

const CHUNK_SIZE = 450;

function encodeFields(fields) {
  const json = JSON.stringify(fields);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE));
  }
  const metadata = { chunks: String(chunks.length) };
  chunks.forEach((chunk, i) => {
    metadata[`data_${i}`] = chunk;
  });
  return metadata;
}

function decodeFields(metadata) {
  const count = parseInt(metadata.chunks || '0', 10);
  let json = '';
  for (let i = 0; i < count; i++) {
    json += metadata[`data_${i}`] || '';
  }
  return JSON.parse(json);
}

function validateFields(template, fields) {
  const missing = template.fields
    .filter((f) => f.required && !String(fields[f.name] || '').trim())
    .map((f) => f.label);
  return missing;
}

// --- Rutas ---

app.get('/api/templates', (req, res) => {
  const list = Object.values(templates).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    priceUsdCents: t.priceUsdCents,
    fields: t.fields,
  }));
  res.json({ templates: list, demoMode: DEMO_MODE });
});

app.post('/api/create-checkout', async (req, res) => {
  try {
    const { docType, fields } = req.body || {};
    const template = templates[docType];
    if (!template) {
      return res.status(400).json({ error: 'Tipo de documento inválido.' });
    }

    const missing = validateFields(template, fields || {});
    if (missing.length) {
      return res.status(400).json({ error: `Faltan completar: ${missing.join(', ')}` });
    }

    if (DEMO_MODE) {
      const encoded = Buffer.from(JSON.stringify({ docType, fields })).toString('base64url');
      return res.json({ demo: true, redirect: `/generar.html?demo=1&payload=${encoded}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: template.priceUsdCents,
            product_data: { name: template.label },
          },
          quantity: 1,
        },
      ],
      metadata: { docType, ...encodeFields(fields) },
      success_url: `${BASE_URL}/generar.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?cancelado=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creando checkout:', err);
    res.status(500).json({ error: 'No se pudo iniciar el pago. Probá de nuevo.' });
  }
});

app.get('/api/generate', async (req, res) => {
  try {
    let docType;
    let fields;

    if (req.query.demo === '1') {
      if (!DEMO_MODE) {
        return res.status(400).json({ error: 'El modo demo no está activo en este servidor.' });
      }
      const decoded = JSON.parse(Buffer.from(req.query.payload, 'base64url').toString('utf8'));
      docType = decoded.docType;
      fields = decoded.fields;
    } else {
      const sessionId = req.query.session_id;
      if (!sessionId) {
        return res.status(400).json({ error: 'Falta session_id.' });
      }
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return res.status(402).json({ error: 'El pago todavía no se acreditó.' });
      }
      docType = session.metadata.docType;
      fields = decodeFields(session.metadata);
    }

    const template = templates[docType];
    if (!template) {
      return res.status(400).json({ error: 'Tipo de documento inválido.' });
    }

    const prompt = template.buildPrompt(fields);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({ docLabel: template.label, text });
  } catch (err) {
    console.error('Error generando documento:', err);
    res.status(500).json({ error: 'No se pudo generar el documento. Probá de nuevo.' });
  }
});

app.listen(PORT, () => {
  console.log('✦ TrámiteFácil AI corriendo en http://localhost:' + PORT);
  console.log('  Modo: ' + (DEMO_MODE ? 'DEMO (sin cobrar, para probar)' : 'PRODUCCIÓN (Stripe activo)'));
});
