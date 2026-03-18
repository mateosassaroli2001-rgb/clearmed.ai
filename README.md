# ✦ ClearMed AI

Analizá estudios médicos con IA y obtené explicaciones en lenguaje simple.

---

## 🗂 Estructura del proyecto

```
clearmed-ai/
├── server.js          ← Backend Node.js + Express
├── package.json       ← Dependencias
├── .env.example       ← Plantilla de variables de entorno
├── .env               ← Tu API key (crealo vos, no se sube a git)
├── .gitignore
└── public/
    └── index.html     ← Frontend (landing page completa)
```

---

## ⚡ Cómo correrlo en tu PC

### 1. Requisitos previos

- **Node.js 18 o superior** — descargalo en https://nodejs.org
- Una **API key de Anthropic** — conseguila en https://console.anthropic.com

### 2. Instalá las dependencias

```bash
cd clearmed-ai
npm install
```

### 3. Configurá tu API key

Copiá el archivo de ejemplo y completá tu key:

```bash
# En Mac / Linux
cp .env.example .env

# En Windows (cmd)
copy .env.example .env
```

Luego abrí `.env` con cualquier editor de texto y reemplazá el valor:

```
ANTHROPIC_API_KEY=sk-ant-TU_KEY_REAL_AQUI
PORT=3000
```

### 4. Iniciá el servidor

```bash
npm start
```

Deberías ver en la terminal:

```
╔════════════════════════════════════════╗
║  ✦ ClearMed AI corriendo en             ║
║    http://localhost:3000               ║
╚════════════════════════════════════════╝
```

### 5. Abrí la app

Ve a **http://localhost:3000** en tu navegador y hacé clic en "Subir estudio".

---

## 🔄 Modo desarrollo (recarga automática)

Si querés que el servidor se reinicie automáticamente cuando cambiás `server.js`:

```bash
npm run dev
```

---

## 📡 Cómo funciona el flujo

```
Navegador                     Backend (server.js)           Anthropic API
    │                                  │                           │
    │  1. Usuario sube PDF/imagen       │                           │
    │──────────────────────────────────▶│                           │
    │                                  │  2. Envía el archivo      │
    │                                  │  o texto a Claude         │
    │                                  │──────────────────────────▶│
    │                                  │                           │
    │                                  │  3. Claude devuelve JSON  │
    │                                  │◀──────────────────────────│
    │  4. Backend reenvía el JSON       │                           │
    │◀──────────────────────────────────│                           │
    │                                  │                           │
    │  5. Frontend renderiza resultado  │                           │
```

### Por qué un backend y no llamar directo desde el browser

Anthropic no permite llamadas directas desde el navegador por seguridad (CORS bloqueado). El backend actúa como intermediario y mantiene la API key en el servidor, fuera del código cliente.

---

## 📋 Endpoint de la API

### `POST /analyze`

Acepta dos formatos:

**Opción A — Archivo (multipart/form-data):**
```
campo: file  →  PDF, JPG, PNG o WEBP (máx 15 MB)
```

**Opción B — Texto extraído (application/json):**
```json
{ "text": "texto del estudio médico extraído desde el PDF..." }
```

**Respuesta exitosa:**
```json
{
  "nombre_estudio": "Hemograma completo",
  "valores": [
    {
      "nombre": "Hemoglobina",
      "valor": "13.2",
      "unidad": "g/dL",
      "rango": "Normal: 12–16",
      "estado": "ok",
      "etiqueta": "✓ Normal"
    }
  ],
  "explicacion": "Tu sangre muestra valores normales...",
  "preguntas": ["¿Debería repetir este análisis?", "..."]
}
```

---

## ⚠️ Aviso importante

ClearMed AI es una herramienta **educativa e informativa**. No reemplaza la consulta médica profesional. Ante cualquier duda sobre tu salud, consultá a tu médico.
