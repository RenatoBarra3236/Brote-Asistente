// Identidad de dispositivo del personaje ante el Gateway de OpenClaw.
// Sin ella el Gateway solo concede lectura; con ella, y tras aprobarla una vez
// (`openclaw devices approve`), concede escritura y aprobaciones.
// Se guarda fuera del repo, en ~/.asistente-prototipo/, con permisos 600.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeviceIdentity, GatewayClientHostDeps } from "@openclaw/gateway-client";

const CARPETA = join(homedir(), ".asistente-prototipo");
const ARCHIVO = join(CARPETA, "dispositivo.json");

// Prefijo DER de una clave pública Ed25519 en formato SPKI; lo que sigue son los 32 bytes crudos.
const ED25519_SPKI_PREFIX_BYTES = 12;

type Guardado = {
  identidad: DeviceIdentity;
  tokens: Record<string, { token: string; scopes: string[] }>;
};

function leer(): Guardado | null {
  if (!existsSync(ARCHIVO)) return null;
  return JSON.parse(readFileSync(ARCHIVO, "utf8"));
}

function escribir(datos: Guardado): void {
  mkdirSync(CARPETA, { recursive: true, mode: 0o700 });
  writeFileSync(ARCHIVO, JSON.stringify(datos, null, 2), { mode: 0o600 });
}

function clavePublicaCruda(publicKeyPem: string): Buffer {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return der.subarray(ED25519_SPKI_PREFIX_BYTES);
}

function crearIdentidad(): DeviceIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // Mismo criterio que OpenClaw: el id es el SHA-256 de la clave pública cruda.
  const deviceId = createHash("sha256").update(clavePublicaCruda(publicKey)).digest("hex");
  return { deviceId, publicKeyPem: publicKey, privateKeyPem: privateKey };
}

export function dependenciasDeDispositivo(): GatewayClientHostDeps {
  return {
    loadOrCreateDeviceIdentity: () => {
      const guardado = leer();
      if (guardado) return guardado.identidad;
      const identidad = crearIdentidad();
      escribir({ identidad, tokens: {} });
      return identidad;
    },
    signDevicePayload: (privateKeyPem, payload) =>
      sign(null, Buffer.from(payload, "utf8"), createPrivateKey(privateKeyPem)).toString("base64url"),
    publicKeyRawBase64UrlFromPem: (publicKeyPem) => clavePublicaCruda(publicKeyPem).toString("base64url"),
    loadDeviceAuthToken: ({ role }) => leer()?.tokens[role] ?? null,
    storeDeviceAuthToken: ({ role, token, scopes }) => {
      const guardado = leer();
      if (!guardado) return;
      guardado.tokens[role] = { token, scopes };
      escribir(guardado);
    },
    clearDeviceAuthToken: ({ role }) => {
      const guardado = leer();
      if (!guardado) return;
      delete guardado.tokens[role];
      escribir(guardado);
    },
  };
}
