// Reglas de la capa B (ver piezas.ts): de las piezas de una frase a una o varias FRASES EN LA FORMA DE LA GUÍA,
// ordenadas de la más a la menos probable. El motor las prueba con las plantillas; la primera que calza gana.
// Aquí no se ejecuta nada ni se adivina un monto: el monto sale de las palabras del usuario, tal cual.

import { formatearMonto, normalizar } from "./texto.ts";
import { hallarCategoria, hallarDia, hallarHora, hallarMes, hallarMontos, hallarNombre, hallarPeriodo, hallarTiempo, singular, tokenizar, contiene, type ContextoPiezas, type Monto, type Tok } from "./piezas.ts";

interface C {
  toks: Tok[];
  norma: string;
  palabras: Set<string>;
  montos: Monto[];
  ctx: ContextoPiezas;
  /** Alguna de las palabras (o frases) está en la frase. */
  hay: (...ws: string[]) => boolean;
  /** Las palabras que quedan sin los índices y las palabras de relleno quitados, con las puntas limpias. */
  resto: (quitar: Iterable<number>, relleno: Set<string>) => string;
}

const ARTICULOS = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "por", "para", "con", "a", "al", "y", "mi", "mis", "que", "lo", "se", "me", "es", "son", "fue", "fueron"]);

function armar(frase: string, ctx: ContextoPiezas): C {
  const toks = tokenizar(frase);
  const norma = toks.map((t) => t.n).join(" ");
  const palabras = new Set<string>();
  for (const t of toks) {
    palabras.add(t.n);
    palabras.add(singular(t.n));
  }
  return {
    toks,
    norma,
    palabras,
    montos: hallarMontos(toks),
    ctx,
    hay: (...ws) => ws.some((w) => (w.includes(" ") ? contiene(norma, w) : palabras.has(w))),
    resto: (quitar, relleno) => {
      const fuera = new Set(quitar);
      const quedan = toks.filter((t, i) => !fuera.has(i) && !relleno.has(t.n));
      while (quedan.length && ARTICULOS.has(quedan[0].n)) quedan.shift();
      while (quedan.length && ARTICULOS.has(quedan[quedan.length - 1].n)) quedan.pop();
      return quedan.map((t) => t.o).join(" ");
    },
  };
}

/** Los índices de las palabras de la frase que forman `texto` seguido (una duración, una hora…). */
function indicesDe(c: C, texto: string | null): number[] {
  if (!texto) return [];
  const buscado = normalizar(texto).split(" ");
  const hay = c.toks.map((t) => t.n);
  for (let i = 0; i + buscado.length <= hay.length; i++) {
    if (buscado.every((b, k) => hay[i + k] === b)) return buscado.map((_, k) => i + k);
  }
  return [];
}

const indices = (m: Monto): number[] => Array.from({ length: m.hasta - m.desde + 1 }, (_, k) => m.desde + k);
const PREGUNTAS = ["que", "cual", "cuales", "como", "cuando", "donde", "quien", "cuanto", "cuanta", "cuantos", "cuantas"];

// ———— Gastos y presupuesto ————
const VERBOS_GASTO = new Set(["gaste", "gasto", "gastamos", "pague", "pagamos", "pago", "compre", "compro", "costo", "cuesta", "salio", "salieron", "sale", "fueron", "fue", "puse", "inverti", "cargue", "anotame", "anota", "registra", "registrame", "agrega", "suma", "gasto", "gastos", "pagado", "me", "se", "hoy", "ayer", "un", "una"]);
const OTRAS_AREAS = ["juntar", "ahorrar", "ahorrando", "ahorre", "aparte", "junte", "guarde", "meta", "metas", "presupuesto", "maximo", "mensual", "ramo", "nota", "certamen", "pomodoro", "temporizador", "alarma", "recuerdame", "avisame", "saque", "retire", "ocupe", "estudiar", "estudie", "aprobar", "pasar", "evaluacion", "agenda", "agendame", "reunion", "cita", "evento", "plan", "claude", "tokens", "descargue", "presupuesto"];
const SIN_GASTO = ["necesito", "quiero", "tengo", "debo", "prestadas", "prestado", "prestame", "presta", "dame", "dar", "vale", "valen", "cobran", "cobraron", "cobro", "multa", "deuda", "faltan", "falta", "sobran", "podria", "puedo"];
const INGRESOS = ["pagaron", "gane", "ganamos", "recibi", "deposito", "depositaron", "sueldo", "mesada", "regalaron", "dieron", "transferencia", "prestaron", "cobre", "sueldo", "ingreso"];

