// Cada plantilla define los campos que pide el wizard y cómo se arma
// el prompt que se le manda a Claude para redactar el documento final.

const DISCLAIMER =
  "Este documento es un modelo orientativo generado por IA. No reemplaza el asesoramiento de un abogado matriculado. Antes de firmarlo, revisalo con un profesional si el monto o la situación lo amerita.";

function field(name, label, type = "text", required = true) {
  return { name, label, type, required };
}

const templates = {
  contrato_alquiler: {
    id: "contrato_alquiler",
    label: "Contrato de alquiler de vivienda",
    description: "Contrato entre locador y locatario para alquilar una vivienda.",
    priceUsdCents: 300,
    fields: [
      field("locador_nombre", "Nombre completo del locador (dueño)"),
      field("locador_dni", "DNI del locador"),
      field("locatario_nombre", "Nombre completo del locatario (inquilino)"),
      field("locatario_dni", "DNI del locatario"),
      field("direccion_inmueble", "Dirección del inmueble"),
      field("monto_alquiler", "Monto del alquiler mensual"),
      field("duracion_meses", "Duración del contrato (en meses)"),
      field("fecha_inicio", "Fecha de inicio", "date"),
      field("deposito_garantia", "Monto del depósito en garantía", "text", false),
      field("forma_pago", "Forma de pago (transferencia, efectivo, etc.)"),
    ],
    buildPrompt(f) {
      return `Redactá un contrato de alquiler de vivienda completo y formal en español rioplatense, listo para imprimir y firmar, con estos datos:

Locador (propietario): ${f.locador_nombre}, DNI ${f.locador_dni}
Locatario (inquilino): ${f.locatario_nombre}, DNI ${f.locatario_dni}
Inmueble: ${f.direccion_inmueble}
Alquiler mensual: ${f.monto_alquiler}
Duración: ${f.duracion_meses} meses, desde el ${f.fecha_inicio}
Depósito en garantía: ${f.deposito_garantia || "no especificado"}
Forma de pago: ${f.forma_pago}

Incluí cláusulas estándar de uso habitual (destino del inmueble, conservación, reparaciones, prohibición de subalquilar sin autorización, causales de rescisión, jurisdicción) numeradas, encabezado con lugar y fecha, y espacio de firmas al final para ambas partes con aclaración y DNI. Devolvé solo el texto del contrato, sin comentarios adicionales.`;
    },
  },

  carta_renuncia: {
    id: "carta_renuncia",
    label: "Carta de renuncia laboral",
    description: "Carta formal de renuncia a un empleo, con preaviso.",
    priceUsdCents: 200,
    fields: [
      field("empleado_nombre", "Tu nombre completo"),
      field("empleado_dni", "Tu DNI"),
      field("empresa_nombre", "Nombre de la empresa"),
      field("cargo", "Tu cargo/puesto"),
      field("fecha_ingreso", "Fecha de ingreso a la empresa", "date"),
      field("fecha_renuncia", "Fecha de presentación de la renuncia", "date"),
      field("dias_preaviso", "Días de preaviso que vas a dar", "text", false),
    ],
    buildPrompt(f) {
      return `Redactá una carta de renuncia laboral formal en español rioplatense, lista para imprimir y firmar, con estos datos:

Empleado: ${f.empleado_nombre}, DNI ${f.empleado_dni}, cargo: ${f.cargo}
Empresa: ${f.empresa_nombre}
Fecha de ingreso: ${f.fecha_ingreso}
Fecha de presentación de la renuncia: ${f.fecha_renuncia}
Preaviso: ${f.dias_preaviso || "el legal correspondiente"}

Debe incluir lugar y fecha, destinatario (a quien corresponda / RRHH), párrafo de renuncia citando el cargo y la fecha de ingreso, mención del preaviso, ofrecimiento de ayudar en la transición, agradecimiento breve y cierre formal con espacio de firma y aclaración. Devolvé solo el texto de la carta, sin comentarios adicionales.`;
    },
  },

  carta_documento: {
    id: "carta_documento",
    label: "Carta documento / reclamo formal",
    description: "Intimación formal a otra persona o empresa por un reclamo.",
    priceUsdCents: 300,
    fields: [
      field("remitente_nombre", "Tu nombre completo"),
      field("remitente_dni", "Tu DNI"),
      field("remitente_domicilio", "Tu domicilio"),
      field("destinatario_nombre", "Nombre del destinatario"),
      field("destinatario_domicilio", "Domicilio del destinatario"),
      field("motivo_reclamo", "Motivo del reclamo (explicá la situación)", "textarea"),
      field("monto_adeudado", "Monto reclamado (si aplica)", "text", false),
      field("plazo_intimacion", "Plazo que le das para responder (ej: 10 días hábiles)"),
    ],
    buildPrompt(f) {
      return `Redactá el texto de una carta documento (intimación formal) en español rioplatense, con tono firme pero formal, con estos datos:

Remitente: ${f.remitente_nombre}, DNI ${f.remitente_dni}, domicilio: ${f.remitente_domicilio}
Destinatario: ${f.destinatario_nombre}, domicilio: ${f.destinatario_domicilio}
Motivo del reclamo: ${f.motivo_reclamo}
Monto reclamado: ${f.monto_adeudado || "no aplica"}
Plazo de intimación: ${f.plazo_intimacion}

La estructura debe ser: encabezado con datos de remitente y destinatario, cuerpo explicando los hechos y el reclamo con claridad, intimación formal a cumplir en el plazo indicado bajo apercibimiento de iniciar las acciones legales que correspondan, y cierre con lugar, fecha y espacio de firma. Aclará al final, en una línea aparte, que este texto está pensado para enviarse por el servicio de Carta Documento de Correo Argentino. Devolvé solo el texto, sin comentarios adicionales.`;
    },
  },

  contrato_compraventa: {
    id: "contrato_compraventa",
    label: "Contrato de compraventa de bien mueble",
    description: "Para vender/comprar autos, motos u otros bienes muebles.",
    priceUsdCents: 300,
    fields: [
      field("vendedor_nombre", "Nombre completo del vendedor"),
      field("vendedor_dni", "DNI del vendedor"),
      field("comprador_nombre", "Nombre completo del comprador"),
      field("comprador_dni", "DNI del comprador"),
      field("descripcion_bien", "Descripción del bien (marca, modelo, año, patente/serie)", "textarea"),
      field("precio", "Precio de venta"),
      field("forma_pago", "Forma de pago"),
      field("fecha_entrega", "Fecha de entrega", "date"),
    ],
    buildPrompt(f) {
      return `Redactá un contrato de compraventa de un bien mueble en español rioplatense, formal y listo para firmar, con estos datos:

Vendedor: ${f.vendedor_nombre}, DNI ${f.vendedor_dni}
Comprador: ${f.comprador_nombre}, DNI ${f.comprador_dni}
Bien vendido: ${f.descripcion_bien}
Precio: ${f.precio}
Forma de pago: ${f.forma_pago}
Fecha de entrega: ${f.fecha_entrega}

Incluí cláusulas de estado del bien (se vende en el estado en que se encuentra, visto y aceptado por el comprador), garantía de titularidad y libre de deudas/gravámenes por parte del vendedor, forma y momento de la entrega, y jurisdicción. Cerrá con lugar, fecha y espacio de firmas de ambas partes con aclaración y DNI. Devolvé solo el texto del contrato, sin comentarios adicionales.`;
    },
  },

  poder_simple: {
    id: "poder_simple",
    label: "Poder / autorización simple",
    description: "Autorización para que otra persona realice un trámite en tu nombre.",
    priceUsdCents: 200,
    fields: [
      field("otorgante_nombre", "Tu nombre completo (quien otorga el poder)"),
      field("otorgante_dni", "Tu DNI"),
      field("apoderado_nombre", "Nombre completo de la persona autorizada"),
      field("apoderado_dni", "DNI de la persona autorizada"),
      field("alcance_poder", "Para qué trámite específico es la autorización", "textarea"),
      field("vigencia", "Vigencia de la autorización (ej: 30 días, o una fecha)"),
    ],
    buildPrompt(f) {
      return `Redactá un poder/autorización simple en español rioplatense, formal, con estos datos:

Otorgante: ${f.otorgante_nombre}, DNI ${f.otorgante_dni}
Apoderado (persona autorizada): ${f.apoderado_nombre}, DNI ${f.apoderado_dni}
Alcance de la autorización: ${f.alcance_poder}
Vigencia: ${f.vigencia}

El texto debe dejar en claro que el otorgante autoriza expresamente al apoderado a realizar el trámite descripto en su nombre y representación, dentro del plazo de vigencia indicado. Aclará al final que para trámites que requieran poder notarial (ej. venta de inmuebles) esta autorización simple no reemplaza un poder ante escribano. Cerrá con lugar, fecha y espacio de firma del otorgante con aclaración y DNI. Devolvé solo el texto, sin comentarios adicionales.`;
    },
  },

  autorizacion_viaje_menor: {
    id: "autorizacion_viaje_menor",
    label: "Autorización de viaje de menores",
    description: "Autorización para que un menor viaje con otra persona o solo.",
    priceUsdCents: 200,
    fields: [
      field("menor_nombre", "Nombre completo del menor"),
      field("menor_dni", "DNI del menor"),
      field("padre_madre_nombre", "Nombre completo de quien autoriza (padre/madre/tutor)"),
      field("padre_madre_dni", "DNI de quien autoriza"),
      field("acompañante_nombre", "Nombre de quien acompaña al menor (si aplica)", "text", false),
      field("acompañante_dni", "DNI de quien acompaña (si aplica)", "text", false),
      field("destino", "Destino del viaje"),
      field("fecha_viaje", "Fecha de salida", "date"),
      field("fecha_regreso", "Fecha de regreso", "date"),
    ],
    buildPrompt(f) {
      return `Redactá una autorización de viaje para un menor de edad en español rioplatense, formal, con estos datos:

Menor: ${f.menor_nombre}, DNI ${f.menor_dni}
Autoriza: ${f.padre_madre_nombre}, DNI ${f.padre_madre_dni}
Acompañante durante el viaje: ${f.acompañante_nombre || "viaja sin acompañante autorizado, según corresponda"}${f.acompañante_dni ? `, DNI ${f.acompañante_dni}` : ""}
Destino: ${f.destino}
Fecha de salida: ${f.fecha_viaje}
Fecha de regreso: ${f.fecha_regreso}

Incluí una aclaración final de que, para viajes internacionales, este modelo debe certificarse ante escribano público o autoridad migratoria competente, y que los requisitos exactos pueden variar según el destino. Cerrá con lugar, fecha y espacio de firma con aclaración y DNI de quien autoriza. Devolvé solo el texto, sin comentarios adicionales.`;
    },
  },
};

module.exports = templates;
