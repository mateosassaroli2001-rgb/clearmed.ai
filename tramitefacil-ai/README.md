# ✦ TrámiteFácil AI

Generá contratos y cartas legales (alquiler, renuncia laboral, carta documento,
compraventa, poderes, autorizaciones de viaje) listos para firmar, en minutos,
completando un formulario. Cada documento se paga por separado — no hace falta
suscripción.

---

## 🗂 Estructura del proyecto

```
tramitefacil-ai/
├── server.js              ← Backend Node.js + Express
├── lib/templates.js        ← Tipos de documento: campos del formulario + prompt para Claude
├── package.json
├── .env.example
└── public/
    ├── index.html          ← Landing + selector de documento + wizard
    └── generar.html        ← Página de resultado, muestra el doc y descarga el PDF
```

---

## ⚡ Cómo correrlo en tu PC

### 1. Requisitos

- **Node.js 18+**
- Una **API key de Anthropic** — https://console.anthropic.com
- (Opcional para probar) Una cuenta de **Stripe** — https://dashboard.stripe.com

### 2. Instalar dependencias

```bash
cd tramitefacil-ai
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Completá `ANTHROPIC_API_KEY` en `.env`. Si **no** completás `STRIPE_SECRET_KEY`,
la app arranca en **modo demo**: cualquiera puede generar documentos gratis,
sin pasar por el pago. Esto sirve para probar el flujo completo antes de
activar los cobros reales.

### 4. Iniciar el servidor

```bash
npm start
```

Abrí **http://localhost:3000**.

---

## 💳 Activar los cobros con Stripe

1. Creá una cuenta en https://dashboard.stripe.com y conseguí tu **Secret key**
   (empieza con `sk_live_...` o `sk_test_...` para probar sin plata real).
2. Completá `STRIPE_SECRET_KEY` en `.env`.
3. Reiniciá el servidor — ya no vas a ver el banner de "modo demo" y cada
   documento va a pedir el pago antes de generarse.
4. Los precios de cada documento están en `lib/templates.js` (campo
   `priceUsdCents`). Cambialos ahí si querés ajustar el valor.

No hace falta configurar productos en el dashboard de Stripe: el precio se
crea al vuelo en cada `checkout.session` (`price_data`), así que alcanza con
la Secret Key.

---

## 📝 Agregar un nuevo tipo de documento

Sumá una entrada nueva en `lib/templates.js` con:

- `label` / `description`: lo que ve el usuario en la landing.
- `priceUsdCents`: precio en centavos de USD.
- `fields`: los campos del formulario (`name`, `label`, `type`, `required`).
- `buildPrompt(fields)`: arma el prompt que se le manda a Claude para redactar
  ese documento con los datos cargados.

No hace falta tocar el frontend: el formulario y la card de la landing se
generan solos a partir de `/api/templates`.

---

## 🚀 Deploy

Pensado para deployar en Vercel (incluye `vercel.json`) o cualquier hosting
que corra Node.js (Railway, Render, etc.). Variables de entorno necesarias en
el hosting: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `BASE_URL` (la URL
pública final, para que los links de éxito/cancelación de Stripe apunten bien).

---

## ⚠️ Aviso importante

Los documentos generados son **modelos orientativos**, redactados con IA. No
reemplazan el asesoramiento de un abogado matriculado. Ante una situación de
monto alto o complejidad legal, conviene revisar el documento con un
profesional antes de firmarlo.