function gastos(c: C): string[] {
  const salida: string[] = [];
  const periodo = hallarPeriodo(c.norma);
  const categoria = hallarCategoria(c.norma);
  const hayVerboGasto = c.hay("gaste", "gasto", "gastado", "gastar", "gastos", "gastada", "gastos", "gastaste");
  const interroga = c.hay("cuanto", "cuanta", "total", "en que se me va", "dime", "cuantos");
  const borra = c.hay("borra", "borrar", "elimina", "quita", "deshaz", "anula", "olvida");

  // Borrar el último gasto (una acción: se confirma).
  if (borra && !c.hay("presupuesto", "meta", "ramo", "nota", "pomodoro", "temporizador", "alarma", "recordatorio", "descarga", "evento", "tarea") && c.hay("ultimo", "anterior", "eso", "anote", "anotaste", "equivoque", "acabo") && (c.hay("gasto", "anote", "anotaste", "equivoque", "ultimo", "anterior", "acabo") || c.hay("eso"))) {
    if (c.hay("gasto", "anote", "anotaste", "equivoque", "anterior", "acabo") || (c.hay("ultimo") && !c.hay("pomodoro"))) salida.push("borra el ultimo gasto");
  }

  // Los últimos gastos.
  if (!borra && c.hay("ultimo", "ultimos", "ultimamente", "reciente", "recientes", "recien") && c.hay("gasto", "gastos", "gaste", "comprado", "compre", "anote", "gastado", "comprando", "gastando") && !c.hay("mes", "semana", "presupuesto") && !interroga) {
    salida.push("mis ultimos gastos");
  }

  // Una consulta de lo gastado: no cambia nada, se responde directo.
  if (!borra && c.montos.length === 0 && (interroga || c.hay("gastos", "gastado", "en que gaste", "en que me gaste", "plata gastada", "se me va")) && (hayVerboGasto || c.hay("plata", "dinero", "llevo", "gastos")) && !c.hay("presupuesto", "meta", "metas", "ahorrado", "ahorrando", "ahorro", "ahorros", "estudiado", "estudie", "tokens", "plan", "claude", "queda", "sobra", "alcanza", "puedo", "ritmo", "voy", "cuento", "cuenta", "dispongo")) {
    if (!c.hay("tokens", "claude", "estudiar", "estudiado", "ramo", "ramos", "comunes", "autos", "auto", "iphone", "gastan", "empresa", "precio") && !c.hay("cuantos")) {
      const cat = categoria && c.hay("en", "de", "para") ? ` en ${categoria}` : "";
      if (c.hay("en que se me va", "se me va") && !periodo) salida.push("cuanto he gastado este mes");
      else salida.push(`cuanto he gastado${cat}${periodo ? ` ${periodo}` : ""}`);
    }
  }

  // Anotar un gasto: exactamente un monto (nunca se adivina entre dos).
  if (c.montos.length === 1 && !c.hay(...OTRAS_AREAS) && !c.hay(...INGRESOS) && !interroga) {
    const m = c.montos[0];
    const relleno = new Set([...VERBOS_GASTO, "gasto", "gastos", "pagos", "pasaje", "hoy", "ayer", "con", "unos", "unas"]);
    relleno.delete("pasaje");
    const cosa = c.resto(indices(m), new Set([...VERBOS_GASTO].filter((v) => !["un", "una"].includes(v))));
    const otros = c.toks.filter((_, i) => i < m.desde || i > m.hasta).length;
    const sinMonto = c.toks.filter((t, i) => (i < m.desde || i > m.hasta) && !ARTICULOS.has(t.n) && !VERBOS_GASTO.has(t.n));
    const hayVerbo = c.hay("gaste", "gasto", "pague", "pagamos", "compre", "costo", "salio", "salieron", "fueron", "puse", "inverti", "cargue", "anotame", "anota", "registra", "gastamos", "gastado", "pagado", "agrega", "suma", "invirtio");
    const preguntaCosa = c.hay(...PREGUNTAS);
    // Con verbo de gasto, o una frase corta de la forma «almuerzo 5 lucas».
    if (!preguntaCosa && (hayVerbo || (otros >= 1 && otros <= 6 && sinMonto.length >= 1 && sinMonto.length <= 3 && !c.hay(...SIN_GASTO)))) {
      salida.push(cosa ? `gaste ${m.texto} en ${cosa}` : `gaste ${m.texto}`);
    }
  }

  // Presupuesto (acción: cambia el presupuesto, se confirma).
  const habla = c.hay("presupuesto", "presupuestos") || (c.hay("tope", "limite") && c.hay("mensual", "mes", "al mes", "de gasto"));
  const puedeGastar = c.hay("puedo gastar", "gastar maximo", "maximo para gastar", "tope de gasto");
  if (c.montos.length === 1 && !c.hay("meta", "metas", "juntar", "ahorrar") && !interroga && !c.hay("empresa", "gobierno", "pais", "compania", "colegio", "municipalidad", "universidad", "ministerio", "gastar en")) {
    const m = c.montos[0];
    if (habla && (c.hay("mi", "mio", "tengo", "quiero", "pon", "ponme", "fija", "fijame", "deja", "dejame", "cambia", "define", "es", "son", "sera", "queda", "mensual", "al mes") ) && !c.hay("quita", "quitar", "elimina", "borra", "saca")) {
      salida.unshift(`mi presupuesto es ${m.texto}`);
    } else if (puedeGastar && c.hay("mes", "mensual", "al mes", "este mes")) salida.unshift(`mi presupuesto es ${m.texto}`);
  }
  const SOLO_QUITAR = new Set(["quita", "quitar", "elimina", "eliminar", "saca", "sacar", "borra", "borrar", "cancela", "sin", "no", "quiero", "ya", "mi", "el", "presupuesto", "por", "favor", "mas", "necesito", "deja", "de", "lo", "la", "mis"]);
  const SOLO_CONSULTA = new Set(["cuanto", "cuanta", "me", "queda", "sobra", "del", "de", "mi", "el", "presupuesto", "como", "voy", "con", "va", "que", "tal", "este", "mes", "ver", "muestrame", "dame", "falta", "estoy", "bien", "tan", "ando", "cual", "es", "esta", "estamos", "vamos", "mensual", "en", "para", "te", "dime", "dices", "mal", "quedan", "tengo"]);
  if (habla && c.montos.length === 0) {
    if (c.toks.every((t) => SOLO_QUITAR.has(t.n)) && c.hay("quita", "quitar", "elimina", "eliminar", "saca", "sacar", "borra", "borrar", "cancela", "sin", "no quiero", "ya no")) salida.unshift("quita mi presupuesto");
    else if (c.toks.length <= 8 && c.hay("mi", "el", "me", "voy", "va") && c.toks.every((t) => SOLO_CONSULTA.has(t.n) || t.n === "presupuesto")) salida.push("cuanto me queda del presupuesto");
    else if (c.toks.length === 1) salida.push("cuanto me queda del presupuesto");
  }
  if (!habla && c.montos.length === 0 && !c.hay("meta", "metas", "ahorro", "ahorros", "estudiado", "claude", "tokens")) {
    // «cuánta plata me queda este mes», «me alcanza la plata», «cuánto me sobra del mes».
    if (c.hay("queda", "sobra", "alcanza", "sobrando") && c.hay("plata", "mes", "dinero", "del mes", "este mes") && !c.hay("hoy", "tiempo", "bateria", "espacio", "disco", "pomodoro", "descanso", "plan", "claude")) salida.push("cuanto me queda del presupuesto");
    if (c.hay("cuento", "dispongo", "tengo") && c.hay("hoy") && c.hay("plata", "dinero", "cuanta", "cuanto") && c.toks.length <= 8) salida.push("cuanto puedo gastar hoy");
    if (c.hay("puedo gastar", "me queda para gastar", "me alcanza para hoy", "puedo gastarme", "me queda para") && (c.hay("hoy", "gastar") || c.hay("alcanza")) && !c.hay("mes", "semana")) salida.push("cuanto puedo gastar hoy");
    if (c.hay("ritmo", "terminar gastando", "voy a gastar", "voy gastando", "estoy gastando", "me voy a gastar") || (c.hay("como voy", "como vamos") && c.hay("plata", "gastos", "este mes", "mes", "con la plata"))) salida.push(c.hay("ritmo") ? "a que ritmo gasto" : "como voy este mes");
  }
  return salida;
}

