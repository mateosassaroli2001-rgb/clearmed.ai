// Storage simple basado en archivos JSON. Alcanza para el volumen de una
// SaaS chica arrancando, pero necesita disco persistente (Railway/Render).
// En un host serverless (Vercel) estos archivos no sobreviven entre
// invocaciones — ver README antes de deployar.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DRAFTS_DIR = path.join(__dirname, '..', 'data', 'drafts');
const WEDDINGS_DIR = path.join(__dirname, '..', 'data', 'weddings');

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function draftPath(draftId) {
  return path.join(DRAFTS_DIR, `${draftId}.json`);
}

async function weddingPath(slug) {
  return path.join(WEDDINGS_DIR, `${slug}.json`);
}

async function saveDraft(data) {
  const draftId = data.draftId || crypto.randomUUID();
  const payload = { ...data, draftId };
  await fs.writeFile(await draftPath(draftId), JSON.stringify(payload, null, 2));
  return payload;
}

async function getDraft(draftId) {
  try {
    const raw = await fs.readFile(await draftPath(draftId), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function deleteDraft(draftId) {
  try {
    await fs.unlink(await draftPath(draftId));
  } catch (err) {
    // ya no existe, no pasa nada
  }
}

async function slugExists(slug) {
  try {
    await fs.access(await weddingPath(slug));
    return true;
  } catch (err) {
    return false;
  }
}

async function saveWedding(data) {
  await fs.writeFile(await weddingPath(data.slug), JSON.stringify(data, null, 2));
  return data;
}

async function getWedding(slug) {
  try {
    const raw = await fs.readFile(await weddingPath(slug), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function addRsvp(slug, rsvp) {
  const wedding = await getWedding(slug);
  if (!wedding) return null;
  wedding.rsvps = wedding.rsvps || [];
  wedding.rsvps.push({ ...rsvp, fecha: new Date().toISOString() });
  await saveWedding(wedding);
  return wedding;
}

module.exports = {
  slugify,
  saveDraft,
  getDraft,
  deleteDraft,
  slugExists,
  saveWedding,
  getWedding,
  addRsvp,
};
