import {
  decodeFunctionData,
  parseAbi,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Hex,
} from "viem";

const BUNDLER3_ABI = parseAbi([
  "function multicall((address to, bytes data, uint256 value, bool skipRevert, bytes32 callbackHash)[] bundle) payable",
  "function reenter((address to, bytes data, uint256 value, bool skipRevert, bytes32 callbackHash)[] bundle)",
]);

const CORK_ADAPTER_ABI = parseAbi([
  "function safeMint((bytes32 poolId, uint256 cptAndCstSharesOut, address receiver, uint256 maxCollateralAssetsIn, uint256 deadline) params)",
  "function safeDeposit((bytes32 poolId, uint256 collateralAssetsIn, address receiver, uint256 minCptAndCstSharesOut, uint256 deadline) params)",
  "function safeUnwindDeposit((bytes32 poolId, uint256 collateralAssetsOut, address owner, address receiver, uint256 maxCptAndCstSharesIn, uint256 deadline) params)",
  "function safeUnwindMint((bytes32 poolId, uint256 cptAndCstSharesIn, address owner, address receiver, uint256 minCollateralAssetsOut, uint256 deadline) params)",
  "function safeWithdraw((bytes32 poolId, uint256 collateralAssetsOut, address owner, address receiver, uint256 maxCptSharesIn, uint256 deadline) params)",
  "function safeWithdrawOther((bytes32 poolId, uint256 referenceAssetsOut, address owner, address receiver, uint256 maxCptSharesIn, uint256 deadline) params)",
  "function safeRedeem((bytes32 poolId, uint256 cptSharesIn, address owner, address receiver, uint256 minReferenceAssetsOut, uint256 minCollateralAssetsOut, uint256 deadline) params)",
  "function safeUnwindSwap((bytes32 poolId, uint256 collateralAssetsIn, address receiver, uint256 minReferenceAssetsOut, uint256 minCstSharesOut, uint256 deadline) params)",
  "function safeSwap((bytes32 poolId, uint256 collateralAssetsOut, address receiver, uint256 maxCstSharesIn, uint256 maxReferenceAssetsIn, uint256 deadline) params)",
  "function safeExercise((bytes32 poolId, uint256 cstSharesIn, address receiver, uint256 minCollateralAssetsOut, uint256 maxReferenceAssetsIn, uint256 deadline) params)",
  "function safeExerciseOther((bytes32 poolId, uint256 referenceAssetsIn, address receiver, uint256 minCollateralAssetsOut, uint256 maxCstSharesIn, uint256 deadline) params)",
  "function safeUnwindExercise((bytes32 poolId, uint256 cstSharesOut, address receiver, uint256 minReferenceAssetsOut, uint256 maxCollateralAssetsIn, uint256 deadline) params)",
  "function safeUnwindExerciseOther((bytes32 poolId, uint256 referenceAssetsOut, address receiver, uint256 minCstSharesOut, uint256 maxCollateralAssetsIn, uint256 deadline) params)",
]);

const COMMON_LEG_ABI = parseAbi([
  "function erc20TransferFrom(address token, address receiver, uint256 amount)",
  "function permit2TransferFrom(address token, address receiver, uint256 amount)",
  "function erc20Transfer(address token, address receiver, uint256 amount)",
  "function nativeTransfer(address receiver, uint256 amount)",
  "function permit2TransferFromWithPermit(((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature, address receiver, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
]);

const MAX_DEPTH = 8;
const MAX_LEGS = 256;
export const MAX_CALLDATA_BYTES = 1_000_000;

interface RawCall {
  readonly to: Hex;
  readonly data: Hex;
  readonly value: bigint;
  readonly skipRevert: boolean;
  readonly callbackHash: Hex;
}

export type DecodedCalldataLeg =
  | {
      readonly kind: "cork";
      readonly to: Hex;
      readonly action: string;
      readonly params: unknown;
      readonly value: string;
      readonly skipRevert: boolean;
    }
  | {
      readonly kind: "common";
      readonly to: Hex;
      readonly functionName: string;
      readonly arguments: readonly unknown[];
      readonly value: string;
      readonly skipRevert: boolean;
    }
  | {
      readonly kind: "bundle";
      readonly to: Hex;
      readonly legs: readonly DecodedCalldataLeg[];
      readonly value: string;
      readonly skipRevert: boolean;
    }
  | {
      readonly kind: "unknown";
      readonly to: Hex;
      readonly selector: Hex;
      readonly data: Hex;
      readonly value: string;
      readonly skipRevert: boolean;
    };

export interface DecodedBundler3Calldata {
  readonly schemaVersion: "cork.calldata-decoder/v1";
  readonly envelope: "multicall" | "reenter";
  readonly legs: readonly DecodedCalldataLeg[];
  readonly totalLegs: number;
  readonly limits: {
    readonly maximumDepth: number;
    readonly maximumLegs: number;
  };
}

