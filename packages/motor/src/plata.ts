// La pestaña Plata: cálculos puros sobre los gastos (este mes contra el mes pasado a la misma altura,
// cuánto puedes gastar hoy con el presupuesto, los últimos 7 días, las categorías, lo más frecuente y
// un "descubrimiento" sin IA). Sin imports de Node: también lo usan las ventanas.

import { CATEGORIAS, COLOR_CATEGORIA, EMOJI_CATEGORIA, type Categoria } from "./categorias.ts";
import { formatearMonto, normalizar } from "./texto.ts";

/** Un gasto tal como lo necesitan los cálculos (la fecha en ms). */
export interface GastoPlano {
  id: number;
  monto: number;
  categoria: Categoria;
  descripcion: string | null;
  fechaMs: number;
}

export type ColorPlata = "verde" | "ambar" | "rojo";

export interface PresupuestoMes {
  monto: number;
  gastado: number;
  /** Lo que queda del mes (negativo si se pasó). */
  queda: number;
  porcentaje: number;
  /** Días que faltan contando hoy. */
  diasQuedan: number;
  /** Lo que tocaba por día desde el comienzo de hoy: (presupuesto − lo gastado antes de hoy) ÷ días que faltan. */
  porDia: number;
  /** Lo que puedes gastar hoy: `porDia` menos lo gastado hoy (negativo si te pasaste). */
  puedesHoy: number;
  color: ColorPlata;
}

export interface DiaPlata {
  /** "L", "M", "M", "J", "V", "S", "D". */
  letra: string;
  inicioMs: number;
  total: number;
  hoy: boolean;
}

export interface CategoriaPlata {
  categoria: Categoria;
  emoji: string;
  color: string;
  total: number;
  /** Del total del mes, entre 0 y 1. */
  fraccion: number;
}

export interface MovimientoPlata {
  id: number;
  emoji: string;
  descripcion: string;
  categoria: Categoria;
  monto: number;
  fechaMs: number;
}

export interface FrecuentePlata {
  descripcion: string;
  monto: number;
  emoji: string;
  veces: number;
}

export interface Descubrimiento {
  tipo: "disparada" | "hormiga" | "repetido";
  texto: string;
}

export interface MesPlata {
  /** "2026-10". */
  clave: string;
  /** "oct". */
  corto: string;
  nombre: string;
  total: number;
  /** El mes en curso: todavía no termina. */
  parcial: boolean;
  /** Dónde más se gastó ese mes (nulo si no hubo gastos). */
  mayor: { categoria: Categoria; emoji: string; total: number } | null;
}

export interface ProyeccionMes {
  /** "pronto" = antes del día 5, con tan pocos datos no se proyecta. */
  estado: "pronto" | "ok";
  /** Gasto por día del ritmo (sin el gasto único dominante). */
  ritmoDia: number;
  /** Lo que habrás gastado al terminar el mes si sigues así. */
  proyectado: number;
  /** El gasto único que pesa más de la mitad del mes: se deja fuera del ritmo y se suma una sola vez. */
  excluido: { monto: number; descripcion: string } | null;
  /** Contra el presupuesto: positivo = te pasarías, negativo = te sobrarían. */
  diferencia: number | null;
  color: ColorPlata | null;
}

export interface EstadoPlata {
  mes: { total: number; cantidad: number; mesPasado: number; variacion: number | null; nombre: string };
  hoy: number;
  presupuesto: PresupuestoMes | null;
  semana: DiaPlata[];
  categorias: CategoriaPlata[];
  ultimos: MovimientoPlata[];
  frecuentes: FrecuentePlata[];
  descubrimiento: Descubrimiento | null;
  /** Los últimos 6 meses (el último es el actual). */
  meses: MesPlata[];
  proyeccion: ProyeccionMes;
}

const DIA = 86_400_000;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const LETRAS = ["D", "L", "M", "M", "J", "V", "S"];

