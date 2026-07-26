require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');

const themes = require('./lib/themes');
const { renderSite, renderAdmin } = require('./lib/renderSite');
const store = require('./lib/store');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PRICE_USD_CENTS = parseInt(process.env.PRICE_USD_CENTS || '3000', 10);
const DEMO_MODE = !process.env.STRIPE_SECRET_KEY;

const stripe = DEMO_MODE ? null : require('stripe')(process.env.STRIPE_SECRET_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const UPLOADS_DIR = path.join(__dirname, 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
});

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const TONO_POR_TEMA = {
  romantico: 'romántico y cálido, con imágenes poéticas pero sin exagerar',
  moderno: 'directo, elegante y minimalista, frases cortas',
  boho: 'cercano, natural, con espíritu libre y aventurero',
};

async function pulirHistoria(bullets, tema) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Convertí estas notas sueltas de una pareja sobre cómo se conocieron en un texto corto (2-3 párrafos), en español rioplatense, tono ${TONO_POR_TEMA[tema] || TONO_POR_TEMA.romantico}, para la sección "Nuestra historia" de la web de su casamiento. No inventes datos que no estén en las notas. Devolvé solo el texto final, sin comentarios.\n\nNotas:\n${bullets}`,
        },
      ],
    });
    return message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  } catch (err) {
    console.error('No se pudo pulir la historia con IA, uso el texto original:', err.message);
    return bullets;
  }
}

function requireFields(body, fields) {
  return fields.filter((f) => !String(body[f] || '').trim());
}

// --- Rutas ---

app.get('/api/themes', (req, res) => {
  res.json({ themes: Object.values(themes), priceUsdCents: PRICE_USD_CENTS, demoMode: DEMO_MODE });
});

app.get('/api/check-slug', async (req, res) => {
  const slug = store.slugify(req.query.slug || '');
  if (!slug) return res.json({ available: false });
  const exists = await store.slugExists(slug);
  res.json({ slug, available: !exists });
});

app.post('/api/draft', upload.array('fotos', 8), async (req, res) => {
  try {
    const body = req.body;
    const missing = requireFields(body, [
      'theme', 'novio1', 'novio2', 'fecha', 'lugarCeremonia', 'lugarFiesta', 'historiaBullets', 'slugDeseado',
    ]);
    if (missing.length) {
      return res.status(400).json({ error: `Faltan completar: ${missing.join(', ')}` });
    }
    if (!themes[body.theme]) {
      return res.status(400).json({ error: 'Estilo inválido.' });
    }

    const draftId = crypto.randomUUID();
    const draftUploadDir = path.join(UPLOADS_DIR, 'drafts', draftId);
    await fs.mkdir(draftUploadDir, { recursive: true });

    const fotos = [];
    for (const file of req.files || []) {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `${crypto.randomUUID()}${ext}`;
      await fs.writeFile(path.join(draftUploadDir, filename), file.buffer);
      fotos.push(`/uploads/drafts/${draftId}/${filename}`);
    }

    const historiaTexto = await pulirHistoria(body.historiaBullets, body.theme);

    const draft = await store.saveDraft({
      draftId,
      theme: body.theme,
      novio1: body.novio1,
      novio2: body.novio2,
      fecha: body.fecha,
      hora: body.hora || '19:00',
      lugarCeremonia: body.lugarCeremonia,
      lugarFiesta: body.lugarFiesta,
      historiaBullets: body.historiaBullets,
      historiaTexto,
      vestimenta: body.vestimenta || '',
      alojamiento: body.alojamiento || '',
      regalos: body.regalos || '',
      rsvpLimite: body.rsvpLimite || '',
      slugDeseado: store.slugify(body.slugDeseado),
      fotos,
    });

    res.json({ draftId: draft.draftId });
  } catch (err) {
    console.error('Error creando borrador:', err);
    res.status(500).json({ error: 'No se pudo guardar la información. Probá de nuevo.' });
  }
});

function publishBarHtml(draft) {
  return `
<div id="confetiPublishBar" style="position:fixed; bottom:0; left:0; right:0; z-index:100; background:#0d0b12; border-top:1px solid rgba(226,165,143,0.4); padding:16px 20px; display:flex; align-items:center; justify-content:center; gap:16px; flex-wrap:wrap; font-family:'Inter',sans-serif;">
  <span style="color:#c4bdd0; font-size:0.9rem;">¿Te gusta cómo quedó? Publicala para compartirla con tus invitados.</span>
  <button id="confetiPublishBtn" style="background:#e2a58f; color:#2a1a15; border:none; padding:12px 24px; border-radius:999px; font-weight:700; cursor:pointer; font-size:0.95rem;">Publicar mi web</button>
