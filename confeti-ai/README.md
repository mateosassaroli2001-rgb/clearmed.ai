# ✦ Confeti

SaaS que genera webs de casamiento animadas y premium en minutos: elegís un
estilo, completás los datos y las fotos, y Confeti arma una web con cuenta
regresiva, galería, y formulario de confirmación (RSVP) con panel privado
para los novios. Se paga una sola vez por web, sin suscripción.

---

## 🗂 Estructura del proyecto

```
confeti-ai/
├── server.js              ← Backend Node.js + Express
├── lib/
│   ├── themes.js           ← Los 3 estilos disponibles (metadata)
│   ├── renderSite.js       ← Arma el HTML final de cada web + el panel admin
│   └── store.js            ← Guardado en archivos JSON (borradores y webs publicadas)
├── public/
│   ├── index.html          ← Landing de marketing de Confeti
│   ├── crear.html          ← Wizard de creación (multi-paso)
│   └── css/
│       ├── theme-romantico.css
│       ├── theme-moderno.css
│       └── theme-boho.css
├── data/
│   ├── drafts/              ← Borradores mientras no se publican (JSON)
│   └── weddings/            ← Webs ya publicadas (JSON, una por slug)
└── uploads/                 ← Fotos subidas por los novios
```

---

## ⚡ Cómo correrlo en tu PC

### 1. Requisitos

- **Node.js 18+**
- Una **API key de Anthropic** — https://console.anthropic.com (para pulir
  el texto de "nuestra historia"; si falla o no está configurada, se usa el
  texto tal cual lo escribió la pareja, la app no se rompe)
- (Opcional para probar) Una cuenta de **Stripe** — https://dashboard.stripe.com

### 2. Instalar dependencias

```bash
cd confeti-ai
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Completá `ANTHROPIC_API_KEY`. Si **no** completás `STRIPE_SECRET_KEY`, la
app corre en **modo demo**: publicar una web se salta el pago, para poder
probar el flujo completo (wizard → vista previa → web publicada → RSVP →
panel admin) sin cobrar nada.

### 4. Iniciar el servidor

```bash
npm start
```

Abrí **http://localhost:3000**.

---

## 🧭 Flujo completo

1. `/` — landing que vende el producto.
2. `/crear.html` — wizard de 6 pasos: estilo, datos básicos, historia,
   detalles, fotos, dirección de la web (slug).
3. Al terminar el wizard, se crea un **borrador** (`POST /api/draft`) y se
   redirige a `/preview/:draftId` — la web ya se ve completa, animada, con
   los datos reales, pero marcada como "vista previa" y sin RSVP activo.
4. Desde la vista previa, el botón **"Publicar mi web"** dispara el pago
   (Stripe Checkout, o el modo demo). Al confirmarse el pago, el borrador se
   "finaliza": se le asigna el slug definitivo, se generan las fotos en su
   carpeta final, y se genera un **token de administrador**.
5. La web queda online en `/w/:slug`, compartible por WhatsApp. El RSVP
   guarda las respuestas de los invitados.
6. Los novios ven quién confirmó en `/w/:slug/admin?token=...` — el link con
   el token se les muestra una sola vez al publicar (guardalo, no hay envío
   de mail todavía).

---

## 💳 Activar los cobros con Stripe

1. Conseguí tu **Secret key** en https://dashboard.stripe.com/apikeys
   (`sk_test_...` para probar sin plata real, `sk_live_...` para cobrar de
   verdad).
2. Completá `STRIPE_SECRET_KEY` en `.env` y reiniciá el servidor.
3. El precio se define en `PRICE_USD_CENTS` (también en `.env`) — es un
   placeholder, cambialo cuando definas el precio final. No hace falta crear
   productos en el dashboard de Stripe: el precio se arma al vuelo en cada
   sesión de checkout.

---

## ⚠️ Sobre el almacenamiento (importante para el deploy)

Confeti guarda los borradores, las webs publicadas y las fotos como
**archivos en disco** (`data/` y `uploads/`), no en una base de datos. Esto
es simple y funciona perfecto en un hosting con **disco persistente**
(Railway, Render, una VPS).

**No lo deployes en Vercel u otro hosting serverless** tal cual está: el
sistema de archivos ahí es efímero (se resetea en cada invocación), así que
las webs publicadas se perderían. Si más adelante hace falta escalar a
serverless, el siguiente paso natural es migrar `lib/store.js` a una base de
datos real (Postgres/Supabase, por ejemplo) sin tocar el resto del código,
porque todas las rutas ya pasan por esas funciones.

---

## 🎨 Agregar un nuevo estilo visual

1. Sumá una entrada en `lib/themes.js` (`id`, `label`, `description`, `css`,
   `swatch`).
2. Creá el archivo CSS correspondiente en `public/css/`, reutilizando las
   mismas clases que ya usan los otros temas (`.hero`, `.section`,
   `.detalle-card`, `.rsvp-form`, etc. — están todas en `lib/renderSite.js`).

No hace falta tocar el wizard ni la landing: los estilos disponibles se
cargan solos desde `/api/themes`.
