// Genera samples/factura-ejemplo.pdf a partir de samples/factura-ejemplo.json.
// Es una factura FICTICIA para probar la subida de archivos y la extracción con IA.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Line = { codigo: string | null; descripcion: string; presentacion: string | null; cantidad: string; precio_unitario: string; importe: string; descuento_pct: string | null };
const data = JSON.parse(readFileSync("samples/factura-ejemplo.json", "utf8")) as { proveedor: string; numero_factura: string; fecha: string; lineas: Line[] };

const ar = (s: string) => {
  const [i = "0", d = "00"] = Number(s).toFixed(2).split(".");
  return `$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
};

const pdf = await PDFDocument.create();
const page = pdf.addPage([595, 842]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const gray = rgb(0.4, 0.4, 0.4);
const text = (t: string, x: number, y: number, size = 9, f = font, color = rgb(0, 0, 0)) => page.drawText(t, { x, y, size, font: f, color });

page.drawRectangle({ x: 40, y: 790, width: 515, height: 22, color: rgb(1, 0.93, 0.8) });
text("DOCUMENTO FICTICIO - DATOS DE EJEMPLO SIN VALIDEZ FISCAL", 120, 797, 10, bold, rgb(0.55, 0.3, 0));
text(data.proveedor, 40, 760, 15, bold);
text("CUIT 00-00000000-0 (ficticio) - Av. Inventada 123, Ciudad Ejemplo", 40, 744, 9, font, gray);
text("FACTURA A", 420, 760, 14, bold);
text(`N° ${data.numero_factura}`, 420, 744);
const [y, m, d] = data.fecha.split("-");
text(`Fecha: ${d}/${m}/${y}`, 420, 731);
text("Cliente: Tienda Ficticia de Prueba", 40, 715);
text("Condición de venta: Cuenta corriente 30 días - Moneda: Pesos argentinos (ARS)", 40, 702);

const cols = [40, 100, 255, 335, 370, 440, 490];
const heads = ["Código", "Descripción", "Presentación", "Cant.", "Precio unit.", "Desc.", "Importe"];
page.drawRectangle({ x: 38, y: 668, width: 519, height: 18, color: rgb(0.92, 0.94, 0.93) });
heads.forEach((h, i) => text(h, cols[i]!, 673, 8.5, bold));

let row = 650;
for (const l of data.lineas) {
  text(l.codigo ?? "", cols[0]!, row, 8.5);
  text(l.descripcion, cols[1]!, row, 8.5);
  text(l.presentacion ?? "", cols[2]!, row, 8.5);
  text(l.cantidad, cols[3]!, row, 8.5);
  text(ar(l.precio_unitario), cols[4]!, row, 8.5);
  text(l.descuento_pct ? `${l.descuento_pct}%` : "", cols[5]!, row, 8.5);
  text(ar(l.importe), cols[6]!, row, 8.5);
  page.drawLine({ start: { x: 38, y: row - 6 }, end: { x: 557, y: row - 6 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
  row -= 20;
}
const subtotal = data.lineas.reduce((s, l) => s + Number(l.importe), 0);
row -= 10;
text("Subtotal neto gravado", 380, row, 9, bold); text(ar(String(subtotal)), 490, row); row -= 15;
text("IVA 21 %", 380, row, 9, bold); text(ar(String(subtotal * 0.21)), 490, row); row -= 15;
text("TOTAL", 380, row, 11, bold); text(ar(String(subtotal * 1.21)), 490, row, 11, bold);
text("Los precios unitarios e importes de línea no incluyen IVA.", 40, row - 30, 8.5, font, gray);

writeFileSync("samples/factura-ejemplo.pdf", await pdf.save());
console.log("Generado samples/factura-ejemplo.pdf");
