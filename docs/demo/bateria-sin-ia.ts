// Medición exploratoria del 6-10-2026 (docs/plan-sin-ia.md): cuántas frases entiende el motor sin IA. Solo lectura, base en memoria.
// Correr: node docs/demo/bateria-sin-ia.ts
import { Gastos } from "../../packages/motor/src/gastos.ts";
import { Motor } from "../../packages/motor/src/motor.ts";
import { Ramos } from "../../packages/motor/src/ramos.ts";
import { Temporizadores } from "../../packages/motor/src/temporizadores.ts";

const gastos = new Gastos(":memory:");
const ramos = new Ramos(gastos);
ramos.crear({ nombre: "Cálculo", alias: ["calculo"] }, Date.now()); ramos.crear({ nombre: "Física", alias: ["fisica"] }, Date.now());
const motor = new Motor(gastos, { reloj: () => new Date(2026, 9, 6, 13, 0), ramos, temporizadores: new Temporizadores(gastos) });

type Caso = [area: string, tipo: "ok" | "tipeo" | "otra", frase: string];
const C: Caso[] = [
  // gastos
  ["gastos", "ok", "gasté 5 lucas en almuerzo"],
  ["gastos", "ok", "gasté 3500 en el café"],
  ["gastos", "tipeo", "gaste 5 lucas en almuerso"],
  ["gastos", "tipeo", "gasté 5 lukas en almuerzo"],
  ["gastos", "tipeo", "gaste 5 lucas almuerzo"],
  ["gastos", "otra", "me salió 5 lucas el almuerzo"],
  ["gastos", "otra", "almuerzo 5 lucas"],
  ["gastos", "otra", "pagué el almuerzo, 5 lucas"],
  ["gastos", "otra", "se me fueron 8 lucas en una pizza"],
  ["gastos", "otra", "compré un cuaderno por 2 mil"],
  ["gastos", "ok", "cuánto he gastado esta semana"],
  ["gastos", "tipeo", "cuanto e gastado esta semana"],
  ["gastos", "tipeo", "cuanto he gastdo esta semna"],
  ["gastos", "otra", "cuánta plata llevo gastada esta semana"],
  ["gastos", "otra", "en qué se me va la plata"],
  ["gastos", "otra", "cuánto me gasté en comida este mes"],
  ["gastos", "ok", "mis últimos gastos"],
  ["gastos", "tipeo", "mis ultimos gatos"],
  ["gastos", "otra", "qué he comprado últimamente"],
  ["gastos", "otra", "borra el último gasto"],
  ["gastos", "tipeo", "borra el ultimo gato"],
  ["gastos", "otra", "me equivoqué, borra eso"],
  // presupuesto
  ["presupuesto", "ok", "mi presupuesto es 200 lucas"],
  ["presupuesto", "tipeo", "mi presupesto es 200 lucas"],
  ["presupuesto", "otra", "quiero gastar máximo 200 lucas al mes"],
  ["presupuesto", "otra", "cuánta plata me queda este mes"],
  ["presupuesto", "ok", "cuánto puedo gastar hoy"],
  ["presupuesto", "tipeo", "cuanto puedo gastr hoy"],
  ["presupuesto", "otra", "me alcanza para un café"],
  // temporizadores
  ["pomodoro", "ok", "pomodoro de 30 para cálculo"],
  ["pomodoro", "tipeo", "pomodro de 30 para calculo"],
  ["pomodoro", "otra", "pon un pomodoro de 25"],
  ["pomodoro", "otra", "quiero estudiar 30 minutos"],
  ["pomodoro", "otra", "empecemos a estudiar"],
  ["pomodoro", "ok", "recuérdame en 10 minutos sacar la ropa"],
  ["pomodoro", "tipeo", "recuerdame en 10 minutso sacar la ropa"],
  ["pomodoro", "otra", "avísame en 10 minutos que saque la ropa"],
  ["pomodoro", "otra", "en media hora recuérdame llamar a mi mamá"],
  ["pomodoro", "ok", "cuánto falta"],
  ["pomodoro", "otra", "cuánto queda del pomodoro"],
  ["pomodoro", "ok", "para el pomodoro"],
  ["pomodoro", "otra", "ya no quiero seguir"],
  // calendario
  ["calendario", "ok", "qué tengo hoy"],
  ["calendario", "tipeo", "que tengo oy"],
  ["calendario", "otra", "tengo clases hoy"],
  ["calendario", "otra", "a qué hora entro hoy"],
  ["calendario", "ok", "cuál es mi próxima clase"],
  ["calendario", "tipeo", "cual es mi proxima clse"],
  ["calendario", "otra", "qué viene ahora"],
  ["calendario", "ok", "agenda estudiar cálculo a las 16:30"],
  ["calendario", "tipeo", "agnda estudiar calculo a las 16:30"],
  ["calendario", "otra", "tengo prueba de física el viernes a las 9"],
  ["calendario", "otra", "anota una reunión mañana a las 10"],
  // aula
  ["aula", "ok", "qué entregas tengo"],
  ["aula", "tipeo", "que entregs tengo"],
  ["aula", "otra", "qué tengo que entregar esta semana"],
  ["aula", "otra", "hay tareas para mañana"],
  ["aula", "otra", "tengo algo atrasado"],
  // estudio
  ["estudio", "ok", "agrega el ramo cálculo"],
  ["estudio", "tipeo", "agrega el ramo calculo ll"],
  ["estudio", "otra", "tengo un ramo nuevo: física"],
  ["estudio", "ok", "me saqué 5,5 en el certamen 1 de cálculo"],
  ["estudio", "tipeo", "me saque 5,5 en el certamn 1 de calculo"],
  ["estudio", "otra", "saqué un 5,5 en el certamen 1 de cálculo"],
  ["estudio", "otra", "me fue bien, un 6,2 en cálculo"],
  ["estudio", "ok", "cómo voy en cálculo"],
  ["estudio", "otra", "voy aprobando cálculo?"],
  ["estudio", "otra", "cuánto necesito para pasar cálculo"],
  ["estudio", "ok", "tengo tarjetas para repasar"],
  ["estudio", "otra", "quiero repasar"],
  ["estudio", "ok", "qué tengo que estudiar hoy"],
  ["estudio", "otra", "qué estudio hoy"],
  ["estudio", "ok", "estudié 2 horas de cálculo"],
  ["estudio", "otra", "estudié dos horas ayer"],
  ["estudio", "ok", "todo lo de cálculo"],
  ["estudio", "otra", "muéstrame lo de cálculo"],
  // ahorro
  ["ahorro", "ok", "quiero juntar 150 lucas para marzo para el viaje"],
  ["ahorro", "otra", "estoy ahorrando para un notebook"],
  ["ahorro", "ok", "aparté 20 lucas para el viaje"],
  ["ahorro", "tipeo", "aparte 20 lukas para el viaje"],
  ["ahorro", "otra", "guardé 20 lucas"],
  ["ahorro", "ok", "cómo van mis metas de ahorro"],
  // equipo y otros
  ["equipo", "ok", "cómo está el computador"],
  ["equipo", "tipeo", "como esta el computadro"],
  ["equipo", "otra", "cuánta batería me queda"],
  ["equipo", "otra", "se está calentando el pc?"],
  ["musica", "ok", "pausa la música"],
  ["musica", "tipeo", "pausa la musca"],
  ["musica", "otra", "pon pausa"],
  ["musica", "otra", "siguiente"],
  ["musica", "otra", "qué canción es esta"],
  ["descargas", "ok", "mis descargas"],
  ["descargas", "otra", "qué descargué"],
  ["descargas", "otra", "abre lo último que bajé"],
  ["memoria", "ok", "qué sabes de mí"],
  ["memoria", "tipeo", "que sabes de mi?"],
  ["memoria", "otra", "qué recuerdas de mí"],
  ["plan", "ok", "cuánto llevo del plan"],
  ["plan", "otra", "me queda plan de claude"],
  ["saludo", "otra", "hola"],
  ["saludo", "otra", "gracias"],
  ["saludo", "otra", "ayuda"],
  ["saludo", "otra", "qué puedes hacer"],
];

const por: Record<string, { total: number; ok: number }> = {};
const tipo: Record<string, { total: number; ok: number }> = {};
const fallan: string[] = [];
for (const [area, t, frase] of C) {
  let r: any = null;
  try { r = motor.entender(frase); } catch { r = null; }
  const resuelto = r !== null;
  for (const [mapa, clave] of [[por, area], [tipo, t]] as const) {
    mapa[clave] ??= { total: 0, ok: 0 };
    mapa[clave].total++;
    if (resuelto) mapa[clave].ok++;
  }
  if (!resuelto) fallan.push(`${area}/${t}: ${frase}`);
}
const pct = (m: { total: number; ok: number }) => `${m.ok}/${m.total} (${Math.round((m.ok / m.total) * 100)}%)`;
console.log("POR TIPO:", Object.entries(tipo).map(([k, v]) => `${k} ${pct(v)}`).join(" · "));
console.log("POR ÁREA:", Object.entries(por).map(([k, v]) => `${k} ${pct(v)}`).join(" · "));
const tot = C.length, okTot = C.length - fallan.length;
console.log(`TOTAL: ${okTot}/${tot} (${Math.round((okTot / tot) * 100)}%)`);
console.log("\nNO ENTIENDE:\n" + fallan.join("\n"));
