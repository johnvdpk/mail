import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "data/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },
];

export default eslintConfig;
