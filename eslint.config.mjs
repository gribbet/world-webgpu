import eslintConfig from "@gribbet/eslint-config";

export default [
  ...eslintConfig,
  {
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
];
