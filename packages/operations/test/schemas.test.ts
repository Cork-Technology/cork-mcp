import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadSchema = (name: string) =>
  JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "schemas", "v1", name), "utf8"),
  ) as Record<string, unknown>;
const SCHEMAS = {
  "actions.schema.json": {
    id: "https://schemas.cork.tech/operations/v1/actions.schema.json",
    versions: [
      "cork.manifest-share-token/v1",
      "cork.authority/v1",
      "cork.authority-revocation/v1",
      "cork.prepared-unwind/v1",
      "cork.finalized-unwind/v1",
      "cork.exact-spend-action/v1",
      "cork.capped-input-unavailable/v1",
      "cork.safe-permit-authorization/v1",
      "cork.safe-execution-wrapper/v1",
      "cork.direct-package-candidate/v1",
    ],
  },
  "capabilities.schema.json": {
    id: "https://schemas.cork.tech/operations/v1/capabilities.schema.json",
    versions: ["cork.capabilities/v1"],
  },
  "common.schema.json": {
    id: "https://schemas.cork.tech/operations/v1/common.schema.json",
    versions: ["cork.operation/v1"],
  },
  "evidence.schema.json": {
    id: "https://schemas.cork.tech/operations/v1/evidence.schema.json",
    versions: [
      "cork.generation-evidence/v1",
      "cork.raw-observation/v1",
      "cork.frozen-execution/v1",
      "cork.simulation-attestation/v1",
      "cork.verified-market/v1",
    ],
  },
  "market-deployment.schema.json": {
    id: "https://cork.tech/schemas/v1/market-deployment.schema.json",
    versions: [
      "cork.merged-rfc007-release/v1",
      "cork.market-deployment/v1",
      "cork.prepared-market-deployment/v1",
      "cork.market-deployment-simulation/v1",
    ],
  },
} as const;

function assertClosedObjects(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertClosedObjects(entry, `${path}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "object") {
    expect(record.additionalProperties, `${path} must fail closed`).toBe(false);
  }
  for (const [key, child] of Object.entries(record)) {
    assertClosedObjects(child, `${path}.${key}`);
  }
}

function collectConstants(
  value: unknown,
  output = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectConstants(entry, output));
    return output;
  }
  if (value === null || typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  if (typeof record.const === "string") output.add(record.const);
  Object.values(record).forEach((child) => collectConstants(child, output));
  return output;
}

describe("released draft 2020-12 schemas", () => {
  it("uses a closed object posture in every released schema", () => {
    for (const [name, baseline] of Object.entries(SCHEMAS)) {
      const schema = loadSchema(name);
      expect(schema.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(schema.$id).toBe(baseline.id);
      assertClosedObjects(schema);
    }
  });

  it("keeps emitted schema versions and package exports on one baseline", () => {
    const packageJson = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as {
      readonly exports: Readonly<Record<string, unknown>>;
    };
    for (const [name, baseline] of Object.entries(SCHEMAS)) {
      const constants = collectConstants(loadSchema(name));
      for (const version of baseline.versions) {
        expect(constants.has(version), `${name} must include ${version}`).toBe(
          true,
        );
      }
      const exportName = `./schemas/v1/${name.replace(".schema.json", "")}`;
      expect(packageJson.exports[exportName]).toEqual({
        default: `./schemas/v1/${name}`,
      });
    }
  });

  it("defines all ten closed result states and conservative binding rules", () => {
    const schema = loadSchema("common.schema.json");
    expect(schema.oneOf).toHaveLength(10);
    const definitions = schema.$defs as Record<string, Record<string, unknown>>;
    expect(
      (definitions.unavailable?.dependentRequired as Record<string, unknown>)
        .operationId,
    ).toEqual(["intentDigest", "account", "chainId", "deploymentId"]);
    expect(definitions.account?.additionalProperties).toBe(false);
    expect(definitions.coreBuild?.additionalProperties).toBe(false);
  });

  it("requires activation bindings and unavailable reasons conditionally", () => {
    const schema = loadSchema("capabilities.schema.json");
    const definitions = schema.$defs as Record<string, Record<string, unknown>>;
    const capability = definitions.capability;
    expect(capability?.additionalProperties).toBe(false);
    expect(capability?.allOf).toHaveLength(2);
    expect(
      (
        (capability?.allOf as Array<Record<string, unknown>>)[0]
          ?.then as Record<string, unknown>
      ).required,
    ).toEqual(["operatorBinding", "evidence"]);
    expect(
      (
        (capability?.allOf as Array<Record<string, unknown>>)[1]
          ?.else as Record<string, unknown>
      ).required,
    ).toEqual(["unavailableReason"]);
  });
});
