import { CAPPED_INPUT_CAPABILITY_IDS } from "@corkprotocol/operations";
import { describe, expect, it } from "vitest";
import {
  createLocalFixtureGateway,
  LOCAL_FIXTURE_NOTICE,
  LOCAL_FIXTURE_TOOL_CATALOG,
} from "../src/dev-fixture.js";
import { LOCAL_FIXTURE_MARKETS } from "../src/dev-safe-fixture.js";
import { STATIC_TOOL_CATALOG } from "../src/router.js";

const SAFE_UNWIND_INPUT = {
  marketId: LOCAL_FIXTURE_MARKETS[0]!.id,
  requestedSharesIn: "2500000000000",
  minimumCollateralAssetsOut: "1000000",
  safeNonce: "7",
} as const;

describe("local fixture gateway", () => {
  it("discovers the complete safe fixture catalog and omits capped-input tools", () => {
    const fixture = createLocalFixtureGateway();
    const tools = fixture.router.listTools(fixture.principal);

    expect(tools).toHaveLength(
      STATIC_TOOL_CATALOG.length + LOCAL_FIXTURE_TOOL_CATALOG.length,
    );
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
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "cork.local.markets.list.v1",
        "cork.local.safe.unwind.prepare.v1",
        "cork.local.safe.coverage.v1",
      ]),
    );
  });

  it("constructs a non-broadcast Safe proposal for every supported action profile", async () => {
    const fixture = createLocalFixtureGateway();
    const result = await fixture.router.call({
      name: "cork.local.safe.coverage.v1",
      arguments: {
        marketId: LOCAL_FIXTURE_MARKETS[0]!.id,
        baseSafeNonce: "7",
      },
      principal: fixture.principal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const core = result.coreResult as {
      readonly fixtureOnly: boolean;
      readonly broadcastReady: boolean;
      readonly actions: readonly {
        readonly profile: string;
        readonly coreFunction: string;
        readonly safeProposal: {
          readonly nonce: string;
          readonly safeTxHash: string;
          readonly transactionAuthorization: string;
        };
      }[];
      readonly safety: {
        readonly proposalsSubmitted: boolean;
        readonly safeConfirmationsCollected: boolean;
        readonly chainSimulationPerformed: boolean;
        readonly executionClaimed: boolean;
      };
    };
    expect(core.fixtureOnly).toBe(true);
    expect(core.broadcastReady).toBe(false);
    expect(
      core.actions.map(({ profile, coreFunction }) => ({
        profile,
        coreFunction,
      })),
    ).toEqual([
      { profile: "paired-shares-unwind", coreFunction: "safeUnwindMint" },
      { profile: "mint-collateral-in", coreFunction: "safeDeposit" },
      { profile: "mint-paired-shares-out", coreFunction: "safeMint" },
      {
        profile: "repurchase-collateral-in-for-swap",
        coreFunction: "safeUnwindSwap",
      },
      { profile: "unwind-collateral-out", coreFunction: "safeUnwindDeposit" },
      { profile: "redeem-principal-token-in", coreFunction: "safeRedeem" },
    ]);
    expect(core.actions.map((action) => action.safeProposal.nonce)).toEqual([
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
    expect(
      new Set(core.actions.map((action) => action.safeProposal.safeTxHash))
        .size,
    ).toBe(core.actions.length);
    for (const action of core.actions) {
      expect(action.safeProposal.safeTxHash).toMatch(/^0x[0-9a-f]{64}$/u);
      expect(action.safeProposal.transactionAuthorization).toBe(
        "caller-owned-not-collected",
      );
      expect(JSON.stringify(action.safeProposal)).not.toContain(
        "confirmations",
      );
    }
    expect(core.safety).toEqual({
      source: "synthetic-local-fixture",
      proposalsSubmitted: false,
      safeConfirmationsCollected: false,
      chainSimulationPerformed: false,
      executionClaimed: false,
    });
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

  it("lists only explicitly synthetic markets", async () => {
    const fixture = createLocalFixtureGateway();
    const result = await fixture.router.call({
      name: "cork.local.markets.list.v1",
      arguments: {},
      principal: fixture.principal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coreResult).toMatchObject({
      schemaVersion: "cork.local-market-list/v1",
      fixtureOnly: true,
      notice: LOCAL_FIXTURE_NOTICE,
      markets: [
        {
          id: "synthetic-weth-usdc-2027",
          network: "local-fixture",
          supportedAction: "unwind-paired-shares",
        },
        {
          id: "synthetic-wsteth-usdc-2027",
          network: "local-fixture",
          supportedAction: "unwind-paired-shares",
        },
      ],
    });
  });

  it("constructs canonical unwind calldata and an unsigned Safe transaction", async () => {
    const fixture = createLocalFixtureGateway();
    const result = await fixture.router.call({
      name: "cork.local.safe.unwind.prepare.v1",
      arguments: SAFE_UNWIND_INPUT,
      principal: fixture.principal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coreResult).toMatchObject({
      schemaVersion: "cork.local-safe-transaction-demo/v1",
      fixtureOnly: true,
      broadcastReady: false,
      market: {
        id: SAFE_UNWIND_INPUT.marketId,
        network: "local-fixture",
      },
      prepared: {
        schemaVersion: "cork.prepared-unwind/v1",
        constraints: {
          requestedSharesIn: "2500000000000",
          effectiveSharesIn: "2000000000000",
          shareQuantum: "1000000000000",
          transactionValue: "0",
          callCount: "3",
        },
      },
      finalized: {
        schemaVersion: "cork.finalized-unwind/v1",
        execution: { kind: "bundler-call", value: "0" },
      },
      safeTransaction: {
        schemaVersion: "cork.safe-execution-wrapper/v1",
        value: "0",
        operation: "call",
        nonce: "7",
        transactionAuthorization: "caller-owned-not-collected",
      },
      safety: {
        networkAccess: false,
        productionEvidenceUsed: false,
        productionSignaturesUsed: false,
        safeConfirmationsCollected: false,
        transactionSubmitted: false,
      },
    });
    const core = result.coreResult as {
      readonly finalized: {
        readonly execution: { readonly to: string; readonly data: string };
      };
      readonly safeTransaction: {
        readonly to: string;
        readonly data: string;
        readonly safeTxHash: string;
      };
    };
    expect(core.safeTransaction.to).toBe(core.finalized.execution.to);
    expect(core.safeTransaction.data).toBe(core.finalized.execution.data);
    expect(core.safeTransaction.data).toMatch(/^0x[0-9a-f]+$/u);
    expect(core.safeTransaction.safeTxHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(JSON.stringify(core.safeTransaction)).not.toContain("confirmations");
  });

  it("is deterministic and binds nonce and market identity correctly", async () => {
    const fixture = createLocalFixtureGateway();
    const call = (safeNonce: string) =>
      fixture.router.call({
        name: "cork.local.safe.unwind.prepare.v1",
        arguments: { ...SAFE_UNWIND_INPUT, safeNonce },
        principal: fixture.principal,
      });
    const [first, repeated, nextNonce] = await Promise.all([
      call("7"),
      call("7"),
      call("8"),
    ]);
    const otherMarket = await fixture.router.call({
      name: "cork.local.safe.unwind.prepare.v1",
      arguments: {
        ...SAFE_UNWIND_INPUT,
        marketId: LOCAL_FIXTURE_MARKETS[1]!.id,
      },
      principal: fixture.principal,
    });

    expect(first).toEqual(repeated);
    expect(first.ok).toBe(true);
    expect(nextNonce.ok).toBe(true);
    expect(otherMarket.ok).toBe(true);
    if (!first.ok || !nextNonce.ok || !otherMarket.ok) return;
    const firstSafe = first.coreResult as {
      readonly safeTransaction: {
        readonly data: string;
        readonly safeTxHash: string;
      };
    };
    const nextSafe = nextNonce.coreResult as typeof firstSafe;
    const otherSafe = otherMarket.coreResult as typeof firstSafe;
    expect(nextSafe.safeTransaction.data).toBe(firstSafe.safeTransaction.data);
    expect(nextSafe.safeTransaction.safeTxHash).not.toBe(
      firstSafe.safeTransaction.safeTxHash,
    );
    expect(otherSafe.safeTransaction.data).not.toBe(
      firstSafe.safeTransaction.data,
    );
    expect(otherSafe.safeTransaction.safeTxHash).not.toBe(
      firstSafe.safeTransaction.safeTxHash,
    );
  });

  it("rejects unknown markets, sub-quantum amounts, and extra fields", async () => {
    const fixture = createLocalFixtureGateway();
    const call = (argumentsValue: unknown) =>
      fixture.router.call({
        name: "cork.local.safe.unwind.prepare.v1",
        arguments: argumentsValue,
        principal: fixture.principal,
      });

    await expect(
      call({ ...SAFE_UNWIND_INPUT, marketId: "not-a-market" }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: expect.stringMatching(/market/u),
      },
    });
    await expect(
      call({ ...SAFE_UNWIND_INPUT, requestedSharesIn: "999999999999" }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: expect.stringMatching(/share quantum/u),
      },
    });
    await expect(
      call({ ...SAFE_UNWIND_INPUT, unexpected: true }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: expect.stringMatching(/not allowed/u),
      },
    });
  });

  it("fails closed for cancelled and expired local requests", async () => {
    const fixture = createLocalFixtureGateway();
    const controller = new AbortController();
    controller.abort();

    await expect(
      fixture.router.call({
        name: "cork.local.safe.unwind.prepare.v1",
        arguments: SAFE_UNWIND_INPUT,
        principal: fixture.principal,
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "REQUEST_CANCELLED", message: "request was cancelled" },
    });
    await expect(
      fixture.router.call({
        name: "cork.local.safe.unwind.prepare.v1",
        arguments: SAFE_UNWIND_INPUT,
        principal: fixture.principal,
        deadlineAtMs: 0,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "DEADLINE_EXCEEDED",
        message: "request deadline elapsed",
      },
    });
  });
});