/**
 * Dos montos en una frase de gasto («gasté 5 lucas y 3 mil en el almuerzo»): una frase por monto para que el usuario elija.
 * Solo con verbo de gasto y sin palabras de otras áreas: nunca adivina cuál es.
 */
export function montosAmbiguos(frase: string): { etiqueta: string; frase: string }[] | null {
  const c = armar(frase, { ramos: [], metas: [] });
  if (c.montos.length !== 2 || c.montos[0].valor === c.montos[1].valor) return null;
  if (c.hay(...OTRAS_AREAS) || c.hay(...INGRESOS) || c.hay(...SIN_GASTO) || c.hay(...PREGUNTAS)) return null;
  if (!c.hay("gaste", "gasto", "pague", "compre", "costo", "puse", "gastamos", "pagamos", "cargue", "inverti")) return null;
  const cosa = c.resto([...indices(c.montos[0]), ...indices(c.montos[1])], new Set([...VERBOS_GASTO, "gasto", "y", "e", "o", "mas", "ademas", "total"].filter((v) => !["un", "una"].includes(v))));
  return c.montos.map((m) => ({ etiqueta: `${formatearMonto(m.valor)}${cosa ? ` en ${cosa}` : ""}`, frase: cosa ? `gaste ${m.texto} en ${cosa}` : `gaste ${m.texto}` }));
}

// ———— Aula ————
function aula(c: C): string[] {
  const entregable = c.hay("entrega", "entregas", "entregar", "tarea", "tareas", "trabajo", "trabajos", "informe", "informes", "atrasado", "atrasada", "atrasados", "pendiente", "pendientes");
  if (!entregable || c.hay("domestica", "domesticas", "casa", "hogar", "aseo", "crear", "agrega", "ramo", "nota", "mes", "plata", "gastos")) return [];
  if (c.hay("crear", "agrega", "anota", "pon")) return [];
  const pregunta = c.hay("tengo", "tenemos", "hay", "falta", "queda", "pendiente", "pendientes", "atrasado", "atrasada", "atrasados", "proxima", "proximo", "siguiente", "cual", "cuales", "que", "se entrega", "entregar", "mis");
  if (!pregunta) return [];
  return [c.hay("esta semana", "semana") ? "que entregas tengo esta semana" : "que entregas tengo"];
}

