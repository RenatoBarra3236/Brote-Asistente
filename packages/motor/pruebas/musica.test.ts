import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import {
  appsAbiertas,
  comandoControl,
  comandoControlMac,
  comandoLecturaMac,
  describirMusica,
  interpretarGsmtc,
  interpretarJxa,
  nombreDeAppWindows,
  type AccionMusica,
  type EstadoMusica,
} from "../src/musica.ts";

// Salidas reales de `ps -Ao comm=` en un Mac (recortadas).
const PS = [
  "/sbin/launchd",
  "/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder",
  "/Applications/Spotify.app/Contents/MacOS/Spotify",
  "/Applications/Spotify.app/Contents/Frameworks/Spotify Helper.app/Contents/MacOS/Spotify Helper",
  "/System/Applications/Music.app/Contents/MacOS/Music",
  "/System/Library/PrivateFrameworks/MusicLibrary.framework/musicd",
].join("\n");

const SONANDO: EstadoMusica = { app: "Spotify", sonando: true, cancion: "Flowers", artista: "Miley Cyrus" };

describe("música: macOS", () => {
  it("ve qué apps están abiertas sin preguntarles nada", () => {
    assert.deepEqual(appsAbiertas(PS), ["Spotify", "Music"]);
    assert.deepEqual(appsAbiertas("/sbin/launchd\n/Applications/Safari.app/Contents/MacOS/Safari"), []);
  });

  it("solo arma comandos para apps abiertas y acciones conocidas", () => {
    assert.equal(comandoLecturaMac([]), null);
    const lectura = comandoLecturaMac(["Spotify"])!;
    assert.deepEqual(lectura.args.slice(0, 3), ["-l", "JavaScript", "-e"]);
    assert.match(lectura.args[3], /\["Spotify"\]\.map\(leer\)/);
    assert.equal(comandoLecturaMac(["Safari" as any]), null);
    assert.match(comandoControlMac("Music", "siguiente")!.args[3], /Application\("Music"\); if \(app\.running\(\)\) app\.nextTrack\(\);/);
    assert.equal(comandoControlMac("Spotify", "borrar" as AccionMusica), null);
    assert.equal(comandoControl("pausa", null, "darwin"), null);
    assert.match(comandoControl("pausa", { ...SONANDO, app: "Música" }, "darwin")!.args[3], /"Music".*app\.pause\(\)/);
    assert.equal(comandoControl("pausa", SONANDO, "linux"), null);
  });

  it("interpreta la salida del JXA: prefiere la que suena", () => {
    const salida = JSON.stringify([
      { app: "Spotify", estado: "paused", cancion: "Flowers", artista: "Miley Cyrus" },
      { app: "Music", estado: "playing", cancion: "Tusa", artista: "KAROL G" },
    ]);
    assert.deepEqual(interpretarJxa(salida), { estado: { app: "Música", sonando: true, cancion: "Tusa", artista: "KAROL G" }, sinPermiso: [] });
    assert.deepEqual(interpretarJxa(JSON.stringify([{ app: "Spotify", estado: "paused", cancion: "Flowers", artista: "" }])).estado, {
      app: "Spotify",
      sonando: false,
      cancion: "Flowers",
      artista: null,
    });
    assert.deepEqual(interpretarJxa(JSON.stringify([null, { app: "Music", estado: "stopped" }])), { estado: null, sinPermiso: [] });
  });

  it("si el usuario negó el permiso de Automatización, lo informa para no insistir", () => {
    const salida = JSON.stringify([{ app: "Spotify", error: "Error: Not authorized to send Apple events to Spotify. (-1743)" }]);
    assert.deepEqual(interpretarJxa(salida), { estado: null, sinPermiso: ["Spotify"] });
    assert.deepEqual(interpretarJxa("execution error"), { estado: null, sinPermiso: [] });
  });
});

describe("música: Windows", () => {
  it("interpreta los controles de medios del sistema", () => {
    assert.deepEqual(interpretarGsmtc('{"app":"Spotify.exe","estado":4,"cancion":"Flowers","artista":"Miley Cyrus"}'), SONANDO);
    assert.equal(interpretarGsmtc('{"app":"chrome","estado":5,"cancion":"Clase 3","artista":""}')!.sonando, false);
    assert.equal(interpretarGsmtc('{"app":"x","estado":3}'), null);
    assert.equal(interpretarGsmtc(""), null);
    assert.equal(nombreDeAppWindows("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "Reproductor multimedia");
    assert.equal(nombreDeAppWindows("MSEdge"), "Edge");
  });
});

describe("música: frases sin IA", () => {
  const pedidos: AccionMusica[] = [];
  let estado: EstadoMusica | null = SONANDO;
  const motor = new Motor(new Gastos(":memory:"), { musica: { estado: () => estado, controlar: (a) => pedidos.push(a) } });

  it("controla la música", () => {
    const casos: [string, AccionMusica, RegExp][] = [
      ["pausa la música", "pausa", /Pausé/],
      ["para la canción", "pausa", /Pausé/],
      ["siguiente canción", "siguiente", /Siguiente/],
      ["pasa la canción", "siguiente", /Siguiente/],
      ["pon la anterior", "anterior", /anterior/],
      ["canción anterior", "anterior", /anterior/],
      ["dale play", "play", /Ya está sonando «Flowers» de Miley Cyrus/],
    ];
    for (const [frase, accion, respuesta] of casos) {
      pedidos.length = 0;
      const r = motor.resolver(frase);
      assert.match(r?.texto ?? "", respuesta, frase);
      assert.deepEqual(pedidos, [accion], frase);
    }
  });

  it("dice qué suena y nunca abre una app", () => {
    assert.equal(motor.resolver("¿qué está sonando?")!.texto, "🎵 Está sonando «Flowers» de Miley Cyrus en Spotify.");
    assert.equal(motor.resolver("qué canción es esta")!.intencion, "musica-estado");
    estado = null;
    pedidos.length = 0;
    assert.match(motor.resolver("pon música")!.texto, /No veo música abierta/);
    assert.deepEqual(pedidos, []);
    assert.equal(describirMusica(null).startsWith("No está sonando nada"), true);
  });

  it("no confunde otras frases", () => {
    assert.equal(motor.resolver("para el pomodoro"), null);
    assert.equal(motor.resolver("otra"), null);
    // Sin música conectada (servidor MCP), va al agente.
    assert.equal(new Motor(new Gastos(":memory:")).resolver("pausa la música"), null);
  });
});
