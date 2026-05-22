import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "./",
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    outDir: "../dist",
  },
});