// ———— Calendario ————
const EVENTOS = ["reunion", "cita", "evento", "clase", "prueba", "dentista", "medico", "doctor", "ayudantia", "charla", "entrevista", "control", "examen", "taller", "cumpleanos"];
const VERBOS_CREAR = new Set(["agenda", "agendame", "agendar", "anota", "anotame", "pon", "ponme", "crea", "creame", "agrega", "agregame", "programa", "tengo", "hay", "tenemos", "hoy", "manana"]);

function calendario(c: C): string[] {
  const salida: string[] = [];
  const hora = hallarHora(c.norma);
  const tiempo = hora ? null : c.hay("en", "dentro") ? hallarTiempo(c.toks.map((t) => t.o).join(" ")) : null;
  const evento = c.hay(...EVENTOS);
  const verbo = c.hay("agenda", "agendame", "agendar", "anota", "anotame", "pon", "ponme", "crea", "creame", "programa", "agrega", "agregame");
  const manana = c.toks.some((t, i) => t.n === "manana" && c.toks[i - 1]?.n !== "la");
  if ((hora || tiempo) && (evento || c.hay("agenda", "agendame", "agendar", "calendario")) && !c.hay("pomodoro", "musica", "estudiar", "temporizador", "alarma", "recuerdame", "avisame") ) {
    const relleno = new Set(VERBOS_CREAR);
    const quitar: number[] = [...indicesDe(c, tiempo), ...indicesDe(c, hora)];
    const idxHora = indicesDe(c, hora)[0];
    if (idxHora !== undefined) quitar.push(idxHora - 1, idxHora - 2);
    // «en 2 horas», «dentro de 2 horas», «en mi calendario»: las palabras de unión también se van.
    const idxTiempo = indicesDe(c, tiempo)[0];
    if (idxTiempo !== undefined) quitar.push(idxTiempo - 1, ...(c.toks[idxTiempo - 1]?.n === "de" && c.toks[idxTiempo - 2]?.n === "dentro" ? [idxTiempo - 2] : []));
    for (const f of ["en mi calendario", "en el calendario", "al calendario", "en mi agenda", "en la agenda"]) quitar.push(...indicesDe(c, f));
    // Un día de la semana o una fecha: «tengo prueba de física el viernes a las 9».
    const dia = hora ? hallarDia(c.norma) : null;
    const idxDia = indicesDe(c, dia);
    if (idxDia.length > 0) quitar.push(...idxDia, ...(c.toks[idxDia[0] - 1]?.n === "el" ? [idxDia[0] - 1] : []));
    const titulo = c.resto(quitar, relleno);
    const horaFrase = hora;
    if (titulo) {
      if (hora && dia) salida.push(`agenda ${titulo} el ${dia} a las ${horaFrase}`);
      else if (hora) salida.push(manana ? `anota en el calendario ${titulo} manana a las ${horaFrase}` : `anota en el calendario ${titulo} a las ${horaFrase}`);
      else if (tiempo) salida.push(`anota en el calendario ${titulo} en ${tiempo}`);
    }
  }
  if (c.hay("proxima", "proximo", "siguiente", "sigue", "viene") && c.hay("clase", "reunion", "evento", "prueba", "actividad", "ayudantia", "cita", "ahora") && !c.hay("cancion", "tema", "musica", "pregunta")) {
    salida.push(c.hay("ahora") ? "que viene ahora" : "cual es mi proxima clase");
  } else if (c.hay("agenda", "calendario") && c.hay("sigue", "viene", "siguiente", "proximo") && c.toks.length <= 6) salida.push("que viene ahora");
  else if ((c.norma === "que viene" || c.norma === "que sigue" || c.norma === "que viene ahora" || c.norma === "que sigue ahora") ) salida.push("que viene ahora");
  else if (c.norma === "proxima clase" || c.norma === "siguiente clase") salida.push("cual es mi proxima clase");
  const tengo = c.hay("tengo", "hay", "agenda", "calendario", "actividades", "actividad", "clases", "clase", "reunion", "reuniones", "prueba", "pruebas", "eventos", "evento", "horario", "entro", "salgo", "tenemos");
  if (tengo && !hora && !tiempo && !c.hay("no", "nada", "ganas", "quiero", "puedo", "ni") && !c.hay("tareas", "tarea", "entregas", "entrega", "entregar", "plata", "gastos", "estudiar", "estudio", "tarjetas", "ramo", "ramos", "descargas", "musica")) {
    const dicha = c.hay("hago", "hacer", "debo", "deberia", "viernes", "lunes", "martes", "miercoles", "jueves", "sabado", "domingo");
    if (!dicha && c.hay("hoy", "hoy dia")) salida.push("que tengo hoy");
    else if (!dicha && manana) salida.push("que tengo manana");
  }
  return salida;
}

