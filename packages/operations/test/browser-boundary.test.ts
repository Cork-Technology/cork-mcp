import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = readdirSync(join(PACKAGE_ROOT, "src"))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => join(PACKAGE_ROOT, "src", file));

describe("browser-safe public package boundary", () => {
  it("contains no Node-only imports or ambient runtime dependencies", () => {
    const forbidden = [
      /\bnode:/u,
      /\bprocess\b/u,
      /\bBuffer\b/u,
      /\bsetTimeout\b/u,
      /\bsetInterval\b/u,
      /\bfetch\s*\(/u,
      /\bXMLHttpRequest\b/u,
      /\bWebSocket\b/u,
      /\blocalStorage\b/u,
      /\bsessionStorage\b/u,
      /\bnavigator\.credentials\b/u,
      /\bDeno\b/u,
      /\bBun\b/u,
    ];
    for (const path of sourceFiles) {
      const source = readFileSync(path, "utf8");
      for (const pattern of forbidden) {
        expect(source, `${path} contains ${pattern}`).not.toMatch(pattern);
      }
      for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
        expect(match[1], `${path} has a non-local runtime import`).toMatch(
          /^\.\//u,
        );
      }
    }
  });

  it("exports one implementation for browsers and command-line consumers", () => {
    const packageJson = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.type).toBe("module");
    expect(packageJson.sideEffects).toBe(false);
    expect(packageJson.engines).toEqual({ node: ">=22 <23" });
    expect(packageJson.exports).toMatchObject({
      ".": {
        browser: "./dist/index.js",
        import: "./dist/index.js",
        default: "./dist/index.js",
      },
      "./schemas/v1/common": {
        default: "./schemas/v1/common.schema.json",
      },
      "./schemas/v1/capabilities": {
        default: "./schemas/v1/capabilities.schema.json",
      },
    });
    expect(packageJson.browser).toMatchObject({
      "node:crypto": false,
      "node:fs": false,
      "node:process": false,
    });
  });
});
