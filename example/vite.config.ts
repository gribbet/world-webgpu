import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
