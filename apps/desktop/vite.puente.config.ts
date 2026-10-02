// Empaqueta el puente, el servidor MCP de gastos y el asistente de configuración como archivos .mjs autosuficientes (con sus
// dependencias adentro), para que viajen dentro de la app y corran con el Node del usuario.
//   pnpm --dir apps/desktop empaquetar-puente   → src-tauri/recursos/{puente,mcp}.mjs

import { defineConfig } from "vite";

export default defineConfig({
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: true,
    outDir: "src-tauri/recursos",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        puente: "../../packages/adapter/src/puente.ts",
        mcp: "../../packages/motor/src/mcp.ts",
        configurar: "../../packages/adapter/src/configurar.ts",
      },
      output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "comun-[name].mjs" },
    },
  },
});
