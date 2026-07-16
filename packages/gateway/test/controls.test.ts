import {
  createCapabilityInventory,
  evaluateCapabilityMaturity,
} from "@corkprotocol/operations";
import { describe, expect, it } from "vitest";
import {
  CredentialControl,
  MAX_REVOCATION_CACHE_AGE_MS,
  RevocationCache,
  STATIC_TOOL_CATALOG,
  ToolRouter,
  WorkAdmissionController,
  WorkAdmissionError,
  createMetricLabels,
  redactTelemetry,
  type CredentialClaims,
  type ToolHandlers,
  type WorkCost,
} from "../src/index.js";

const DIGEST = `sha256:${"11".repeat(32)}`;
const SOURCE_COMMIT = "22".repeat(20);

class TestClock {
  public value = 0;

  public nowMs(): number {
    return this.value;
  }
}

function claims(input?: Partial<CredentialClaims>): CredentialClaims {
  return {
    credentialId: "credential-a",
    principalId: "principal-a",
    ownerId: "owner-a",
    environment: "test",
    trafficClass: "public",
    scopes: ["capabilities:read", "action:write"],
    issuedAtMs: 0,
    revocationId: "revocation-a",
    ...input,
  };
}

const UNIT_COST: WorkCost = {
  concurrency: 1,
  upstream: 1,
  simulation: 1,
  queue: 1,
  responseBytes: 10,
  total: 1,
};

function admission(): WorkAdmissionController {
  return new WorkAdmissionController({
    perPrincipal: {
      concurrency: 2,
      upstream: 2,
      simulation: 2,
      queue: 2,
      responseBytes: 20,
      total: 2,
    },
    global: {
      concurrency: 3,
      upstream: 3,
      simulation: 3,
      queue: 3,
      responseBytes: 100,
      total: 3,
    },
    firstPartyReserve: {
      concurrency: 1,
      upstream: 1,
      simulation: 1,
      queue: 1,
    },
  });
}

describe("credential controls", () => {
  it("enforces expiry, review, and revocation refresh within 30 seconds", async () => {
    const clock = new TestClock();
    let revoked = false;
    let revocationChecks = 0;
    const cache = new RevocationCache({
      source: {
        isRevoked: async () => {
          revocationChecks += 1;
          return revoked;
        },
      },
      clock,
      maximumAgeMs: MAX_REVOCATION_CACHE_AGE_MS,
    });
    let returnedClaims = claims({ expiresAtMs: 100, reviewAtMs: 90 });
    const control = new CredentialControl({
      verifier: { verify: async () => returnedClaims },
      revocations: cache,
      clock,
    });

    expect((await control.authenticate("raw-secret")).ok).toBe(true);
    clock.value = 90;
    const review = await control.authenticate("raw-secret");
    expect(review.ok).toBe(false);
    if (!review.ok) {
      expect(review.failure.code).toBe("CREDENTIAL_REVIEW_REQUIRED");
    }
    returnedClaims = claims({ expiresAtMs: 100 });
    clock.value = 100;
    const expired = await control.authenticate("raw-secret");
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.failure.code).toBe("CREDENTIAL_EXPIRED");
    }

    returnedClaims = claims({ revocationId: "revocation-b" });
    clock.value = 1_000;
    expect((await control.authenticate("raw-secret")).ok).toBe(true);
    revoked = true;
    clock.value = 1_000 + MAX_REVOCATION_CACHE_AGE_MS - 1;
    expect((await control.authenticate("raw-secret")).ok).toBe(true);
    clock.value = 1_000 + MAX_REVOCATION_CACHE_AGE_MS;
    const denied = await control.authenticate("raw-secret");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.failure.code).toBe("CREDENTIAL_REVOKED");
    }
    expect(revocationChecks).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(control)).not.toContain("raw-secret");
  });

  it("rejects cache ages beyond the hard ceiling", () => {
    expect(
      () =>
        new RevocationCache({
          source: { isRevoked: async () => false },
          clock: new TestClock(),
          maximumAgeMs: MAX_REVOCATION_CACHE_AGE_MS + 1,
        }),
    ).toThrow();
  });
});

