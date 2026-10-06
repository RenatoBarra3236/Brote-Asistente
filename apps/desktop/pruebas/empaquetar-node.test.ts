import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error el script es un .mjs sin tipos
import { esAutocontenidoMac, revisarNode } from "../scripts/empaquetar-node.mjs";

const OFICIAL = `/ruta/node:
\t/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (compatibility version 150.0.0, current version 3038.1.255)
\t/usr/lib/libc++.1.dylib (compatibility version 1.0.0, current version 1800.101.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1351.0.0)
`;
const HOMEBREW = `/opt/homebrew/bin/node:
\t/opt/homebrew/opt/node/lib/libnode.137.dylib (compatibility version 0.0.0, current version 0.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1351.0.0)
`;

describe("Node dentro de la app", () => {
  it("solo sirve un Node de un solo archivo (bibliotecas del sistema)", () => {
    assert.equal(esAutocontenidoMac(OFICIAL), true);
    assert.equal(esAutocontenidoMac(HOMEBREW), false);
    assert.equal(esAutocontenidoMac(""), false);
  });

  it("rechaza un Node menor a 24 y uno que carga bibliotecas ajenas", () => {
    const falso = (version: string, otool: string) => (programa: string) => (programa === "otool" ? otool : version);
    assert.throws(() => revisarNode("/x/node", falso("v22.10.0", OFICIAL)), /necesita Node 24/);
    if (process.platform === "darwin") {
      assert.throws(() => revisarNode("/x/node", falso("v24.1.0", HOMEBREW)), /fuera del sistema/);
      assert.equal(revisarNode("/x/node", falso("v24.1.0", OFICIAL)), "v24.1.0");
    }
  });
});
