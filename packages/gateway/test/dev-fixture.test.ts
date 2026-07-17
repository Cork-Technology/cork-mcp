import { CAPPED_INPUT_CAPABILITY_IDS } from "@corkprotocol/operations";
import { describe, expect, it } from "vitest";
import {
  createLocalFixtureGateway,
  LOCAL_FIXTURE_NOTICE,
} from "../src/dev-fixture.js";
import { STATIC_TOOL_CATALOG } from "../src/router.js";

describe("local fixture gateway", () => {
  it("discovers the complete safe fixture catalog and omits capped-input tools", () => {
    const fixture = createLocalFixtureGateway();
    const tools = fixture.router.listTools(fixture.principal);

    expect(tools).toHaveLength(STATIC_TOOL_CATALOG.length);
    expect(tools.some((tool) => tool.name === "cork.capabilities.v1")).toBe(
      true,
    );
    for (const capabilityId of CAPPED_INPUT_CAPABILITY_IDS) {
      expect(tools.some((tool) => tool.capabilityId === capabilityId)).toBe(
        false,
      );
      expect(
        fixture.inventory.capabilities.find(
          (capability) => capability.capabilityId === capabilityId,
        )?.unavailableReason?.code,
      ).toBe("CAPPED_INPUT_PROTOCOL_UNAVAILABLE");
    }
  });

  it("returns labeled in-memory fixture data without external side effects", async () => {
    const fixture = createLocalFixtureGateway();
    const result = await fixture.router.call({
      name: "cork.capabilities.v1",
      arguments: {},
      principal: fixture.principal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.coreResult).toMatchObject({
      fixtureOnly: true,
      notice: LOCAL_FIXTURE_NOTICE,
      handler: "capability-inventory",
      inventory: {
        schemaVersion: "cork.capabilities/v1",
      },
    });
    expect(result.transportMetadata.environment).toBe("local-fixture");
  });

  it("retains closed-input validation in fixture mode", async () => {
    const fixture = createLocalFixtureGateway();
    const result = await fixture.router.call({
      name: "cork.capabilities.v1",
      arguments: { unexpected: true },
      principal: fixture.principal,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "cork.capabilities.v1 input contains an unknown field",
      },
    });
  });
});