</div>
<script>
(function () {
  var btn = document.getElementById('confetiPublishBtn');
  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Un momento...';
    fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: '${draft.draftId}', slug: '${draft.slugDeseado}' }),
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (!res.ok) {
          alert(res.data.error || 'Ocurrió un error, probá de nuevo.');
          btn.disabled = false;
          btn.textContent = 'Publicar mi web';
          return;
        }
        window.location.href = res.data.demo ? res.data.redirect : res.data.url;
      })
      .catch(function () {
        alert('No se pudo conectar con el servidor.');
        btn.disabled = false;
        btn.textContent = 'Publicar mi web';
      });
  });
})();
</script>`;
}

app.get('/preview/:draftId', async (req, res) => {
  const draft = await store.getDraft(req.params.draftId);
  if (!draft) return res.status(404).send('No encontramos esta vista previa. Puede haber expirado.');
  const html = renderSite({ ...draft, slug: draft.slugDeseado }, { preview: true });
  const withPublishBar = html.replace('</body>', `${publishBarHtml(draft)}\n</body>`);
  res.send(withPublishBar);
});

async function finalizeDraft(draftId, desiredSlug) {
  const draft = await store.getDraft(draftId);
  if (!draft) throw new Error('draft_not_found');

  let slug = store.slugify(desiredSlug || draft.slugDeseado);
  if (await store.slugExists(slug)) {
    slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const finalUploadDir = path.join(UPLOADS_DIR, 'weddings', slug);
  await fs.mkdir(path.dirname(finalUploadDir), { recursive: true });
  const draftUploadDir = path.join(UPLOADS_DIR, 'drafts', draftId);
  await fs.rename(draftUploadDir, finalUploadDir).catch(async () => {
    await fs.mkdir(finalUploadDir, { recursive: true });
  });

  const fotos = (draft.fotos || []).map((f) => f.replace(`/uploads/drafts/${draftId}/`, `/uploads/weddings/${slug}/`));

  const adminToken = crypto.randomBytes(16).toString('hex');
  const wedding = {
    ...draft,
    slug,
    fotos,
    adminToken,
    rsvps: [],
    createdAt: new Date().toISOString(),
  };
  delete wedding.draftId;
  delete wedding.slugDeseado;

  await store.saveWedding(wedding);
  await store.deleteDraft(draftId);
  return wedding;
}

app.post('/api/create-checkout', async (req, res) => {
  try {
    const { draftId, slug } = req.body || {};
    const draft = await store.getDraft(draftId);
    if (!draft) return res.status(404).json({ error: 'No encontramos tu borrador. Volvé a completar el formulario.' });

    const desiredSlug = store.slugify(slug || draft.slugDeseado);
    if (await store.slugExists(desiredSlug)) {
      return res.status(409).json({ error: 'Esa dirección ya está en uso, elegí otra.' });
    }

    if (DEMO_MODE) {
      const wedding = await finalizeDraft(draftId, desiredSlug);
      return res.json({ demo: true, redirect: `/w/${wedding.slug}?nuevo=1&admin=${wedding.adminToken}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: PRICE_USD_CENTS,
            product_data: { name: `Confeti — Web de casamiento (${draft.novio1} & ${draft.novio2})` },
          },
          quantity: 1,
        },
      ],
      metadata: { draftId, slug: desiredSlug },
      success_url: `${BASE_URL}/publicar/completar?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/preview/${draftId}?cancelado=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creando checkout:', err);
    res.status(500).json({ error: 'No se pudo iniciar el pago. Probá de nuevo.' });
  }
});

app.get('/publicar/completar', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).send('Falta información del pago.');
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(402).send('El pago todavía no se acreditó. Si ya pagaste, esperá unos segundos y refrescá.');
    }
    const wedding = await finalizeDraft(session.metadata.draftId, session.metadata.slug);
    res.redirect(302, `/w/${wedding.slug}?nuevo=1&admin=${wedding.adminToken}`);
  } catch (err) {
    console.error('Error completando publicación:', err);
    res.status(500).send('No se pudo publicar la web. Contactanos con tu comprobante de pago.');
  }
});

app.get('/w/:slug', async (req, res) => {
  const wedding = await store.getWedding(req.params.slug);
  if (!wedding) return res.status(404).send('No encontramos esta web de casamiento.');

  let banner = '';
  if (req.query.nuevo === '1' && req.query.admin === wedding.adminToken) {
    banner = `<div class="preview-banner">¡Tu web ya está publicada! Guardá este link para ver las confirmaciones: ${BASE_URL}/w/${wedding.slug}/admin?token=${wedding.adminToken}</div>`;
  }

  res.send(renderSite(wedding, { banner }));
});

app.get('/w/:slug/admin', async (req, res) => {
  const wedding = await store.getWedding(req.params.slug);
  if (!wedding) return res.status(404).send('No encontramos esta web de casamiento.');
  if (req.query.token !== wedding.adminToken) {
    return res.status(403).send('No tenés permiso para ver esta página.');
  }
  res.send(renderAdmin(wedding));
});

app.post('/api/rsvp/:slug', async (req, res) => {
  const { nombre, acompanantes, mensaje, confirma } = req.body || {};
  if (!String(nombre || '').trim()) {
    return res.status(400).json({ error: 'Falta el nombre.' });
  }
  const wedding = await store.addRsvp(req.params.slug, {
    nombre,
    acompanantes: parseInt(acompanantes, 10) || 0,
    mensaje: mensaje || '',
    confirma: !!confirma,
  });
  if (!wedding) return res.status(404).json({ error: 'No encontramos esta web.' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('✦ Confeti corriendo en http://localhost:' + PORT);
  console.log('  Modo: ' + (DEMO_MODE ? 'DEMO (sin cobrar, para probar)' : 'PRODUCCIÓN (Stripe activo)'));
});
