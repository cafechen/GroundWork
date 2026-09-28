import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    ".next/**",
    "src/generated/**",
    "packages/**",
    "assets/**",
    "engines/**",
    "data/**",
    "artifacts/**",
    "server/**",
    "scripts/**",
    "tests/**",
    "src/*.js",
    "src/core/**",
  ]),
]);
