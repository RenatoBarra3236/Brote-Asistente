// Capa D del plan sin IA: lo que Brote recuerda en TU computador para entenderte mejor, sin enviar nada fuera.
//  · `FrasesAprendidas`: frases que confirmaste con un toque («almuerzo 5 lucas» → «gaste 5 lucas en almuerzo»).
//    Valen solo para ti y se borran en «Lo que sé de ti → Frases que aprendí». El monto no se guarda: se cambia
//    por {monto}, así «almuerzo 8 lucas» también se entiende.
//  · `FrasesNoEntendidas`: las frases que no entendió sin IA. Apagado de fábrica; con tu permiso explícito se
//    guardan para que las veas, las borres o las copies. Nada sale solo.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import { hallarMontos, tokenizar } from "./piezas.ts";
import { normalizar } from "./texto.ts";

export const MAX_FRASES_APRENDIDAS = 300;
export const MAX_FRASES_NO_ENTENDIDAS = 200;
export const MAX_LARGO_FRASE = 200;
export const CLAVE_GUARDAR_NO_ENTENDIDAS = "guardar-no-entendidas";

const HUECO = "{monto}";

/** La frase sin su monto (que se cambia por {monto}) y el monto tal cual lo escribió el usuario. `null` si hay dos montos. */
export function formaDe(frase: string): { forma: string; monto: string | null } | null {
  const toks = tokenizar(frase);
  const montos = hallarMontos(toks);
  if (montos.length > 1) return null;
  if (montos.length === 0) return { forma: toks.map((t) => t.n).join(" "), monto: null };
  const m = montos[0];
  const partes = [...toks.slice(0, m.desde).map((t) => t.n), HUECO, ...toks.slice(m.hasta + 1).map((t) => t.n)];
  return { forma: partes.join(" "), monto: m.texto };
}

/** El destino guardado con {monto} puesto de vuelta con el monto de ahora. */
export function rellenar(destino: string, monto: string | null): string | null {
  if (!destino.includes(HUECO)) return destino;
  return monto === null ? null : destino.replace(HUECO, monto);
}

export interface FraseAprendida {
  forma: string;
  destino: string;
  veces: number;
  ms: number;
}

export class FrasesAprendidas {
  private readonly db: DatabaseSync;

  constructor(gastos: Gastos) {
    this.db = gastos.baseDeDatos();
    this.db.exec(`create table if not exists frases_confirmadas (
      forma text primary key,
      destino text not null,
      veces integer not null default 1,
      ms integer not null
    );`);
  }

  /** La frase en la forma de la guía a la que el usuario dijo que equivale, con el monto de esta vez. */
  buscar(frase: string): string | null {
    const f = formaDe(frase);
    if (!f) return null;
    const fila = this.db.prepare("select destino from frases_confirmadas where forma = ?").get(f.forma) as { destino: string } | undefined;
    return fila ? rellenar(fila.destino, f.monto) : null;
  }

  /** Recuerda que `original` quiere decir `destino` (ya en la forma de la guía). No guarda si los montos no coinciden. */
  recordar(original: string, destino: string, ahoraMs: number): boolean {
    const a = formaDe(original);
    const b = formaDe(destino);
    if (!a || !b || a.forma.length === 0 || a.forma.length > MAX_LARGO_FRASE) return false;
    // Con monto: tiene que ser el mismo en los dos lados; así nunca se «corrige» ni se inventa un monto.
    if ((a.monto === null) !== (b.monto === null)) return false;
    if (a.monto !== null && normalizar(a.monto) !== normalizar(b.monto!)) return false;
    if (a.forma === b.forma) return false;
    this.db
      .prepare("insert into frases_confirmadas (forma, destino, veces, ms) values (?, ?, 1, ?) on conflict (forma) do update set destino = excluded.destino, veces = veces + 1, ms = excluded.ms")
      .run(a.forma, b.forma, ahoraMs);
    this.db
      .prepare("delete from frases_confirmadas where forma in (select forma from frases_confirmadas order by ms desc limit -1 offset ?)")
      .run(MAX_FRASES_APRENDIDAS);
    return true;
  }

  listar(): FraseAprendida[] {
    return this.db.prepare("select forma, destino, veces, ms from frases_confirmadas order by ms desc").all() as unknown as FraseAprendida[];
  }

  olvidar(forma: string): boolean {
    return Number(this.db.prepare("delete from frases_confirmadas where forma = ?").run(forma).changes) > 0;
  }

  olvidarTodas(): number {
    return Number(this.db.prepare("delete from frases_confirmadas").run().changes);
  }
}

export interface FraseNoEntendida {
  id: number;
  frase: string;
  ms: number;
}

export class FrasesNoEntendidas {
  private readonly db: DatabaseSync;
  private readonly gastos: Gastos;

  constructor(gastos: Gastos) {
    this.gastos = gastos;
    this.db = gastos.baseDeDatos();
    this.db.exec(`create table if not exists frases_no_entendidas (
      id integer primary key,
      frase text not null,
      ms integer not null
    );`);
  }

  /** ¿El usuario dio permiso para guardarlas? Apagado de fábrica. */
  activo(): boolean {
    return this.gastos.ajuste(CLAVE_GUARDAR_NO_ENTENDIDAS) === "1";
  }

  ponerActivo(activo: boolean): void {
    this.gastos.guardarAjuste(CLAVE_GUARDAR_NO_ENTENDIDAS, activo ? "1" : "0");
  }

  /** Guarda una frase que no se entendió, solo con permiso. Devuelve si la guardó. */
  guardar(frase: string, ahoraMs: number): boolean {
    const limpia = frase.trim().slice(0, MAX_LARGO_FRASE);
    if (!this.activo() || limpia.length < 2) return false;
    const igual = this.db.prepare("select id from frases_no_entendidas where frase = ?").get(limpia) as { id: number } | undefined;
    if (igual) {
      this.db.prepare("update frases_no_entendidas set ms = ? where id = ?").run(ahoraMs, igual.id);
      return true;
    }
    this.db.prepare("insert into frases_no_entendidas (frase, ms) values (?, ?)").run(limpia, ahoraMs);
    this.db.prepare("delete from frases_no_entendidas where id in (select id from frases_no_entendidas order by ms desc limit -1 offset ?)").run(MAX_FRASES_NO_ENTENDIDAS);
    return true;
  }

  /** Las guardadas, de la más nueva a la más vieja (ver y borrar no dependen del permiso). */
  listar(): FraseNoEntendida[] {
    return this.db.prepare("select id, frase, ms from frases_no_entendidas order by ms desc, id desc").all() as unknown as FraseNoEntendida[];
  }

  borrar(id: number): boolean {
    return Number(this.db.prepare("delete from frases_no_entendidas where id = ?").run(id).changes) > 0;
  }

  borrarTodas(): number {
    return Number(this.db.prepare("delete from frases_no_entendidas").run().changes);
  }
}