/** Cuántos días de gastos necesita `resumenPlata` (seis meses para la tendencia; de ellos solo tres los usa lo que se repite cada mes). */
export const DIAS_PLATA = 190;
/** Cuántos meses dibuja la tendencia y desde qué día del mes se proyecta. */
export const MESES_TENDENCIA = 6;
export const DIA_MINIMO_PROYECCION = 5;
/** Cuántos movimientos y botones de un toque se muestran. */
export const ULTIMOS_PLATA = 5;
export const FRECUENTES_PLATA = 3;
/** Un gasto hormiga: chico y repetido. */
export const HORMIGA = { maximo: 3000, veces: 4, suma: 8000 } as const;

function inicioDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

function inicioMes(ms: number, meses = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + meses, 1).getTime();
}

function diasDelMes(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function suma(lista: readonly GastoPlano[], desde: number, hasta: number, filtro: (g: GastoPlano) => boolean = () => true): number {
  return lista.reduce((t, g) => (g.fechaMs >= desde && g.fechaMs < hasta && filtro(g) ? t + g.monto : t), 0);
}

/** El mismo momento del mes pasado ("a la misma altura"); si el mes pasado era más corto, su último día. */
export function mismaAlturaMesPasado(ahoraMs: number): number {
  const d = new Date(ahoraMs);
  const dias = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
  const fecha = new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), dias), d.getHours(), d.getMinutes(), d.getSeconds());
  return Math.min(fecha.getTime(), inicioMes(ahoraMs));
}

/** Cuánto se puede gastar hoy con un presupuesto mensual, y de qué color se muestra. */
export function presupuestoDelMes(monto: number, gastadoMes: number, gastadoHoy: number, ahoraMs: number): PresupuestoMes {
  const total = diasDelMes(ahoraMs);
  const diasQuedan = total - new Date(ahoraMs).getDate() + 1;
  const antesDeHoy = gastadoMes - gastadoHoy;
  const porDia = Math.max(0, monto - antesDeHoy) / diasQuedan;
  const puedesHoy = porDia - gastadoHoy;
  const queda = monto - gastadoMes;
  const cuota = monto / total;
  const color: ColorPlata = queda <= 0 || puedesHoy < 0 ? "rojo" : puedesHoy < cuota * 0.5 ? "ambar" : "verde";
  return {
    monto,
    gastado: gastadoMes,
    queda,
    porcentaje: Math.round((gastadoMes / monto) * 100),
    diasQuedan,
    porDia: Math.round(porDia),
    puedesHoy: Math.round(puedesHoy),
    color,
  };
}

/** Las barras de los últimos 7 días (el último es hoy). */
export function ultimosSieteDias(lista: readonly GastoPlano[], ahoraMs: number): DiaPlata[] {
  const dias: DiaPlata[] = [];
  for (let i = -6; i <= 0; i++) {
    const inicioMs = inicioDia(ahoraMs, i);
    dias.push({ letra: LETRAS[new Date(inicioMs).getDay()], inicioMs, total: suma(lista, inicioMs, inicioDia(ahoraMs, i + 1)), hoy: i === 0 });
  }
  return dias;
}

