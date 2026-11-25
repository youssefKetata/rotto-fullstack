import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "postgres",
              message: "Keep database connections in src/lib/data.",
            },
          ],
          patterns: [
            {
              group: ["**/data/pool"],
              message: "Use a function from the data layer.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/data/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/api",
              message: "Let the HTTP layer map data errors to responses.",
            },
            {
              name: "../api",
              message: "Let the HTTP layer map data errors to responses.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(from|rpc)$/]:matches([callee.object.name='supabase'], [callee.object.property.name='supabase'])",
          message: "Put Supabase table and RPC calls in src/lib/data.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    ".artifacts/**",
  ]),
]);

export default eslintConfig;