function normalizarHora(n: string, hora: string): boolean {
  return hora.startsWith(n) || n.startsWith(hora.split(/[:.\s]/)[0]);
}

// ———— Estudio y ramos ————
const EVALUACIONES = ["certamen", "control", "prueba", "examen", "tarea", "solemne", "test", "quiz", "informe", "laboratorio", "parcial", "interrogacion", "ayudantia", "trabajo"];

function estudio(c: C): string[] {
  const salida: string[] = [];
  const ramo = hallarNombre(c.norma, c.ctx.ramos);
  const tiempoTexto = hallarTiempo(c.toks.map((t) => t.o).join(" "));
  const ya = c.hay("ya no tengo", "ya no curso", "deje", "retire", "no curso");

  // Ramos.
  if (c.hay("ramo", "ramos") && !c.hay("cuantos", "tiene", "tienen", "carrera")) {
    if (c.hay("agrega", "agregar", "crea", "inscribi", "inscrito", "inscribir", "nuevo", "anade", "suma", "tengo", "anota") && !c.hay("mis", "cuales", "que ramos", "lista")) {
      const i = c.toks.findIndex((t) => t.n === "ramo" || t.n === "ramos");
      const nombre = c.toks.slice(i + 1).filter((t) => !["nuevo", "nueva", "de", "llamado", "el", "un", "mi", "otro"].includes(t.n)).map((t) => t.o).join(" ");
      if (nombre) salida.push(`agrega el ramo ${nombre}`);
    }
    if (c.hay("mis", "cuales", "que ramos", "lista", "ver", "muestrame", "todos", "dame") && !c.hay("agrega", "quita")) salida.push("mis ramos");
  }
  if (ramo && ya && !c.hay("tarjetas", "estudiar")) salida.push(`quita el ramo ${ramo}`);

  // Notas: una nota de 1 a 7 y un ramo (o una evaluación).
  const nota = c.toks.find((t) => /^[1-7](?:[.,]\d{1,2})?$/.test(t.n) && !/^[1-7]$/.test(t.n) || (/^[1-7]$/.test(t.n) && c.hay("saque", "nota", "obtuve", "tuve", "fue", "bien", "mal", "un")));
  const eval_ = c.toks.findIndex((t) => EVALUACIONES.includes(t.n));
  if (nota && (ramo || eval_ >= 0) && c.hay("saque", "nota", "obtuve", "tuve", "fue", "fui", "bien", "mal", "con", "un") && !c.hay("porcentaje", "equivale", "es en", "necesito", "falta", "cuanto", "cuantas") && !c.hay("lucas", "mil", "palo")) {
    const notaTexto = nota.o;
    let cosa: string | null = null;
    if (eval_ >= 0) {
      const sig = c.toks[eval_ + 1] && /^\d$/.test(c.toks[eval_ + 1].n) ? ` ${c.toks[eval_ + 1].o}` : "";
      cosa = `el ${c.toks[eval_].o}${sig}${ramo ? ` de ${ramo}` : ""}`;
    } else if (ramo) cosa = ramo;
    if (cosa) salida.push(`me saque ${notaTexto} en ${cosa}`);
  }

  // Cómo voy / lo que necesito.
  if (ramo && c.hay("necesito", "falta", "sacar", "sacarme", "tengo que sacarme", "debo sacar") && c.hay("aprobar", "pasar", "nota", "pasarlo", "aprobarlo", "sacarme")) salida.push(`cuanto necesito para aprobar ${ramo}`);
  if (ramo && c.hay("voy", "va", "promedio", "llevo", "yendo", "aprobando", "reprobando", "estoy", "ando") && !c.hay("pomodoro", "estudiar") && !c.hay("necesito", "falta")) salida.push(`como voy en ${ramo}`);
  if (!ramo && c.hay("promedio", "promedios", "notas") && c.hay("mi", "mis")) salida.push("mis notas");

  // Repaso.
  if (c.hay("tarjetas", "tarjeta", "repaso") && c.hay("hay", "tengo", "toca", "tocan", "algo", "pendientes", "cuantas") && !c.hay("credito", "debito")) salida.push("tengo tarjetas para repasar");
  const palabrasRepaso = new Set(["quiero", "repasar", "repasemos", "vamos", "a", "empecemos", "empieza", "hagamos", "un", "el", "mi", "repaso", "ya", "ahora", "de", "del", "la", "por", "favor", "hoy", ...(ramo ?? "").split(" ")]);
  if (c.hay("repasar", "repasemos", "repaso") && c.hay("quiero", "repasemos", "vamos", "empecemos", "empieza", "hagamos", "repasar") && !c.hay("tarjetas") && c.toks.every((t) => palabrasRepaso.has(t.n))) salida.push(ramo ? `repasemos ${ramo}` : "quiero repasar");
  if (/^(mis )?tarjetas( de repaso| para repasar)?$/.test(c.norma)) salida.push("tengo tarjetas para repasar");

  // Qué estudiar hoy, horas estudiadas, racha, anotar horas.
  if (c.toks[0]?.n === "que" && c.hay("estudio", "estudiar", "estudiare", "debo estudiar", "toca estudiar") && !tiempoTexto) salida.push("que tengo que estudiar hoy");
  if (c.hay("racha") ) salida.push("mi racha");
  else if (c.hay("seguidos") && c.hay("estudiando", "estudiado", "estudie")) salida.push("cuantos dias seguidos llevo estudiando");
  if (c.hay("cuanto", "cuantas", "cuanta") && c.hay("estudiado", "estudie", "estudiando", "horas") && c.hay("estudiado", "estudie", "estudiando")) {
    const p = hallarPeriodo(c.norma);
    salida.push(`cuanto he estudiado${ramo ? ` de ${ramo}` : ""}${p ? ` ${p}` : ""}`);
  }
  if (c.hay("estudie") && tiempoTexto) salida.push(`estudie ${tiempoTexto}${ramo ? ` de ${ramo}` : ""}${c.hay("ayer") ? " ayer" : ""}`);

  // Todo lo de un ramo.
  if (ramo && c.toks.length <= 6 && !/\d/.test(c.norma) && c.hay("de", "del", "sobre") && c.hay("todo", "lo de", "lo del", "muestrame", "dame", "dime", "que tengo", "ver") && !c.hay("tarjetas", "repasar", "estudiar", "voy", "nota", "necesito", "tengo prueba") && !nota) salida.push(`todo lo de ${ramo}`);
  return salida;
}