/** Lo gastado este mes por categoría, de la que más a la que menos (sin las vacías). */
export function categoriasDelMes(lista: readonly GastoPlano[], ahoraMs: number): CategoriaPlata[] {
  const desde = inicioMes(ahoraMs);
  const hasta = inicioMes(ahoraMs, 1);
  const total = suma(lista, desde, hasta);
  return CATEGORIAS.map((categoria) => ({ categoria, total: suma(lista, desde, hasta, (g) => g.categoria === categoria) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((c) => ({ ...c, emoji: EMOJI_CATEGORIA[c.categoria], color: COLOR_CATEGORIA[c.categoria], fraccion: total > 0 ? c.total / total : 0 }));
}

/**
 * Los gastos que más se repiten (misma descripción y mismo monto) en los últimos 60 días: los botones
 * de un toque. Al menos dos veces; los más repetidos primero y, a igual cantidad, el más reciente.
 */
export function gastosFrecuentes(lista: readonly GastoPlano[], ahoraMs: number, cuantos = FRECUENTES_PLATA): FrecuentePlata[] {
  const grupos = new Map<string, { descripcion: string; monto: number; categoria: Categoria; veces: number; ultimoMs: number }>();
  for (const g of lista) {
    if (!g.descripcion || g.fechaMs < ahoraMs - 60 * DIA || g.fechaMs > ahoraMs) continue;
    const clave = `${normalizar(g.descripcion)}|${g.monto}`;
    const grupo = grupos.get(clave);
    if (!grupo) grupos.set(clave, { descripcion: g.descripcion, monto: g.monto, categoria: g.categoria, veces: 1, ultimoMs: g.fechaMs });
    else {
      grupo.veces++;
      if (g.fechaMs >= grupo.ultimoMs) Object.assign(grupo, { descripcion: g.descripcion, categoria: g.categoria, ultimoMs: g.fechaMs });
    }
  }
  return [...grupos.values()]
    .filter((g) => g.veces >= 2)
    .sort((a, b) => b.veces - a.veces || b.ultimoMs - a.ultimoMs)
    .slice(0, cuantos)
    .map((g) => ({ descripcion: g.descripcion, monto: g.monto, emoji: EMOJI_CATEGORIA[g.categoria], veces: g.veces }));
}

function nombreCategoria(categoria: Categoria): string {
  return categoria.charAt(0).toUpperCase() + categoria.slice(1);
}

/** La categoría que más subió en los últimos 7 días contra los 7 anteriores (al menos 50 % y $5.000 más). */
function categoriaDisparada(lista: readonly GastoPlano[], ahoraMs: number): Descubrimiento | null {
  const hoy = inicioDia(ahoraMs);
  let mejor: { categoria: Categoria; ahora: number; antes: number } | null = null;
  for (const categoria of CATEGORIAS) {
    const es = (g: GastoPlano) => g.categoria === categoria;
    const ahora = suma(lista, inicioDia(hoy, -6), inicioDia(hoy, 1), es);
    const antes = suma(lista, inicioDia(hoy, -13), inicioDia(hoy, -6), es);
    if (antes < 3000 || ahora < antes * 1.5 || ahora - antes < 5000) continue;
    if (!mejor || ahora - antes > mejor.ahora - mejor.antes) mejor = { categoria, ahora, antes };
  }
  if (!mejor) return null;
  const pct = Math.round(((mejor.ahora - mejor.antes) / mejor.antes) * 100);
  return {
    tipo: "disparada",
    texto: `${EMOJI_CATEGORIA[mejor.categoria]} ${nombreCategoria(mejor.categoria)} se disparó: ${formatearMonto(mejor.ahora)} en 7 días, ${pct} % más que la semana anterior.`,
  };
}

/** El gasto chico que más se repite en 30 días y juntos suma harto (lo usan el descubrimiento y las metas de ahorro). */
export function hormigaDelMes(lista: readonly GastoPlano[], ahoraMs: number): { nombre: string; categoria: Categoria; veces: number; suma: number } | null {
  const grupos = new Map<string, { nombre: string; categoria: Categoria; veces: number; suma: number }>();
  for (const g of lista) {
    if (g.monto > HORMIGA.maximo || g.fechaMs < ahoraMs - 30 * DIA || g.fechaMs > ahoraMs) continue;
    const nombre = g.descripcion ?? g.categoria;
    const clave = normalizar(nombre);
    const grupo = grupos.get(clave) ?? { nombre, categoria: g.categoria, veces: 0, suma: 0 };
    grupo.veces++;
    grupo.suma += g.monto;
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].filter((g) => g.veces >= HORMIGA.veces && g.suma >= HORMIGA.suma).sort((a, b) => b.suma - a.suma)[0] ?? null;
}

/** Gastos chicos que se repiten mucho en 30 días y juntos suman harto. */
function gastoHormiga(lista: readonly GastoPlano[], ahoraMs: number): Descubrimiento | null {
  const mejor = hormigaDelMes(lista, ahoraMs);
  if (!mejor) return null;
  return {
    tipo: "hormiga",
    texto: `${EMOJI_CATEGORIA[mejor.categoria]} Gasto hormiga: «${mejor.nombre}» suma ${formatearMonto(mejor.suma)} en 30 días (${mejor.veces} veces). Chiquitito, pero se nota.`,
  };
}

/** Un gasto que apareció los dos meses anteriores con un monto parecido (±15 %): una suscripción, el arriendo… */
function gastoQueSeRepite(lista: readonly GastoPlano[], ahoraMs: number): Descubrimiento | null {
  const porMes = (meses: number) => lista.filter((g) => g.descripcion && g.fechaMs >= inicioMes(ahoraMs, meses) && g.fechaMs < inicioMes(ahoraMs, meses + 1));
  const pasado = porMes(-1);
  const antepasado = porMes(-2);
  const esteMes = porMes(0);
  for (const g of [...pasado].sort((a, b) => b.monto - a.monto)) {
    const clave = normalizar(g.descripcion!);
    const parecido = (otro: GastoPlano) => normalizar(otro.descripcion!) === clave && Math.abs(otro.monto - g.monto) <= g.monto * 0.15;
    const anterior = antepasado.find(parecido);
    if (!anterior) continue;
    const dia = new Date(g.fechaMs).getDate();
    const yaEste = esteMes.some(parecido);
    return {
      tipo: "repetido",
      texto: `${EMOJI_CATEGORIA[g.categoria]} «${g.descripcion}» se repite cada mes (~${formatearMonto(g.monto)}, cerca del día ${dia}).${yaEste ? "" : " Este mes todavía no aparece."}`,
    };
  }
  return null;
}

/** El descubrimiento de la pestaña: primero una categoría disparada, después un gasto hormiga, después uno que se repite. */
export function descubrir(lista: readonly GastoPlano[], ahoraMs: number): Descubrimiento | null {
  return categoriaDisparada(lista, ahoraMs) ?? gastoHormiga(lista, ahoraMs) ?? gastoQueSeRepite(lista, ahoraMs);
}

/** Todo lo que muestra la pestaña Plata. `lista` trae al menos los últimos `DIAS_PLATA` días. */
export function resumenPlata(lista: readonly GastoPlano[], presupuesto: number | null, ahoraMs: number): EstadoPlata {
  const desdeMes = inicioMes(ahoraMs);
  const hasta = ahoraMs + 1;
  const delMes = lista.filter((g) => g.fechaMs >= desdeMes && g.fechaMs < inicioMes(ahoraMs, 1));
  const total = delMes.reduce((t, g) => t + g.monto, 0);
  const mesPasado = suma(lista, inicioMes(ahoraMs, -1), mismaAlturaMesPasado(ahoraMs));
  const hoy = suma(lista, inicioDia(ahoraMs), inicioDia(ahoraMs, 1));
  const ultimos = [...lista]
    .filter((g) => g.fechaMs < hasta + DIA)
    .sort((a, b) => b.fechaMs - a.fechaMs || b.id - a.id)
    .slice(0, ULTIMOS_PLATA)
    .map((g) => ({ id: g.id, emoji: EMOJI_CATEGORIA[g.categoria], descripcion: g.descripcion ?? nombreCategoria(g.categoria), categoria: g.categoria, monto: g.monto, fechaMs: g.fechaMs }));
  return {
    mes: {
      total,
      cantidad: delMes.length,
      mesPasado,
      variacion: mesPasado > 0 ? Math.round(((total - mesPasado) / mesPasado) * 100) : null,
      nombre: MESES[new Date(ahoraMs).getMonth()],
    },
    hoy,
    presupuesto: presupuesto ? presupuestoDelMes(presupuesto, total, hoy, ahoraMs) : null,
    semana: ultimosSieteDias(lista, ahoraMs),
    categorias: categoriasDelMes(lista, ahoraMs),
    ultimos,
    frecuentes: gastosFrecuentes(lista, ahoraMs),
    descubrimiento: descubrir(lista, ahoraMs),
    meses: tendenciaMeses(lista, ahoraMs),
    proyeccion: proyectarMes(lista, presupuesto, ahoraMs),
  };
}

// ---------------------------------------------------------------- tendencia y proyección

/** Lo gastado en cada uno de los últimos `cuantos` meses (el último es el actual, marcado parcial). */
export function tendenciaMeses(lista: readonly GastoPlano[], ahoraMs: number, cuantos = MESES_TENDENCIA): MesPlata[] {
  const meses: MesPlata[] = [];
  for (let i = -(cuantos - 1); i <= 0; i++) {
    const desde = inicioMes(ahoraMs, i);
    const hasta = inicioMes(ahoraMs, i + 1);
    const delMes = lista.filter((g) => g.fechaMs >= desde && g.fechaMs < hasta);
    const mayor = CATEGORIAS.map((categoria) => ({ categoria, total: suma(delMes, desde, hasta, (g) => g.categoria === categoria) }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)[0];
    const fecha = new Date(desde);
    meses.push({
      clave: claveMes(desde),
      corto: MESES_CORTOS[fecha.getMonth()],
      nombre: MESES[fecha.getMonth()],
      total: delMes.reduce((t, g) => t + g.monto, 0),
      parcial: i === 0,
      mayor: mayor ? { categoria: mayor.categoria, emoji: EMOJI_CATEGORIA[mayor.categoria], total: mayor.total } : null,
    });
  }
  return meses;
}

/**
 * "A este ritmo terminas el mes en X": lo gastado ÷ los días que van (contando hoy) × los que faltan,
 * más lo ya gastado. Antes del día 5 no proyecta (con tan pocos datos un solo gasto lo cambia todo). Si un
 * solo gasto pasa de la mitad de lo gastado en el mes (una matrícula, el arriendo) no se repite todos los
 * días: se deja fuera del ritmo y se suma una sola vez.
 */
export function proyectarMes(lista: readonly GastoPlano[], presupuesto: number | null, ahoraMs: number): ProyeccionMes {
  const desde = inicioMes(ahoraMs);
  const hasta = inicioMes(ahoraMs, 1);
  const delMes = lista.filter((g) => g.fechaMs >= desde && g.fechaMs < hasta && g.fechaMs <= ahoraMs);
  const total = delMes.reduce((t, g) => t + g.monto, 0);
  const dia = new Date(ahoraMs).getDate();
  if (dia < DIA_MINIMO_PROYECCION) return { estado: "pronto", ritmoDia: 0, proyectado: total, excluido: null, diferencia: null, color: null };
  const mayor = delMes.reduce<GastoPlano | null>((m, g) => (!m || g.monto > m.monto ? g : m), null);
  const excluido = mayor && mayor.monto * 2 > total ? { monto: mayor.monto, descripcion: mayor.descripcion ?? nombreCategoria(mayor.categoria) } : null;
  const ritmoDia = (total - (excluido?.monto ?? 0)) / dia;
  const proyectado = Math.round(total + ritmoDia * (diasDelMes(ahoraMs) - dia));
  const diferencia = presupuesto ? proyectado - presupuesto : null;
  const color: ColorPlata | null = !presupuesto ? null : proyectado > presupuesto ? "rojo" : proyectado > presupuesto * 0.9 ? "ambar" : "verde";
  return { estado: "ok", ritmoDia: Math.round(ritmoDia), proyectado, excluido, diferencia, color };
}

/** La frase de la proyección (la usan el motor sin IA, el MCP y la isla). */
export function describirProyeccion(p: ProyeccionMes, presupuesto: number | null): string {
  if (p.estado === "pronto") return "Aún es pronto para proyectar el mes: con los primeros días anotados no se puede saber el ritmo. Pregúntame de nuevo desde el día 5 🌱";
  const partes = [`A este ritmo (unos ${formatearMonto(p.ritmoDia)} al día) terminas el mes en ${formatearMonto(p.proyectado)}.`];
  if (p.excluido) partes.push(`Sin contar tu gasto de ${formatearMonto(p.excluido.monto)} en ${p.excluido.descripcion}, que no se repite todos los días.`);
  if (presupuesto && p.diferencia !== null) {
    partes.push(
      p.diferencia > 0
        ? `Con tu presupuesto de ${formatearMonto(presupuesto)} te pasarías por ${formatearMonto(p.diferencia)} 👀`
        : `Con tu presupuesto de ${formatearMonto(presupuesto)} te sobrarían ${formatearMonto(-p.diferencia)} 🌱`,
    );
  }
  return partes.join(" ");
}

// ---------------------------------------------------------------- avisos del presupuesto

/** Los umbrales que se avisan, una vez cada uno por mes (y por presupuesto: si lo cambias, vuelven). */
export const UMBRALES_PRESUPUESTO = [80, 100] as const;

export interface AvisadosPresupuesto {
  /** "2026-10". */
  mes: string;
  monto: number;
  dados: number[];
}

export function claveMes(ahoraMs: number): string {
  const d = new Date(ahoraMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Los avisos que tocan ahora (al pasar 80 % y 100 %), con personalidad, y lo que hay que guardar para no
 * repetirlos. Si se pasan los dos de una vez, solo se dice el más alto (y se dan los dos por dados).
 */
export function avisosPresupuesto(p: PresupuestoMes | null, ahoraMs: number, antes: AvisadosPresupuesto | null): { textos: string[]; avisados: AvisadosPresupuesto | null } {
  if (!p) return { textos: [], avisados: antes };
  const mes = claveMes(ahoraMs);
  const dados = antes && antes.mes === mes && antes.monto === p.monto ? [...antes.dados] : [];
  const nuevos = UMBRALES_PRESUPUESTO.filter((u) => p.porcentaje >= u && !dados.includes(u));
  const avisados = { mes, monto: p.monto, dados: [...dados, ...nuevos] };
  if (nuevos.length === 0) return { textos: [], avisados };
  const umbral = nuevos[nuevos.length - 1];
  const dias = p.diasQuedan === 1 ? "queda 1 día" : `quedan ${p.diasQuedan} días`;
  const texto =
    umbral >= 100
      ? `🚨 Te pasaste del presupuesto del mes: llevas ${formatearMonto(p.gastado)} de ${formatearMonto(p.monto)}. Nada de dramas: desde mañana vamos con calma 🌱`
      : `👀 Ojo: ya llevas el ${p.porcentaje} % del presupuesto (${formatearMonto(p.gastado)} de ${formatearMonto(p.monto)}) y ${dias}. ¡Tú puedes!`;
  return { textos: [texto], avisados };
}

/** Lee lo guardado en la base (texto JSON); cualquier cosa rara cuenta como nada. */
export function leerAvisados(texto: string | null): AvisadosPresupuesto | null {
  try {
    const datos = JSON.parse(texto ?? "null");
    if (typeof datos?.mes !== "string" || typeof datos.monto !== "number" || !Array.isArray(datos.dados)) return null;
    return { mes: datos.mes, monto: datos.monto, dados: datos.dados.filter((d: unknown): d is number => typeof d === "number") };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- frases (motor sin IA y MCP)

const SIN_PRESUPUESTO = "Todavía no tienes presupuesto 💰. Dime «mi presupuesto es 200 lucas» y te digo cuánto puedes gastar cada día.";

export function describirPresupuestoPuesto(p: PresupuestoMes): string {
  return `Listo: tu presupuesto es ${formatearMonto(p.monto)} al mes 💰. Este mes llevas ${formatearMonto(p.gastado)} (${p.porcentaje} %) y hoy puedes gastar ${formatearMonto(Math.max(0, p.puedesHoy))}.`;
}

/** "¿Cuánto me queda del presupuesto?" */
export function describirQueda(p: PresupuestoMes | null): string {
  if (!p) return SIN_PRESUPUESTO;
  const dias = p.diasQuedan === 1 ? "Queda 1 día" : `Quedan ${p.diasQuedan} días`;
  if (p.queda <= 0) return `Este mes ya te pasaste por ${formatearMonto(-p.queda)} (llevas ${formatearMonto(p.gastado)} de ${formatearMonto(p.monto)}). ${dias}: vamos con calma 🌱`;
  return `Te quedan ${formatearMonto(p.queda)} de ${formatearMonto(p.monto)} (llevas ${p.porcentaje} %). ${dias}: unos ${formatearMonto(p.porDia)} por día.`;
}

/** "¿Cuánto puedo gastar hoy?" */
export function describirHoy(p: PresupuestoMes | null): string {
  if (!p) return SIN_PRESUPUESTO;
  if (p.puedesHoy < 0) return `Hoy ya te pasaste por ${formatearMonto(-p.puedesHoy)} 😅. Mañana se reparte de nuevo lo que queda del mes.`;
  if (p.puedesHoy === 0) return "Hoy ya usaste todo lo del día. Mañana se reparte de nuevo 🌱";
  return `Hoy puedes gastar ${formatearMonto(p.puedesHoy)} 🌱 (${p.color === "verde" ? "vas bien" : p.color === "ambar" ? "ojo, vas justo" : "vas pasado"} con tu presupuesto de ${formatearMonto(p.monto)}).`;
}
