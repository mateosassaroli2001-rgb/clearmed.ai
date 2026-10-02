import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El frontend vive en src/client. En desarrollo, Vite corre dentro del
// servidor Express (modo middleware), así todo usa una sola URL.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
});
