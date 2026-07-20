import { describe, expect, it } from "vitest";
import {
  assessLiveMintReadiness,
  type LiveMintMarketSnapshot,
} from "../src/live-mint-readiness.js";

function market(
  overrides: Partial<LiveMintMarketSnapshot> = {},
): LiveMintMarketSnapshot {
  return {
    poolId: "0xpool",
    poolName: "USDC / REF",
    chainId: 42161,
    expiry: "2030-01-01T00:00:00.000Z",
    isWhitelistEnabled: false,
    isDepositPaused: false,
    collateralSymbol: "USDC",
    ...overrides,
  };
}

describe("live mint readiness", () => {
  it("selects only current observations without a whitelist or deposit pause", () => {
    const eligible = market();
    const result = assessLiveMintReadiness([
      market({ isWhitelistEnabled: true }),
      market({ isDepositPaused: true }),
      eligible,
    ]);

    expect(result).toEqual({
      eligibilityState: "candidate-found",
      preparationState: "not-attempted",
      reason: "verified-production-write-evidence-required",
      candidates: [eligible],
      transactionPrepared: false,
    });
  });

  it("fails closed when the live observations contain no eligible market", () => {
    const result = assessLiveMintReadiness([
      market({ isWhitelistEnabled: true }),
      market({ isDepositPaused: true }),
    ]);

    expect(result).toEqual({
      eligibilityState: "no-eligible-market",
      preparationState: "not-attempted",
      reason: "no-current-unwhitelisted-unpaused-market",
      candidates: [],
      transactionPrepared: false,
    });
  });
});
