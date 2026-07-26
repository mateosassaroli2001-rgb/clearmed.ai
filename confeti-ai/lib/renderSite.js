const themes = require('./themes');

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2p(str) {
  return String(str || '')
    .split(/\n+/)
    .filter((line) => line.trim())
    .map((line) => `<p>${esc(line)}</p>`)
    .join('\n');
}

function renderGallery(fotos) {
  if (!fotos || !fotos.length) return '';
  const items = fotos
    .map((src) => `<div class="gallery-item reveal"><img src="${esc(src)}" alt="Foto de los novios" loading="lazy"></div>`)
    .join('\n');
  return `
  <section class="section gallery-section">
    <h2 class="section-title reveal">Nuestros momentos</h2>
    <div class="gallery-grid">${items}</div>
  </section>`;
}

function renderSite(wedding, { preview = false, banner = '' } = {}) {
  const theme = themes[wedding.theme] || themes.romantico;
  const fechaISO = wedding.fecha;
  const nombre = `${wedding.novio1} & ${wedding.novio2}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(nombre)} — Nuestro casamiento</title>
<link rel="stylesheet" href="${theme.css}">
</head>
<body class="theme-${theme.id}">
${banner || (preview ? '<div class="preview-banner">Vista previa — esta web todavía no está publicada</div>' : '')}

<header class="hero">
  <div class="hero-content">
    <p class="eyebrow reveal">Nos casamos</p>
    <h1 class="hero-names reveal">${esc(wedding.novio1)}<span class="amp">&amp;</span>${esc(wedding.novio2)}</h1>
    <p class="hero-date reveal">${esc(formatFechaLarga(fechaISO))}</p>
    <div class="countdown reveal" data-fecha="${esc(fechaISO)}" data-hora="${esc(wedding.hora || '00:00')}">
      <div class="countdown-item"><span class="num" data-unit="dias">--</span><span class="label">días</span></div>
      <div class="countdown-item"><span class="num" data-unit="horas">--</span><span class="label">hs</span></div>
      <div class="countdown-item"><span class="num" data-unit="min">--</span><span class="label">min</span></div>
      <div class="countdown-item"><span class="num" data-unit="seg">--</span><span class="label">seg</span></div>
    </div>
  </div>
</header>

<section class="section historia-section">
  <h2 class="section-title reveal">Nuestra historia</h2>
  <div class="historia-texto reveal">${nl2p(wedding.historiaTexto || wedding.historiaBullets)}</div>
</section>

<section class="section detalles-section">
  <h2 class="section-title reveal">Cuándo y dónde</h2>
  <div class="detalles-grid">
    <div class="detalle-card reveal">
      <h3>Ceremonia</h3>
      <p>${esc(wedding.lugarCeremonia)}</p>
    </div>
    <div class="detalle-card reveal">
      <h3>Fiesta</h3>
      <p>${esc(wedding.lugarFiesta)}</p>
    </div>
    ${wedding.vestimenta ? `<div class="detalle-card reveal"><h3>Código de vestimenta</h3><p>${esc(wedding.vestimenta)}</p></div>` : ''}
    ${wedding.alojamiento ? `<div class="detalle-card reveal"><h3>Alojamiento sugerido</h3><p>${esc(wedding.alojamiento)}</p></div>` : ''}
  </div>
</section>

${renderGallery(wedding.fotos)}

${wedding.regalos ? `
<section class="section regalos-section">
  <h2 class="section-title reveal">Mesa de regalos</h2>
  <p class="reveal">${esc(wedding.regalos)}</p>
</section>` : ''}

<section class="section rsvp-section">
  <h2 class="section-title reveal">Confirmá tu asistencia</h2>
  ${wedding.rsvpLimite ? `<p class="rsvp-deadline reveal">Por favor confirmá antes del ${esc(formatFechaLarga(wedding.rsvpLimite))}</p>` : ''}
  <form class="rsvp-form reveal" id="rsvpForm">
    <input type="text" name="nombre" placeholder="Tu nombre" required>
    <input type="number" name="acompanantes" placeholder="Cantidad de acompañantes" min="0" value="0">
    <textarea name="mensaje" placeholder="¿Algún mensaje para los novios? (opcional)"></textarea>
    <div class="rsvp-buttons">
      <button type="submit" data-confirma="1" class="rsvp-btn rsvp-yes">Sí, ahí estaré</button>
      <button type="submit" data-confirma="0" class="rsvp-btn rsvp-no">No voy a poder ir</button>
    </div>
  </form>
  <p class="rsvp-thanks" id="rsvpThanks" style="display:none;">¡Gracias por confirmar! Nos vemos pronto.</p>
</section>

<footer class="site-footer">Hecho con Confeti 🎉</footer>

<script>
(function () {
  var el = document.querySelector('.countdown');
  if (el) {
    var target = new Date(el.dataset.fecha + 'T' + el.dataset.hora + ':00');
    function tick() {
      var diff = target.getTime() - Date.now();
      if (diff < 0) diff = 0;
      var seg = Math.floor(diff / 1000);
      var dias = Math.floor(seg / 86400); seg -= dias * 86400;
      var horas = Math.floor(seg / 3600); seg -= horas * 3600;
      var min = Math.floor(seg / 60); seg -= min * 60;
      el.querySelector('[data-unit="dias"]').textContent = dias;
      el.querySelector('[data-unit="horas"]').textContent = String(horas).padStart(2, '0');
      el.querySelector('[data-unit="min"]').textContent = String(min).padStart(2, '0');
      el.querySelector('[data-unit="seg"]').textContent = String(seg).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  var revealEls = document.querySelectorAll('.reveal');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(function (elm) { observer.observe(elm); });

  var form = document.getElementById('rsvpForm');
  if (form && !${preview ? 'true' : 'false'}) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var confirma = e.submitter ? e.submitter.dataset.confirma === '1' : true;
      var data = {
        nombre: form.nombre.value,
        acompanantes: form.acompanantes.value,
        mensaje: form.mensaje.value,
        confirma: confirma,
      };
      fetch('/api/rsvp/${esc(wedding.slug)}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(function () {
        form.style.display = 'none';
        document.getElementById('rsvpThanks').style.display = 'block';
      });
    });
  } else if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('El RSVP se activa cuando la web está publicada.');
    });
  }
})();
</script>

</body>
</html>`;
}