function selectorMap(abi: Abi): ReadonlyMap<string, string> {
  return new Map(
    abi
      .filter((item): item is AbiFunction => item.type === "function")
      .map((item) => [toFunctionSelector(item).toLowerCase(), item.name]),
  );
}

const BUNDLER_SELECTORS = selectorMap(BUNDLER3_ABI);
const CORK_SELECTORS = selectorMap(CORK_ADAPTER_ABI);
const COMMON_SELECTORS = selectorMap(COMMON_LEG_ABI);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHex(value: unknown): value is Hex {
  return (
    typeof value === "string" &&
    /^0x(?:[0-9a-fA-F]{2})*$/u.test(value) &&
    value.length >= 2
  );
}

function rawCall(value: unknown): RawCall {
  if (
    !isRecord(value) ||
    !isHex(value["to"]) ||
    value["to"].length !== 42 ||
    !isHex(value["data"]) ||
    typeof value["value"] !== "bigint" ||
    typeof value["skipRevert"] !== "boolean" ||
    !isHex(value["callbackHash"]) ||
    value["callbackHash"].length !== 66
  ) {
    throw new TypeError("Bundler3 calldata contains an invalid call tuple");
  }
  return {
    to: value["to"],
    data: value["data"],
    value: value["value"],
    skipRevert: value["skipRevert"],
    callbackHash: value["callbackHash"],
  };
}

function decodedArguments(
  data: Hex,
  abi: Abi,
): {
  readonly functionName: string;
  readonly arguments: readonly unknown[];
} {
  const decoded = decodeFunctionData({ abi, data });
  return {
    functionName: decoded.functionName,
    arguments: (decoded.args ?? []) as readonly unknown[],
  };
}

function decodeCalls(data: Hex): readonly RawCall[] {
  const decoded = decodedArguments(data, BUNDLER3_ABI);
  const calls = decoded.arguments[0];
  if (!Array.isArray(calls)) {
    throw new TypeError("Bundler3 calldata omitted its call array");
  }
  return calls.map(rawCall);
}

function selector(data: Hex): Hex {
  return data.slice(0, 10).toLowerCase() as Hex;
}

function decodeLeg(
  call: RawCall,
  depth: number,
  counter: { count: number },
): DecodedCalldataLeg {
  counter.count += 1;
  if (counter.count > MAX_LEGS) {
    throw new RangeError(`Bundler3 calldata exceeds ${MAX_LEGS} legs`);
  }
  const callSelector = selector(call.data);
  const value = call.value.toString();
  if (BUNDLER_SELECTORS.has(callSelector)) {
    if (depth >= MAX_DEPTH) {
      throw new RangeError(`Bundler3 calldata exceeds depth ${MAX_DEPTH}`);
    }
    return {
      kind: "bundle",
      to: call.to,
      legs: decodeCalls(call.data).map((nested) =>
        decodeLeg(nested, depth + 1, counter),
      ),
      value,
      skipRevert: call.skipRevert,
    };
  }
  if (CORK_SELECTORS.has(callSelector)) {
    const decoded = decodedArguments(call.data, CORK_ADAPTER_ABI);
    return {
      kind: "cork",
      to: call.to,
      action: decoded.functionName,
      params: decoded.arguments[0],
      value,
      skipRevert: call.skipRevert,
    };
  }
  if (COMMON_SELECTORS.has(callSelector)) {
    const decoded = decodedArguments(call.data, COMMON_LEG_ABI);
    return {
      kind: "common",
      to: call.to,
      functionName: decoded.functionName,
      arguments: decoded.arguments,
      value,
      skipRevert: call.skipRevert,
    };
  }
  return {
    kind: "unknown",
    to: call.to,
    selector: callSelector,
    data: call.data,
    value,
    skipRevert: call.skipRevert,
  };
}

export function decodeBundler3Calldata(data: string): DecodedBundler3Calldata {
  if (!isHex(data) || data.length < 10) {
    throw new TypeError("data must be even-length hexadecimal calldata");
  }
  if ((data.length - 2) / 2 > MAX_CALLDATA_BYTES) {
    throw new RangeError(
      `Bundler3 calldata exceeds ${MAX_CALLDATA_BYTES} bytes`,
    );
  }
  const topLevelSelector = selector(data);
  const envelope = BUNDLER_SELECTORS.get(topLevelSelector);
  if (envelope !== "multicall" && envelope !== "reenter") {
    throw new TypeError("data is not Bundler3 multicall or reenter calldata");
  }
  const counter = { count: 0 };
  const legs = decodeCalls(data).map((call) => decodeLeg(call, 1, counter));
  return {
    schemaVersion: "cork.calldata-decoder/v1",
    envelope,
    legs,
    totalLegs: counter.count,
    limits: {
      maximumDepth: MAX_DEPTH,
      maximumLegs: MAX_LEGS,
    },
  };
}
