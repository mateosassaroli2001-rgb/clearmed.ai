// Motor de efectos "premium" compartido entre la landing de Confeti y cada
// web de casamiento generada. Todo vanilla JS, sin dependencias, pensado
// para degradar bien en mobile/touch (donde varios efectos no aplican).

(function (global) {
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // --- Cursor con glow propio, con inercia (lerp) ---
  function initCursor(opts = {}) {
    if (isTouch || prefersReducedMotion) return;
    const color = opts.color || 'rgba(226,165,143,0.55)';
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0', width: '26px', height: '26px',
      borderRadius: '50%', pointerEvents: 'none', zIndex: '9999',
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      transform: 'translate(-50%, -50%)', mixBlendMode: 'screen',
      transition: 'width 0.25s ease, height 0.25s ease, opacity 0.3s ease',
      opacity: '0', willChange: 'transform',
    });
    document.body.appendChild(el);

    let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
    let shown = false;
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!shown) { el.style.opacity = '1'; shown = true; }
    });
    document.addEventListener('mouseleave', () => { el.style.opacity = '0'; shown = false; });

    document.querySelectorAll('a, button, .theme-option, .theme-card, [data-cursor-grow]').forEach((elm) => {
      elm.addEventListener('mouseenter', () => { el.style.width = '54px'; el.style.height = '54px'; });
      elm.addEventListener('mouseleave', () => { el.style.width = '26px'; el.style.height = '26px'; });
    });

    (function raf() {
      cx = lerp(cx, mx, 0.18);
      cy = lerp(cy, my, 0.18);
      el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(raf);
    })();
  }

  // --- Botones magnéticos: se acercan levemente al cursor ---
  function initMagnetic(selector, opts = {}) {
    if (isTouch || prefersReducedMotion) return;
    const strength = opts.strength ?? 0.35;
    const radius = opts.radius ?? 70;
    document.querySelectorAll(selector).forEach((btn) => {
      btn.style.transition = 'transform 0.25s cubic-bezier(.2,.8,.2,1)';
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const relX = e.clientX - (rect.left + rect.width / 2);
        const relY = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.sqrt(relX * relX + relY * relY);
        if (dist < radius + rect.width / 2) {
          btn.style.transform = `translate(${relX * strength}px, ${relY * strength}px)`;
        }
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'translate(0, 0)'; });
    });
  }

  // --- Capas con parallax de mouse (data-depth="0.2" etc en cada hijo) ---
  function initParallaxLayers(containerSelector) {
    if (isTouch || prefersReducedMotion) return;
    document.querySelectorAll(containerSelector).forEach((container) => {
      const layers = Array.from(container.querySelectorAll('[data-depth]'));
      if (!layers.length) return;
      container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        layers.forEach((layer) => {
          const depth = parseFloat(layer.dataset.depth) || 0;
          layer.style.transform = `translate(${nx * depth * 40}px, ${ny * depth * 40}px)`;
        });
      });
    });
  }

  // --- Parallax de scroll simple para fondos de hero ---
  function initScrollParallax(selector, speed = 0.35) {
    if (prefersReducedMotion) return;
    const els = document.querySelectorAll(selector);
    if (!els.length) return;
    let ticking = false;
    function update() {
      const y = scrollY;
      els.forEach((el) => { el.style.transform = `translateY(${y * speed}px)`; });
      ticking = false;
    }
    addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // --- Reveal de texto palabra por palabra ---
  function initRevealWords(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      const text = el.textContent;
      el.textContent = '';
      el.setAttribute('aria-label', text);
      text.split(/(\s+)/).forEach((chunk) => {
        if (!chunk.trim()) { el.appendChild(document.createTextNode(chunk)); return; }
        const span = document.createElement('span');
        span.textContent = chunk;
        span.style.display = 'inline-block';
        span.style.opacity = prefersReducedMotion ? '1' : '0';
        span.style.transform = prefersReducedMotion ? 'none' : 'translateY(0.5em) rotate(2deg)';
        span.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(.2,.8,.2,1)';
        el.appendChild(span);
      });
      const spans = el.querySelectorAll('span');
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            spans.forEach((span, i) => {
              setTimeout(() => {
                span.style.opacity = '1';
                span.style.transform = 'translateY(0) rotate(0)';
              }, i * 55);
            });
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      io.observe(el);
    });
  }

  // --- Fondo ambiental en canvas: bokeh / shards / petals ---
  function initAmbientCanvas(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    const shape = opts.shape || 'circle';
    const colors = opts.colors || ['#e2a58f'];
    const count = prefersReducedMotion ? 0 : (opts.count || 26);
    let w, h, dpr;
    let mouseX = 0.5, mouseY = 0.5;

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    addEventListener('resize', resize);

    if (!isTouch) {
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) / rect.width;
        mouseY = (e.clientY - rect.top) / rect.height;
      });
    }

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * (opts.rangeW || 1000),
      y: Math.random() * (opts.rangeH || 700),
      r: lerp(opts.minSize || 10, opts.maxSize || 34, Math.random()),
      vx: (Math.random() - 0.5) * (opts.speed || 0.15),
      vy: (Math.random() - 0.5) * (opts.speed || 0.15),
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.003,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: lerp(0.15, 0.5, Math.random()),
    }));

    function drawShape(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.alpha;
      if (shape === 'circle') {
        ctx.filter = 'blur(2px)';
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === 'shard') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-p.r, 0);
        ctx.lineTo(p.r, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.r, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else if (shape === 'petal') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 0.55, p.r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      const parX = (mouseX - 0.5) * (opts.parallax || 16);
      const parY = (mouseY - 0.5) * (opts.parallax || 16);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.x < -40) p.x = w + 40; if (p.x > w + 40) p.x = -40;
        if (p.y < -40) p.y = h + 40; if (p.y > h + 40) p.y = -40;
        ctx.save();
        ctx.translate(parX, parY);
        drawShape(p);
        ctx.restore();
      });
      if (!prefersReducedMotion) requestAnimationFrame(tick);
    }
    tick();
  }

  global.SiteFX = {
    initCursor, initMagnetic, initParallaxLayers, initScrollParallax,
    initRevealWords, initAmbientCanvas,
  };
})(window);