function formatFechaLarga(iso) {
  if (!iso) return '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${meses[m - 1]} de ${y}`;
}

function renderAdmin(wedding) {
  const rsvps = wedding.rsvps || [];
  const confirmados = rsvps.filter((r) => r.confirma);
  const totalPersonas = confirmados.reduce((sum, r) => sum + 1 + (parseInt(r.acompanantes, 10) || 0), 0);

  const rows = rsvps
    .slice()
    .reverse()
    .map(
      (r) => `<tr>
        <td>${esc(r.nombre)}</td>
        <td>${r.confirma ? 'Sí' : 'No'}</td>
        <td>${esc(r.acompanantes || 0)}</td>
        <td>${esc(r.mensaje || '')}</td>
        <td>${esc(new Date(r.fecha).toLocaleString('es-AR'))}</td>
      </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Panel — ${esc(wedding.novio1)} &amp; ${esc(wedding.novio2)}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #222; }
  h1 { font-size: 1.4rem; }
  .stats { display: flex; gap: 20px; margin: 20px 0; }
  .stat { background: #f5f5f7; border-radius: 10px; padding: 14px 20px; }
  .stat .num { font-size: 1.6rem; font-weight: 700; display: block; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e5e5; font-size: 0.9rem; }
  th { color: #666; font-weight: 600; }
  a.back { color: #2451ff; text-decoration: none; font-size: 0.9rem; }
</style>
</head>
<body>
  <a class="back" href="/w/${esc(wedding.slug)}">&larr; Ver la web</a>
  <h1>Confirmaciones — ${esc(wedding.novio1)} &amp; ${esc(wedding.novio2)}</h1>
  <div class="stats">
    <div class="stat"><span class="num">${rsvps.length}</span>Respuestas</div>
    <div class="stat"><span class="num">${confirmados.length}</span>Confirmados</div>
    <div class="stat"><span class="num">${totalPersonas}</span>Personas en total</div>
  </div>
  <table>
    <thead><tr><th>Nombre</th><th>Asiste</th><th>Acompañantes</th><th>Mensaje</th><th>Fecha</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">Todavía no hay respuestas.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

module.exports = { renderSite, renderAdmin };