// ———— Ahorro ————
function ahorro(c: C): string[] {
  const salida: string[] = [];
  const meta = hallarNombre(c.norma, c.ctx.metas);
  const mes = hallarMes(c.norma);
  const m = c.montos.length === 1 ? c.montos[0] : null;
  const cosaTexto = (m: Monto | null): string => {
    const relleno = new Set(["meta", "metas", "de", "del", "para", "la", "el", "lo", "mi", "mis", "ahorrado", "ahorre", "aparte", "guarde", "junte", "meti", "puse", "saque", "retire", "use", "ocupe", "ahorro", "ahorros", "quiero", "necesito", "voy", "a", "juntar", "ahorrar", "en", "hoy", "con", "ahorrando", "estoy", "es", "me", "gustaria", "un", "una"]);
    if (mes) relleno.add(mes);
    return c.resto(m ? indices(m) : [], relleno);
  };
  const querer = c.hay("necesito", "quiero") && c.hay("para") && !c.hay("prestada", "prestadas", "prestado", "prestados", "prestame", "deuda");
  if (m && (c.hay("juntar", "ahorrar", "meta", "ahorrando") || querer) && !c.hay("aparte", "guarde", "junte", "ahorre", "meti", "puse", "saque", "retire") && !c.hay("gaste", "presupuesto") && !c.hay("estudiar")) {
    const cosa = meta ?? cosaTexto(m);
    salida.push(`quiero juntar ${m.texto}${mes ? ` para ${mes}` : ""}${cosa ? ` para ${cosa}` : ""}`);
  }
  if (m && c.hay("saque", "retire", "use", "ocupe") && c.hay("meta", "ahorrado", "ahorro", "ahorros") ) {
    const cosa = meta ?? cosaTexto(m);
    if (cosa) salida.push(`saque ${m.texto} de la meta de ${cosa}`);
  }
  if (m && c.hay("aparte", "guarde", "junte", "ahorre", "meti", "puse", "ahorrado") && (c.hay("meta", "metas", "ahorro", "ahorros", "ahorre", "aparte", "junte", "ahorrado") || meta)) {
    const cosa = meta ?? cosaTexto(m);
    salida.push(cosa ? `aparte ${m.texto} para la meta de ${cosa}` : `aparte ${m.texto}`);
  }
  if (!m && c.hay("borra", "elimina", "quita", "cancela", "archiva", "ya no quiero", "ya no") && c.hay("meta") ) {
    const cosa = meta ?? cosaTexto(null);
    if (cosa) salida.push(`borra la meta de ${cosa}`);
  }
  if (!m && (c.hay("metas", "ahorros", "ahorrado", "ahorrando") || (c.hay("meta") && c.hay("como voy", "como van", "falta"))) && c.hay("mis", "cuanto", "como", "cuanta", "llevo", "falta", "ver", "muestrame") && !c.hay("borra", "elimina", "quita", "cancela", "abuela", "luz", "ahorrar") && !c.hay("gastado")) {
    if (meta && c.hay("falta", "voy", "llevo", "como")) salida.push(`como voy con la meta de ${meta}`);
    else salida.push("como van mis metas de ahorro");
  }
  if (!m && meta && c.hay("falta") && c.hay("cuanto")) salida.unshift(`cuanto me falta para la meta de ${meta}`);
  return salida;
}

