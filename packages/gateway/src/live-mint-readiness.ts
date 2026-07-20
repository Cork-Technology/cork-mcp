export interface LiveMintMarketSnapshot {
  readonly poolId: string;
  readonly poolName: string;
  readonly chainId: number;
  readonly expiry: string;
  readonly isWhitelistEnabled: boolean;
  readonly isDepositPaused: boolean;
  readonly collateralSymbol: string;
}

export interface LiveMintReadiness {
  readonly eligibilityState: "candidate-found" | "no-eligible-market";
  readonly preparationState: "not-attempted";
  readonly reason:
    | "verified-production-write-evidence-required"
    | "no-current-unwhitelisted-unpaused-market";
  readonly candidates: readonly LiveMintMarketSnapshot[];
  readonly transactionPrepared: false;
}

export function assessLiveMintReadiness(
  currentMarkets: readonly LiveMintMarketSnapshot[],
): LiveMintReadiness {
  const candidates = currentMarkets.filter(
    (market) => !market.isWhitelistEnabled && !market.isDepositPaused,
  );
  if (candidates.length === 0) {
    return Object.freeze({
      eligibilityState: "no-eligible-market" as const,
      preparationState: "not-attempted" as const,
      reason: "no-current-unwhitelisted-unpaused-market" as const,
      candidates: Object.freeze(candidates),
      transactionPrepared: false as const,
    });
  }
  return Object.freeze({
    eligibilityState: "candidate-found" as const,
    preparationState: "not-attempted" as const,
    reason: "verified-production-write-evidence-required" as const,
    candidates: Object.freeze(candidates),
    transactionPrepared: false as const,
  });
}