describe("weighted work and isolation controls", () => {
  it("enforces per-principal and global dimensions and releases idempotently", () => {
    const controller = admission();
    const first = controller.admit({
      principalId: "principal-a",
      trafficClass: "public",
      cost: UNIT_COST,
    });
    const second = controller.admit({
      principalId: "principal-a",
      trafficClass: "public",
      cost: UNIT_COST,
    });
    expect(() =>
      controller.admit({
        principalId: "principal-a",
        trafficClass: "public",
        cost: UNIT_COST,
      }),
    ).toThrow(WorkAdmissionError);
    first.release();
    first.release();
    second.release();
    expect(controller.snapshot()).toEqual({
      global: {
        concurrency: 0,
        upstream: 0,
        simulation: 0,
        queue: 0,
        responseBytes: 0,
        total: 0,
      },
      public: {
        concurrency: 0,
        upstream: 0,
        simulation: 0,
        queue: 0,
        responseBytes: 0,
        total: 0,
      },
      principals: {},
    });
  });

  it("preserves first-party capacity under public saturation", () => {
    const controller = admission();
    const publicA = controller.admit({
      principalId: "public-a",
      trafficClass: "public",
      cost: UNIT_COST,
    });
    const publicB = controller.admit({
      principalId: "public-b",
      trafficClass: "public",
      cost: UNIT_COST,
    });
    expect(() =>
      controller.admit({
        principalId: "public-c",
        trafficClass: "public",
        cost: UNIT_COST,
      }),
    ).toThrow(/reserved capacity/);
    const safety = controller.admit({
      principalId: "safety-a",
      trafficClass: "first-party",
      cost: UNIT_COST,
    });
    expect(controller.snapshot().global.concurrency).toBe(3);
    publicA.release();
    publicB.release();
    safety.release();
    expect(controller.snapshot().global.concurrency).toBe(0);
  });
});

describe("negative redaction", () => {
  it("deeply redacts all forbidden material and restricts metric label keys", () => {
    const original = {
      credential: "raw-credential",
      nested: {
        authorizationHeader: "Bearer secret",
        privateEndpoint: "https://private.example",
        signature: "0xsigned",
        calldata: "0x1234",
        typed_data: { message: "secret" },
        permit2Data: "permit-secret-payload",
        safeMessage: "message",
        safeConfirmations: ["confirmation"],
        safeTransactionBody: { to: "0x1" },
        signedOrder: { signature: "0x2" },
        orderBody: { maker: "0x3" },
      },
      allowed: "visible",
    };
    const redacted = redactTelemetry(original);
    const serialized = JSON.stringify(redacted);
    for (const forbidden of [
      "raw-credential",
      "secret",
      "private.example",
      "0xsigned",
      "0x1234",
      "permit-secret-payload",
      "confirmation",
      '"maker"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(redacted).toMatchObject({ allowed: "visible" });

    const labels = createMetricLabels({
      component: "gateway",
      operation: "pools-list",
      outcome: "success",
      environment: "test",
      attackerControlledKey: "must-not-become-a-label",
    } as Parameters<typeof createMetricLabels>[0]);
    expect(labels).toEqual({
      component: "gateway",
      operation: "pools-list",
      outcome: "success",
      environment: "test",
    });
  });

  it("proves hosted scopes never mutate onchain permission input", async () => {
    const actionId = "cork.phoenix.unwind.paired-shares-in.v1";
    const maturity = evaluateCapabilityMaturity(
      {
        capabilityId: actionId,
        version: "1",
        specified: true,
        commonProfileDigest: DIGEST,
        capabilityProfileDigest: DIGEST,
        vectorSetDigest: DIGEST,
      },
      {
        implementation: {
          commonProfileDigest: DIGEST,
          capabilityProfileDigest: DIGEST,
          vectorSetDigest: DIGEST,
        },
        operatorIntent: { deploymentId: "deployment-a", generation: "1" },
        evidence: {
          deploymentId: "deployment-a",
          generation: "1",
          status: "active",
        },
        healthy: true,
      },
    );
    const inventory = createCapabilityInventory(
      {
        packageVersion: "0.1.0",
        sourceCommit: SOURCE_COMMIT,
        schemaDigest: DIGEST,
      },
      [maturity],
    );
    let captured: unknown;
    const handlers = Object.fromEntries(
      STATIC_TOOL_CATALOG.map((tool) => [
        tool.handlerKey,
        async (input: unknown) => {
          captured = input;
          return {};
        },
      ]),
    ) as unknown as ToolHandlers;
    const router = new ToolRouter({
      capabilityInventory: () => inventory,
      handlers,
      admission: new WorkAdmissionController({
        perPrincipal: {
          concurrency: 10,
          upstream: 10,
          simulation: 10,
          queue: 10,
          responseBytes: 10_000_000,
          total: 100,
        },
        global: {
          concurrency: 10,
          upstream: 10,
          simulation: 10,
          queue: 10,
          responseBytes: 10_000_000,
          total: 100,
        },
        firstPartyReserve: {
          concurrency: 1,
          upstream: 1,
          simulation: 1,
          queue: 1,
        },
      }),
      clock: { nowMs: () => 0 },
    });
    const onchainInput = {
      chainId: "1",
      poolId: `0x${"11".repeat(32)}`,
      account: `0x${"22".repeat(20)}`,
      requestedShares: "10",
      minimumCollateral: "9",
      deadline: "100",
    };
    const result = await router.call({
      name: "cork.phoenix.unwind.paired-shares-in.prepare.v1",
      arguments: onchainInput,
      principal: claims({
        scopes: ["action:write", "capabilities:read"],
      }),
    });
    expect(result.ok).toBe(true);
    expect(captured).toEqual(onchainInput);
    expect(captured).not.toHaveProperty("scopes");
    expect(captured).not.toHaveProperty("onchainPermission");
  });
});