// ———— Pomodoro y temporizadores ————
function pomodoro(c: C): string[] {
  const salida: string[] = [];
  const tiempo = hallarTiempo(c.toks.map((t) => t.o).join(" "));
  const ramo = hallarNombre(c.norma, c.ctx.ramos);
  const pregunta = c.hay("falta", "queda");
  const cancela = !pregunta && (c.toks[0]?.n === "para" || c.hay("deten", "cancela", "apaga", "quita", "termina", "detener", "parar", "cancelar", "apagar", "ya no quiero"));
  const informa = c.hay("metodo", "tecnica", "significa", "sirve", "funciona", "que es", "como se", "tomate", "salsa", "receta");
  if (c.hay("pomodoro") && cancela && !informa) salida.push("para el pomodoro");
  else if (cancela && c.hay("temporizador", "temporizadores", "timer", "alarma", "alarmas", "recordatorio", "recordatorios") && !c.hay("tiempo", "para dentro", "dentro")) {
    const w = ["temporizadores", "temporizador", "timer", "alarmas", "alarma", "recordatorios", "recordatorio"].find((x) => c.palabras.has(x))!;
    salida.push(`cancela ${/s$/.test(w) ? "los" : "el"} ${w}`);
  }
  if (!cancela && !informa && !c.hay("recuerdame", "avisame", "alarma", "temporizador", "timer", "cuenta", "cronometro")) {
    if (c.hay("pomodoro") && c.toks.length <= 8 && !pregunta) {
      const cosa = ramo ?? "";
      salida.push(`pomodoro${tiempo ? ` de ${tiempo}` : ""}${cosa ? ` para ${cosa}` : ""}`);
    } else if (tiempo && c.hay("estudiar", "estudiemos", "estudio") && !c.hay("estudie") && c.toks[0]?.n !== "que") {
      salida.push(`pomodoro de ${tiempo}${ramo ? ` para ${ramo}` : ""}`);
    } else if (c.hay("empecemos a estudiar", "vamos a estudiar", "a estudiar") && !tiempo) salida.push(ramo ? `pomodoro para ${ramo}` : "pomodoro");
  }
  if (tiempo && !informa) {
    if (c.hay("recuerdame", "avisame", "recordarme", "recuerda")) {
      const quitar = [...indicesDe(c, tiempo)];
      c.toks.forEach((t, i) => {
        if (["recuerdame", "avisame", "recordarme", "recuerda", "en", "dentro", "de"].includes(t.n)) quitar.push(i);
      });
      const cosa = c.resto(quitar, new Set(["que", "para", "a"]));
      salida.push(cosa ? `recuerdame en ${tiempo} ${cosa}` : `temporizador de ${tiempo}`);
    } else if (c.hay("alarma", "temporizador", "timer", "cuenta", "cronometro", "cuenta regresiva")) salida.push(`temporizador de ${tiempo}`);
  }
  const tiempoPregunta = c.hay("falta", "queda") && c.hay("pomodoro", "temporizador", "timer", "descanso", "recordatorio", "alarma");
  if (tiempoPregunta || c.norma === "cuanto tiempo falta" || c.norma === "cuanto tiempo queda" || c.norma === "cuanto tiempo me queda") salida.push("cuanto falta");
  if (c.hay("temporizadores", "recordatorios", "alarmas") && c.hay("que", "cuales", "mis", "tengo") && !cancela) salida.push("mis temporizadores");
  return salida;
}

// ———— Música ————
function musica(c: C): string[] {
  const salida: string[] = [];
  const habla = c.hay("musica", "cancion", "canciones", "tema", "temas", "spotify", "cancionero");
  const uno = c.toks.length === 1 ? c.toks[0].n : "";
  if (uno === "siguiente" || uno === "proxima" || uno === "proximo" || uno === "next") return ["pon la siguiente cancion"];
  if (uno === "anterior") return ["pon la cancion anterior"];
  if (c.hay("play") && c.toks.length <= 3) return ["pon la musica"];
  if (c.hay("que sigue", "la que sigue", "a la que sigue") && c.hay("pon", "ponme", "pasa", "dale") && c.toks.length <= 5) return ["pon la siguiente cancion"];
  if (!habla && !c.hay("sonando", "suena", "canta", "escuchando", "a la que sigue")) return salida;
  if (c.hay("recomiendame", "recomienda", "compuso", "compositor", "me gusta", "gusta", "triste", "alegre", "cual es la mejor", "letra")) return salida;
  if (c.hay("pausa", "pausar", "deten", "detener", "silencio", "calla", "apaga", "para", "parar", "detenga") && habla) salida.push("pausa la musica");
  else if (c.hay("sigue", "reanuda", "continua", "play", "reproduce", "reanudar", "vuelve a poner") && habla) salida.push("pon la musica");
  if (c.hay("siguiente", "proxima", "salta", "cambia", "pasa", "otra", "adelanta", "a la que sigue") && (habla || c.hay("a la que sigue"))) salida.push("pon la siguiente cancion");
  if (c.hay("anterior", "antes", "atras") && habla) salida.push("pon la cancion anterior");
  const preguntaMusica = PREGUNTAS.includes(c.toks[0]?.n ?? "");
  if (preguntaMusica && (c.hay("sonando", "suena", "canta", "escuchando")) || (c.hay("llama") && c.hay("esta")) || (c.hay("como", "cual", "que") && c.hay("cancion", "tema") && c.hay("esta", "esto"))) {
    if (c.hay("quien") || c.hay("canta")) salida.push("quien canta");
    else if (c.hay("suena", "sonando")) salida.push("que esta sonando");
    else salida.push("que cancion es esta");
  }
  return salida;
}

