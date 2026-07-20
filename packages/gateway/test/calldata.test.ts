import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { decodeBundler3Calldata, MAX_CALLDATA_BYTES } from "../src/calldata.js";

const BUNDLER_ABI = parseAbi([
  "function multicall((address to, bytes data, uint256 value, bool skipRevert, bytes32 callbackHash)[] bundle) payable",
]);
const CORK_ABI = parseAbi([
  "function safeMint((bytes32 poolId, uint256 cptAndCstSharesOut, address receiver, uint256 maxCollateralAssetsIn, uint256 deadline) params)",
]);
const TARGET = `0x${"11".repeat(20)}` as const;
const RECEIVER = `0x${"22".repeat(20)}` as const;
const POOL_ID = `0x${"33".repeat(32)}` as const;
const ZERO_HASH = `0x${"00".repeat(32)}` as const;

describe("Bundler3 calldata decoder", () => {
  it("decodes Cork actions and preserves unknown legs", () => {
    const corkData = encodeFunctionData({
      abi: CORK_ABI,
      functionName: "safeMint",
      args: [
        {
          poolId: POOL_ID,
          cptAndCstSharesOut: 10n,
          receiver: RECEIVER,
          maxCollateralAssetsIn: 12n,
          deadline: 20n,
        },
      ],
    });
    const data = encodeFunctionData({
      abi: BUNDLER_ABI,
      functionName: "multicall",
      args: [
        [
          {
            to: TARGET,
            data: corkData,
            value: 0n,
            skipRevert: false,
            callbackHash: ZERO_HASH,
          },
          {
            to: TARGET,
            data: "0x12345678",
            value: 1n,
            skipRevert: true,
            callbackHash: ZERO_HASH,
          },
        ],
      ],
    });

    const decoded = decodeBundler3Calldata(data);
    expect(decoded).toMatchObject({
      schemaVersion: "cork.calldata-decoder/v1",
      envelope: "multicall",
      totalLegs: 2,
      legs: [
        { kind: "cork", action: "safeMint", value: "0" },
        {
          kind: "unknown",
          selector: "0x12345678",
          data: "0x12345678",
          value: "1",
          skipRevert: true,
        },
      ],
    });
  });

  it("rejects non-Bundler3 and malformed calldata", () => {
    expect(() => decodeBundler3Calldata("0x12345678")).toThrow("not Bundler3");
    expect(() => decodeBundler3Calldata("0x123")).toThrow("even-length");
    expect(() =>
      decodeBundler3Calldata(`0x${"00".repeat(MAX_CALLDATA_BYTES + 1)}`),
    ).toThrow("exceeds");
  });
});
