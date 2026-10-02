# MarginWatch (versión local 0.1)

Herramienta para comerciantes de Shopify: subís una factura de proveedor, revisás los productos detectados y ves cómo
cambiaron tus **costos** y tu **margen bruto estimado**. También calcula el precio que mantiene el margen que buscás.

> Esta versión funciona **sólo en tu computadora**. No se conecta a ninguna tienda y **no cambia precios ni costos reales**.

---

## Cómo abrirla (5 minutos)

1. Instalá **Node.js 20.19 o superior** desde <https://nodejs.org> (versión "LTS").
2. Abrí una terminal en esta carpeta (`marginwatch/`) y ejecutá:

   ```bash
   npm install
   npm start
   ```

3. Abrí en el navegador: **<http://localhost:3000>**
4. Para cerrarla, volvé a la terminal y apretá `Ctrl + C`. Tus datos quedan guardados en la carpeta `data/`.

### Probar el recorrido completo sin nada propio

1. **Catálogo** → «Usar catálogo de ejemplo» y elegí «sin impuestos (neto)».
2. **Factura** → «Cargar factura de ejemplo» (está rotulada como FICTICIA).
3. **Revisión** → «Confirmar 2 con SKU exacto», confirmá el café, elegí la taza **Blanca**, escribí **20** unidades en la
   caja de bombillas y confirmá. Ignorá el flete. El molinillo queda bloqueado a propósito (está en USD y la factura en ARS).
4. **Márgenes** → elegí un margen objetivo, aprobá propuestas.
5. **Exportación** → descargá el CSV para revisión.

### Activar la lectura automática de facturas (opcional)

Sin clave, todo funciona salvo la extracción automática: podés cargar las líneas a mano.
Para activarla:

1. Creá una clave en <https://console.anthropic.com/> (la API se paga por uso; revisá precios antes).
2. Copiá `.env.example` como `.env` (en Windows: `copy .env.example .env`).
3. Abrí `.env` y completá `ANTHROPIC_API_KEY=` con tu clave.
4. Reiniciá la app (`Ctrl + C` y `npm start`). La pantalla «Factura» va a decir «Extracción automática activa».

En `samples/factura-ejemplo.pdf` hay una factura ficticia en PDF para probar la extracción real.

---

## Comandos

| Comando | Para qué sirve |
|---|---|
| `npm start` | Compila la interfaz y abre la app en <http://localhost:3000> |
| `npm run dev` | Modo desarrollo (recarga al editar el código) |
| `npm test` | Ejecuta las pruebas de cálculo |
| `npm run typecheck` | Verifica los tipos de TypeScript |
| `npm run sample:pdf` | Regenera la factura ficticia en PDF |

## Reglas de cálculo

- **Margen bruto** = (precio de venta − costo) ÷ precio de venta.
- **Precio sugerido** = costo ÷ (1 − margen objetivo), redondeado **hacia arriba** al centavo.
- Margen ≠ recargo: costo 100 y precio 150 es 50 % de recargo pero **33,3 % de margen**.
- Costo por unidad = importe de la línea ÷ (cantidad × unidades por presentación). Una caja nunca se toma como unidad:
  si dice «caja» sin cantidad, la línea queda bloqueada hasta que indiques cuántas unidades trae.
- Se aplican descuentos de línea y descuento general. Si el importe no coincide con cantidad × precio − descuento, se
  pide elegir cuál usar.
- Si un producto aparece en varias líneas, se usa el promedio ponderado por unidades.
- **Se bloquea el cálculo** (con el motivo a la vista) si: la línea no está confirmada, falta el producto, la moneda de
  la factura no coincide con la del producto, no se confirmó si los importes incluyen impuestos (catálogo o factura),
  las bases difieren y no hay tasa para convertir, o hay cantidades/importes vacíos, cero, negativos o inválidos.
- Todos los importes se calculan con precisión decimal (sin errores de redondeo de JavaScript).
- Es un **margen bruto estimado**: no incluye envío, comisiones ni otros gastos.

## Qué funciona realmente

- Importar catálogo CSV (coma o punto y coma; números `1234.56` o `1.234,56`; formatos ambiguos como `1.500` se rechazan).
- Subir facturas PDF/JPG/PNG/WEBP: se valida el tipo **por contenido** y el tamaño (máx. 10 MB).
- Extracción con IA (Claude) del lado servidor, configurable por `.env`. Probado hasta la autenticación con la API; con
  una clave válida devuelve proveedor, fecha, moneda y líneas.
- Sin clave: la factura queda guardada y marcada «extracción pendiente»; nunca se simulan datos. Carga manual disponible.
- Factura de ejemplo separada y rotulada como ficticia.
- Coincidencias con prioridad SKU → SKU en el texto → nombre. Las ambiguas no se preseleccionan. Todo es editable y el
  texto original de la factura queda siempre visible.
- Tabla de costos, variación, márgenes y precio sugerido; margen objetivo general y por producto; precio propuesto editable.
- Exportación CSV de propuestas aprobadas (para revisión, **no** para importar en Shopify).
- Guardado automático local (`data/marginwatch.json` y `data/facturas/`), para retomar donde dejaste.
- Interfaz en español, adaptable a celular.

## Qué queda pendiente

- **Probar la extracción con tu clave real** y con facturas reales (la precisión depende de la calidad del archivo).
- Conversión entre monedas (hoy se bloquea si son distintas).
- Tasas de impuesto distintas por línea (hoy hay una tasa por factura).
- Verificar el formato oficial de importación de productos de Shopify antes de ofrecer un CSV compatible.
- Integración con Shopify: la documentación oficial recomienda la plantilla **React Router**
  (`shopify app init`). La lógica de negocio está en `src/core/` (TypeScript puro, sin dependencias de servidor) para
  poder moverla tal cual a esa plantilla. Requiere cuenta de Shopify Partners y una tienda de desarrollo.
- Usuarios múltiples, suscripciones y escritura de precios en una tienda (fuera del alcance de esta versión).

## Estructura

```
marginwatch/
├── src/core/      Cálculos, cajas/unidades, coincidencias, CSV (reutilizable en Shopify)
├── src/server/    Servidor local: archivos, IA, guardado, exportación
├── src/client/    Interfaz React (Catálogo → Factura → Revisión → Márgenes → Exportación)
├── samples/       Catálogo y factura ficticios (JSON + PDF)
└── tests/         Pruebas automáticas (npm test)
```

## Privacidad y seguridad

- La clave de la API vive sólo en `.env` (excluido de git) y se usa del lado servidor.
- Los registros de la terminal sólo muestran datos técnicos (tipo y tamaño de archivo, cantidad de líneas), nunca el
  contenido de las facturas.
- El servidor escucha sólo en `localhost` y rechaza pedidos de otros sitios.