// ———— Computador, descargas, memoria y plan ————
function sistema(c: C): string[] {
  const salida: string[] = [];
  const equipo = c.hay("computador", "computadora", "compu", "pc", "notebook", "mac", "equipo", "laptop");
  const ajeno = c.hay("celular", "telefono", "iphone", "auto", "moto", "emocional", "control", "reloj", "recomiendas", "comprar", "comprarme", "formatea", "formatear", "formateo", "cuanto cuesta", "luna", "tierra", "entre");
  if (!ajeno) {
    if (c.hay("bateria") && (c.hay("cuanta", "queda", "tengo", "poca", "baja", "tiene", "me queda", "estado", "cuanto") || c.toks.length === 1)) salida.push("cuanta bateria me queda");
    if (c.hay("espacio", "disco") && (c.hay("queda", "tengo", "libre", "hay", "cuanto", "cuanta")) && (c.hay("disco") || equipo)) salida.push("cuanto espacio me queda");
    if (equipo && c.hay("mi", "el", "la") && c.hay("va", "anda", "esta", "tal", "estado", "lento", "calentando", "calienta", "caliente", "como", "cómo") ) salida.push("como esta el computador");
    if (c.hay("calentando", "calienta", "calientan", "lento", "lenta") && equipo) salida.unshift("como esta el computador");
  }
  const pasadoDescarga = c.hay("descargue", "descargado", "baje", "bajado", "bajaste", "descargaste", "acabo de descargar", "descargados", "descargadas");
  if (c.hay("descargas") && !c.hay("como", "programa") ) salida.push("mis descargas");
  if (pasadoDescarga && c.hay("abre", "abreme", "abrir", "abri")) salida.push("abre la ultima descarga");
  else if (pasadoDescarga && c.hay("donde", "muestrame", "ensename", "quedo") ) salida.push("muestrame la ultima descarga");
  else if (pasadoDescarga && c.hay("que", "lo ultimo", "archivos", "hoy", "ultimo", "ultima", "he") && !c.hay("de la", "reunion")) salida.push(c.hay("hoy") ? "que descargue hoy" : "que descargue");
  if (c.hay("abre", "abreme", "abrir") && c.hay("descarga") && c.hay("ultima", "ultimo")) salida.push("abre la ultima descarga");
  if (["que", "dime", "muestrame", "cuentame", "cual"].includes(c.toks[0]?.n ?? "") && c.hay("sabes", "recuerdas") && c.hay("de mi", "sobre mi", "acerca de mi") && c.toks.length <= 6) salida.push("que sabes de mi");
  if (c.hay("tienes") && c.hay("guardado", "datos") && c.hay("mi", "mios", "mias", "de mi")) salida.push("que sabes de mi");
  if (c.hay("muestrame", "ver", "abre") && c.hay("memoria") && c.hay("tu")) salida.push("que sabes de mi");
  const claude = c.hay("claude");
  const planMio = c.hay("mi plan", "del plan", "mi limite", "el limite", "de mi plan");
  if ((claude || planMio) && !c.hay("estudios", "estudio", "carrera", "universidad", "fin de semana", "que es")) {
    if (c.hay("reinicia", "renueva", "resetea", "reset", "vence", "reinicio", "reinician")) salida.push("cuando se reinicia mi plan");
    else if (c.hay("cuanto", "queda", "llevo", "uso", "usado", "me queda", "cuanta", "tengo") ) salida.push("cuanto llevo del plan");
  }
  if (c.hay("tokens") && c.hay("cuantos", "cuanto", "uso", "usado", "gastado")) salida.push("cuantos tokens he usado");
  return salida;
}

// ———— Frase aproximada ————
/** Las frases en la forma de la guía que podrían querer decir lo mismo, de la más a la menos probable. */
export function proponer(frase: string, ctx: ContextoPiezas): string[] {
  const c = armar(frase, ctx);
  if (c.toks.length === 0 || c.toks.length > 24) return [];
  const todas = [...gastos(c), ...aula(c), ...calendario(c), ...estudio(c), ...ahorro(c), ...pomodoro(c), ...musica(c), ...sistema(c)];
  return [...new Set(todas)];
}
