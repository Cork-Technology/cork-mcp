import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LIMIT_ORDER_PROTOCOL_ADDRESS,
  LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  type LimitOrderDeploymentV1,
  type LimitOrderMakerIntentV1,
  type Sha256Digest,
} from "../src/index.js";
import {
  buildMakerTraitsV1,
  deriveLimitOrderIdentity,
  parseMakerTraitsV1,
  prepareLimitOrderMaker,
} from "../src/limit-orders.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (nibble: string) => `0x${nibble.repeat(40)}`;

const DEPLOYMENT: LimitOrderDeploymentV1 = {
  schemaVersion: "cork.limit-order-deployment/v1",
  deploymentId: "phoenix-mainnet",
  chainId: "1",
  status: "active",
  protocolAddress: LIMIT_ORDER_PROTOCOL_ADDRESS,
  protocolVersion: "4.3.2",
  protocolSourceCommit: LIMIT_ORDER_PROTOCOL_SOURCE_COMMIT,
  sdkVersion: "4.3.0",
  sdkSourceCommit: "5e0c09c3d2df34923c07c3d3805afa657d8db28f",
  manifestDigest: digest("1"),
};

const INTENT: LimitOrderMakerIntentV1 = {
  schemaVersion: "cork.limit-order-maker-intent/v1",
  clientRequestId: "maker-identity-1",
  chainId: "1",
  deploymentId: "phoenix-mainnet",
  verifiedMarket: {
    schemaVersion: "cork.limit-order-market/v1",
    verifiedMarketDigest: digest("2"),
    chainId: "1",
    deploymentId: "phoenix-mainnet",
    poolId: `0x${"a".repeat(64)}`,
    makerAsset: address("1"),
    takerAsset: address("2"),
  },
  makerAccount: {
    kind: "externally-owned-account",
    address: address("3"),
  },
  receiver: address("3"),
  makerAsset: address("1"),
  takerAsset: address("2"),
  makingAmount: "100",
  takingAmount: "50",
  expiry: "2000000000",
  partialFillPreference: "single-fill",
  extensionProfile: "none",
  side: "SELL",
  premiumMetadata: { source: "test" },
};

describe("source-faithful limit-order identity", () => {
  it("pins traits, deterministic nonce/salt, and the plain extension profile", () => {
    const first = deriveLimitOrderIdentity(INTENT, DEPLOYMENT);
    const retry = deriveLimitOrderIdentity(INTENT, DEPLOYMENT);
    expect(retry).toEqual(first);
    expect(first.order).toEqual({
      salt: first.salt,
      maker: address("3"),
      receiver: address("3"),
      makerAsset: address("1"),
      takerAsset: address("2"),
      makingAmount: "100",
      takingAmount: "50",
      makerTraits: first.makerTraits.raw,
    });
    expect(first.makerTraits).toMatchObject({
      noPartialFills: true,
      allowMultipleFills: false,
      usePermit2: false,
      unwrapWeth: false,
      hasExtension: false,
      series: "0",
      allowedSender: "0",
      invalidatorRegime: "bit-invalidator",
    });
    expect(parseMakerTraitsV1(first.makerTraits.raw)).toEqual(
      first.makerTraits,
    );
  });

  it("rejects forbidden flags, invalid combinations, and Permit2 authority", () => {
    const valid = buildMakerTraitsV1({
      partialFillPreference: "partial-multiple-fill",
      nonceOrEpoch: "7",
      expiry: "8",
    });
    expect(valid.invalidatorRegime).toBe("remaining-invalidator");
    expect(() =>
      parseMakerTraitsV1((BigInt(valid.raw) | (1n << 248n)).toString()),
    ).toThrow(/forbidden/u);
    expect(() =>
      parseMakerTraitsV1(((1n << 255n) | (1n << 254n)).toString()),
    ).toThrow(/forbidden/u);

    expect(() =>
      prepareLimitOrderMaker(
        {
          intent: INTENT,
          deployment: DEPLOYMENT,
          inventory: {} as never,
          identityState: {} as never,
          currentAllowance: "0",
          zeroFirst: false,
          authorityMode: "permit2",
        } as never,
        { verify: () => true },
      ),
    ).toThrow(/Permit2 is forbidden/u);
  });

  it("keeps the browser runtime free of Node and ambient side effects", () => {
    const source = readFileSync(join(ROOT, "src", "limit-orders.ts"), "utf8");
    for (const forbidden of [
      /\bnode:/u,
      /\bBuffer\b/u,
      /\bprocess\b/u,
      /\bfetch\s*\(/u,
      /\bsetTimeout\b/u,
      /\bsetInterval\b/u,
      /\blocalStorage\b/u,
      /\bsessionStorage\b/u,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
      expect(match[1]).toMatch(/^\.\//u);
    }
  });
});
