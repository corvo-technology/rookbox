import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    react(),
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    lingui(),
    tailwindcss(),
  ],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: webPort,
  },
});
