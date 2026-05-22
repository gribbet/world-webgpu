import eslintConfig from "@gribbet/eslint-config";

export default [
  ...eslintConfig,
  {
    ignores: ["vite.config.ts"],
  },
  {
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
];
