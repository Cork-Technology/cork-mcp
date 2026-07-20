import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  keccak256,
  padHex,
  parseAbiParameters,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { proveSafeMarketPackage } from "./safe-market-proof.js";

export const SAFE_MARKET_PROFILE = "susds-susde-liquidity-impairment" as const;

const REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
export const SAFE_MARKET_OUTPUT_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  "artifacts/safe/susds-susde-liquidity-impairment",
);
const ORACLE_ROOT = resolve(REPOSITORY_ROOT, "contracts/oracle");
const ORACLE_ARTIFACT = resolve(
  ORACLE_ROOT,
  "out/SUsdePerSUsdsRateOracle.sol/SUsdePerSUsdsRateOracle.json",
);

export const SAFE_MARKET_CATALOG = Object.freeze({
  chainId: 42_161n,
  safe: getAddress("0x7ef5645c930122bf587e45d814ecd6f92dac41fc"),
  timelock: getAddress("0x1f5Ad00e74BC2cd665B1e5da7be9a96DA8008138"),
  controller: getAddress("0x8974fF6ef0eFCc143C01C6A596b026FdEB9Ff350"),
  factory: getAddress("0xce0042B868300000d44A59004Da54A005ffdcf9f"),
  collateral: getAddress("0xdDb46999F8891663a8F2828d25298f70416d7610"),
  reference: getAddress("0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2"),
  sUsdsUsdsFeed: getAddress("0x2483326d19f780Fb082f333Fe124e4C075B207ba"),
  sUsdeUsdFeed: getAddress("0xf2215b9c35b1697B5f47e407c917a40D055E68d7"),
  usdeUsdFeed: getAddress("0x88AC7Bca36567525A866138F03a6F6844868E0Bc"),
  sequencerFeed: getAddress("0xFdB631F5EE196F0ed6FAa767959853A9F217697D"),
  duration: 604_800n,
  sUsdsUsdsMaximumAge: 86_400n,
  sUsdeUsdMaximumAge: 86_400n,
  usdeUsdMaximumAge: 86_400n,
  sequencerGracePeriod: 3_600n,
  swapFee: 300_000_000_000_000_000n,
  unwindSwapFee: 300_000_000_000_000_000n,
  rateChangePerDayMax: 500_000_000_000_000n,
  rateChangeCapacityMax: 3_500_000_000_000_000n,
});

const ZERO_ADDRESS = getAddress("0x0000000000000000000000000000000000000000");
const SENTINEL_MODULES = getAddress(
  "0x0000000000000000000000000000000000000001",
);
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;
const SAFE_GUARD_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SAFE_FALLBACK_SLOT =
  "0x6c9a6c4a39284e37ed1cf53a95dc28c1f46e633702ef4c02c0f9b7a5dfffb5a";

export interface SafeMarketRpcConfig {
  readonly primaryUrl: string;
  readonly secondaryUrl: string;
}

export interface SafeMarketTuple {
  readonly collateralAsset: Address;
  readonly referenceAsset: Address;
  readonly expiryTimestamp: bigint;
  readonly rateMin: bigint;
  readonly rateMax: bigint;
  readonly rateChangePerDayMax: bigint;
  readonly rateChangeCapacityMax: bigint;
  readonly rateOracle: Address;
}

export interface SafeBuilderFile {
  readonly version: "1.0";
  readonly chainId: "42161";
  readonly createdAt: number;
  readonly meta: {
    readonly name: string;
    readonly description: string;
    readonly txBuilderVersion: "1.18.0";
    readonly createdFromSafeAddress: Address;
    readonly createdFromOwnerAddress: Address;
    readonly checksum: Hex;
  };
  readonly transactions: readonly [
    {
      readonly to: Address;
      readonly value: "0";
      readonly data: Hex;
      readonly contractMethod: null;
      readonly contractInputsValues: null;
    },
  ];
}

export interface SafeMarketBuildContext {
  readonly rpcUrl: string;
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly safe: Address;
  readonly owner: Address;
  readonly safeNonce: bigint;
  readonly timelock: Address;
  readonly poolManager: Address;
  readonly whitelistManager: Address;
  readonly oracle: Address;
  readonly market: SafeMarketTuple;
  readonly marketId: Hex;
  readonly operationId: Hex;
  readonly scheduleData: Hex;
  readonly executeData: Hex;
  readonly minimumDelay: bigint;
  readonly outputDirectory: string;
}

interface RpcBlock {
  readonly number: Hex;
  readonly hash: Hex;
  readonly parentHash: Hex;
  readonly timestamp: Hex;
}

interface FeedRound {
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly startedAt: bigint;
  readonly updatedAt: bigint;
  readonly answeredInRound: bigint;
}

interface QuorumSnapshot {
  readonly block: {
    readonly number: string;
    readonly hash: Hex;
    readonly parentHash: Hex;
    readonly timestamp: string;
  };
  readonly safe: {
    readonly singleton: Address;
    readonly version: string;
    readonly owners: readonly Address[];
    readonly threshold: string;
    readonly nonce: string;
    readonly modules: readonly Address[];
    readonly modulesNext: Address;
    readonly guard: Address;
    readonly fallbackHandler: Address;
  };
  readonly timelock: {
    readonly minimumDelay: string;
    readonly roles: Readonly<Record<string, boolean>>;
  };
  readonly controller: {
    readonly poolManager: Address;
    readonly whitelistManager: Address;
    readonly poolCreatorRole: Hex;
    readonly timelockIsPoolCreator: boolean;
    readonly paused: boolean;
  };
  readonly codeHashes: Readonly<Record<string, Hex>>;
  readonly tokenDecimals: readonly [number, number];
  readonly feeds: {
    readonly sUsdsUsds: FeedRound & { readonly decimals: number };
    readonly sUsdeUsd: FeedRound & { readonly decimals: number };
    readonly usdeUsd: FeedRound & { readonly decimals: number };
    readonly sequencer: FeedRound & { readonly decimals: number };
  };
}

export interface SafeMarketPreviewResult {
  readonly schemaVersion: "cork.safe-market-preview/v1";
  readonly profile: typeof SAFE_MARKET_PROFILE;
  readonly outputDirectory: string;
  readonly pinnedBlock: string;
  readonly pinnedBlockHash: Hex;
  readonly marketId: Hex;
  readonly predictedOracle: Address;
  readonly operationId: Hex;
  readonly readiness: "mechanically-valid-governance-nonconforming";
  readonly broadcastReady: false;
  readonly proofStatus: SafeMarketProofStatus;
  readonly outputHashes: Readonly<Record<string, string>>;
}

export type SafeMarketProofStatus = "passed" | "not-run";

export interface SafeMarketProofRecord {
  readonly status: SafeMarketProofStatus;
  readonly forkProvider: "primary quorum provider" | null;
  readonly forkBlock: bigint | null;
  readonly exactBuilderBytes: boolean;
  readonly safeNonceBefore: string | null;
  readonly safeNonceAfter: string | null;
  readonly assertions: readonly string[];
}

const MARKET_PARAMETERS = parseAbiParameters(
  "(address collateralAsset,address referenceAsset,uint256 expiryTimestamp,uint256 rateMin,uint256 rateMax,uint256 rateChangePerDayMax,uint256 rateChangeCapacityMax,address rateOracle)",
);
const CREATE_POOL_ABI = [
  {
    type: "function",
    name: "createNewPool",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "pool",
            type: "tuple",
            components: MARKET_PARAMETERS[0]!.components,
          },
          { name: "unwindSwapFeePercentage", type: "uint256" },
          { name: "swapFeePercentage", type: "uint256" },
          { name: "isWhitelistEnabled", type: "bool" },
        ],
      },
    ],
    outputs: [],
  },
] as const;
const FACTORY_ABI = [
  {
    type: "function",
    name: "deploy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "initCode", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "createdContract", type: "address" }],
  },
] as const;
const TIMELOCK_ABI = [
  {
    type: "function",
    name: "scheduleBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "payloads", type: "bytes[]" },
      { name: "predecessor", type: "bytes32" },
      { name: "salt", type: "bytes32" },
      { name: "delay", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "payable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "payloads", type: "bytes[]" },
      { name: "predecessor", type: "bytes32" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

let rpcIdentifier = 0;

function assertHex(value: unknown, label: string): asserts value is Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/u.test(value)) {
    throw new TypeError(`${label} is not hexadecimal`);
  }
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} is not an object`);
  }
}

async function rpc(
  url: string,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: (rpcIdentifier += 1),
      method,
      params,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`RPC ${method} returned HTTP ${response.status}`);
  const payload: unknown = await response.json();
  assertRecord(payload, `RPC ${method} response`);
  if (payload["error"] !== undefined) {
    throw new Error(`RPC ${method} returned an error`);
  }
  if (!("result" in payload)) throw new Error(`RPC ${method} omitted result`);
  return payload["result"];
}

async function getBlock(url: string, tag: string): Promise<RpcBlock> {
  const value = await rpc(url, "eth_getBlockByNumber", [tag, false]);
  assertRecord(value, "block");
  const number = value["number"];
  const hash = value["hash"];
  const parentHash = value["parentHash"];
  const timestamp = value["timestamp"];
  assertHex(number, "block number");
  assertHex(hash, "block hash");
  assertHex(parentHash, "parent hash");
  assertHex(timestamp, "block timestamp");
  if (hash.length !== 66 || parentHash.length !== 66) {
    throw new TypeError("block hashes must be bytes32");
  }
  return { number, hash, parentHash, timestamp };
}

async function callHex(
  url: string,
  address: Address,
  data: Hex,
  blockNumber: bigint,
): Promise<Hex> {
  const value = await rpc(url, "eth_call", [
    { to: address, data },
    `0x${blockNumber.toString(16)}`,
  ]);
  assertHex(value, "eth_call result");
  return value;
}

async function storageAddress(
  url: string,
  address: Address,
  slot: Hex,
  blockNumber: bigint,
): Promise<Address> {
  const value = await rpc(url, "eth_getStorageAt", [
    address,
    slot,
    `0x${blockNumber.toString(16)}`,
  ]);
  assertHex(value, "storage value");
  if (value.length !== 66) throw new TypeError("storage value must be bytes32");
  return getAddress(`0x${value.slice(-40)}`);
}

async function codeHash(
  url: string,
  address: Address,
  blockNumber: bigint,
): Promise<Hex> {
  const value = await rpc(url, "eth_getCode", [
    address,
    `0x${blockNumber.toString(16)}`,
  ]);
  assertHex(value, "runtime code");
  if (value === "0x") throw new Error(`required code is absent at ${address}`);
  return keccak256(value);
}

async function rawCode(
  url: string,
  address: Address,
  blockNumber: bigint,
): Promise<Hex> {
  const value = await rpc(url, "eth_getCode", [
    address,
    `0x${blockNumber.toString(16)}`,
  ]);
  assertHex(value, "runtime code");
  return value;
}

async function staticCall(
  url: string,
  address: Address,
  signature: string,
  output: string,
  blockNumber: bigint,
  args: readonly unknown[] = [],
): Promise<readonly unknown[]> {
  const [name = ""] = signature.split("(");
  const inputsText = signature.slice(name.length + 1, -1);
  const inputs = inputsText.length === 0 ? [] : inputsText.split(",");
  const parameters = inputs.map((type, index) => ({
    type,
    name: `arg${index}`,
  }));
  const abi = [
    {
      type: "function",
      name,
      stateMutability: "view",
      inputs: parameters,
      outputs: output.length === 0 ? [] : parseAbiParameters(output),
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: name,
    args: args as never,
  });
  const returned = await callHex(url, address, data, blockNumber);
  return output.length === 0
    ? []
    : (decodeAbiParameters(
        parseAbiParameters(output),
        returned,
      ) as readonly unknown[]);
}

function toAddress(value: unknown, label: string): Address {
  if (typeof value !== "string")
    throw new TypeError(`${label} is not an address`);
  return getAddress(value);
}

function toBigint(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  throw new TypeError(`${label} is not an integer`);
}

function toBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new TypeError(`${label} is not boolean`);
  return value;
}

async function feedObservation(
  url: string,
  address: Address,
  blockNumber: bigint,
): Promise<FeedRound & { readonly decimals: number }> {
  const [decimals] = await staticCall(
    url,
    address,
    "decimals()",
    "uint8",
    blockNumber,
  );
  const round = await staticCall(
    url,
    address,
    "latestRoundData()",
    "uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound",
    blockNumber,
  );
  const decimalValue = toBigint(decimals, "feed decimals");
  if (decimalValue > 255n) throw new TypeError("feed decimals overflow uint8");
  return {
    decimals: Number(decimalValue),
    roundId: toBigint(round[0], "round id"),
    answer: toBigint(round[1], "answer"),
    startedAt: toBigint(round[2], "started at"),
    updatedAt: toBigint(round[3], "updated at"),
    answeredInRound: toBigint(round[4], "answered in round"),
  };
}

async function observeSnapshot(
  url: string,
  block: RpcBlock,
): Promise<QuorumSnapshot> {
  const blockNumber = BigInt(block.number);
  const blockTimestamp = BigInt(block.timestamp);
  const [
    singleton,
    fallbackHandler,
    guard,
    versionResult,
    ownersResult,
    thresholdResult,
    nonceResult,
    modulesResult,
    delayResult,
    poolManagerResult,
    whitelistManagerResult,
    poolCreatorRoleResult,
    pausedResult,
    tokenDecimalsCollateral,
    tokenDecimalsReference,
    sUsdsUsds,
    sUsdeUsd,
    usdeUsd,
    sequencer,
  ] = await Promise.all([
    storageAddress(url, SAFE_MARKET_CATALOG.safe, ZERO_BYTES32, blockNumber),
    storageAddress(
      url,
      SAFE_MARKET_CATALOG.safe,
      SAFE_FALLBACK_SLOT,
      blockNumber,
    ),
    storageAddress(url, SAFE_MARKET_CATALOG.safe, SAFE_GUARD_SLOT, blockNumber),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.safe,
      "VERSION()",
      "string",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.safe,
      "getOwners()",
      "address[]",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.safe,
      "getThreshold()",
      "uint256",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.safe,
      "nonce()",
      "uint256",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.safe,
      "getModulesPaginated(address,uint256)",
      "address[] modules,address next",
      blockNumber,
      [SENTINEL_MODULES, 100n],
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.timelock,
      "getMinDelay()",
      "uint256",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.controller,
      "CORK_POOL_MANAGER()",
      "address",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.controller,
      "WHITELIST_MANAGER()",
      "address",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.controller,
      "POOL_CREATOR_ROLE()",
      "bytes32",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.controller,
      "paused()",
      "bool",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.collateral,
      "decimals()",
      "uint8",
      blockNumber,
    ),
    staticCall(
      url,
      SAFE_MARKET_CATALOG.reference,
      "decimals()",
      "uint8",
      blockNumber,
    ),
    feedObservation(url, SAFE_MARKET_CATALOG.sUsdsUsdsFeed, blockNumber),
    feedObservation(url, SAFE_MARKET_CATALOG.sUsdeUsdFeed, blockNumber),
    feedObservation(url, SAFE_MARKET_CATALOG.usdeUsdFeed, blockNumber),
    feedObservation(url, SAFE_MARKET_CATALOG.sequencerFeed, blockNumber),
  ]);
  const ownersRaw = ownersResult[0];
  const modulesRaw = modulesResult[0];
  if (!Array.isArray(ownersRaw) || !Array.isArray(modulesRaw)) {
    throw new TypeError("Safe address arrays are invalid");
  }
  const owners = ownersRaw.map((owner) => toAddress(owner, "Safe owner"));
  const modules = modulesRaw.map((module) => toAddress(module, "Safe module"));
  if (owners.length === 0) throw new Error("Safe has no owner");
  const threshold = toBigint(thresholdResult[0], "Safe threshold");
  if (threshold === 0n || threshold > BigInt(owners.length)) {
    throw new Error("Safe threshold is invalid");
  }
  const poolCreatorRole = poolCreatorRoleResult[0];
  assertHex(poolCreatorRole, "pool creator role");
  const roleNames = [
    "PROPOSER_ROLE",
    "EXECUTOR_ROLE",
    "CANCELLER_ROLE",
    "DEFAULT_ADMIN_ROLE",
  ] as const;
  const roleDigests = roleNames.map((name) =>
    name === "DEFAULT_ADMIN_ROLE" ? ZERO_BYTES32 : keccak256(stringToHex(name)),
  );
  const roleValues = await Promise.all(
    roleDigests.map(async (role) => {
      const [held] = await staticCall(
        url,
        SAFE_MARKET_CATALOG.timelock,
        "hasRole(bytes32,address)",
        "bool",
        blockNumber,
        [role, SAFE_MARKET_CATALOG.safe],
      );
      return toBoolean(held, "timelock role result");
    }),
  );
  const [timelockIsPoolCreator] = await staticCall(
    url,
    SAFE_MARKET_CATALOG.controller,
    "hasRole(bytes32,address)",
    "bool",
    blockNumber,
    [poolCreatorRole, SAFE_MARKET_CATALOG.timelock],
  );
  const codeEntries = await Promise.all(
    Object.entries({
      safe: SAFE_MARKET_CATALOG.safe,
      singleton,
      timelock: SAFE_MARKET_CATALOG.timelock,
      controller: SAFE_MARKET_CATALOG.controller,
      factory: SAFE_MARKET_CATALOG.factory,
      collateral: SAFE_MARKET_CATALOG.collateral,
      reference: SAFE_MARKET_CATALOG.reference,
      sUsdsUsdsFeed: SAFE_MARKET_CATALOG.sUsdsUsdsFeed,
      sUsdeUsdFeed: SAFE_MARKET_CATALOG.sUsdeUsdFeed,
      usdeUsdFeed: SAFE_MARKET_CATALOG.usdeUsdFeed,
      sequencerFeed: SAFE_MARKET_CATALOG.sequencerFeed,
    }).map(
      async ([name, address]) =>
        [name, await codeHash(url, address, blockNumber)] as const,
    ),
  );
  const version = versionResult[0];
  if (typeof version !== "string")
    throw new TypeError("Safe version is invalid");
  const roles = Object.fromEntries(
    roleNames.map((name, index) => [name, roleValues[index] ?? false]),
  );
  const snapshot: QuorumSnapshot = {
    block: {
      number: blockNumber.toString(),
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: blockTimestamp.toString(),
    },
    safe: {
      singleton,
      version,
      owners,
      threshold: threshold.toString(),
      nonce: toBigint(nonceResult[0], "Safe nonce").toString(),
      modules,
      modulesNext: toAddress(modulesResult[1], "Safe modules cursor"),
      guard,
      fallbackHandler,
    },
    timelock: {
      minimumDelay: toBigint(delayResult[0], "minimum delay").toString(),
      roles,
    },
    controller: {
      poolManager: toAddress(poolManagerResult[0], "pool manager"),
      whitelistManager: toAddress(
        whitelistManagerResult[0],
        "whitelist manager",
      ),
      poolCreatorRole,
      timelockIsPoolCreator: toBoolean(
        timelockIsPoolCreator,
        "pool creator role result",
      ),
      paused: toBoolean(pausedResult[0], "controller paused"),
    },
    codeHashes: Object.fromEntries(codeEntries),
    tokenDecimals: [
      Number(toBigint(tokenDecimalsCollateral[0], "collateral decimals")),
      Number(toBigint(tokenDecimalsReference[0], "reference decimals")),
    ],
    feeds: { sUsdsUsds, sUsdeUsd, usdeUsd, sequencer },
  };
  validateSnapshot(snapshot);
  return snapshot;
}

function validatePriceRound(
  name: string,
  round: FeedRound,
  maximumAge: bigint,
  timestamp: bigint,
): void {
  if (round.roundId === 0n || round.answeredInRound < round.roundId) {
    throw new Error(`${name} returned an incomplete round`);
  }
  if (round.answer <= 0n)
    throw new Error(`${name} returned a non-positive answer`);
  if (round.updatedAt === 0n || round.updatedAt > timestamp) {
    throw new Error(`${name} returned an unsafe timestamp`);
  }
  if (timestamp - round.updatedAt > maximumAge) {
    throw new Error(`${name} is stale at the pinned block`);
  }
}

function validateSnapshot(snapshot: QuorumSnapshot): void {
  const timestamp = BigInt(snapshot.block.timestamp);
  if (snapshot.safe.modulesNext !== SENTINEL_MODULES) {
    throw new Error("Safe module pagination did not terminate");
  }
  if (snapshot.tokenDecimals[0] !== 18 || snapshot.tokenDecimals[1] !== 18) {
    throw new Error("token decimal convention drifted");
  }
  if (
    snapshot.feeds.sUsdsUsds.decimals !== 18 ||
    snapshot.feeds.sUsdeUsd.decimals !== 8 ||
    snapshot.feeds.usdeUsd.decimals !== 8 ||
    snapshot.feeds.sequencer.decimals !== 0
  ) {
    throw new Error("feed decimal convention drifted");
  }
  validatePriceRound(
    "sUSDS/USDS",
    snapshot.feeds.sUsdsUsds,
    SAFE_MARKET_CATALOG.sUsdsUsdsMaximumAge,
    timestamp,
  );
  validatePriceRound(
    "sUSDe/USD",
    snapshot.feeds.sUsdeUsd,
    SAFE_MARKET_CATALOG.sUsdeUsdMaximumAge,
    timestamp,
  );
  validatePriceRound(
    "USDe/USD",
    snapshot.feeds.usdeUsd,
    SAFE_MARKET_CATALOG.usdeUsdMaximumAge,
    timestamp,
  );
  const sequencer = snapshot.feeds.sequencer;
  if (
    sequencer.roundId === 0n ||
    sequencer.answeredInRound < sequencer.roundId ||
    sequencer.answer !== 0n ||
    sequencer.startedAt === 0n ||
    sequencer.updatedAt < sequencer.startedAt ||
    sequencer.updatedAt > timestamp ||
    sequencer.startedAt > timestamp ||
    timestamp - sequencer.startedAt <= SAFE_MARKET_CATALOG.sequencerGracePeriod
  ) {
    throw new Error("sequencer round is unsafe");
  }
  if (
    !Object.values(snapshot.timelock.roles).every(Boolean) ||
    !snapshot.controller.timelockIsPoolCreator ||
    snapshot.controller.paused
  ) {
    throw new Error("governance call path is not mechanically available");
  }
}

function equalSnapshots(left: QuorumSnapshot, right: QuorumSnapshot): void {
  const canonical = (value: QuorumSnapshot): string =>
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  if (canonical(left) !== canonical(right)) {
    throw new Error("two-provider quorum disagreement on critical state");
  }
}

async function pinCommonBlock(config: SafeMarketRpcConfig): Promise<RpcBlock> {
  const [primaryLatest, secondaryLatest] = await Promise.all([
    getBlock(config.primaryUrl, "latest"),
    getBlock(config.secondaryUrl, "latest"),
  ]);
  const number =
    BigInt(primaryLatest.number) < BigInt(secondaryLatest.number)
      ? BigInt(primaryLatest.number)
      : BigInt(secondaryLatest.number);
  const tag = `0x${number.toString(16)}`;
  const [primary, secondary] = await Promise.all([
    getBlock(config.primaryUrl, tag),
    getBlock(config.secondaryUrl, tag),
  ]);
  if (
    primary.number.toLowerCase() !== secondary.number.toLowerCase() ||
    primary.hash.toLowerCase() !== secondary.hash.toLowerCase() ||
    primary.parentHash.toLowerCase() !== secondary.parentHash.toLowerCase() ||
    primary.timestamp.toLowerCase() !== secondary.timestamp.toLowerCase()
  ) {
    throw new Error("two providers do not agree on the freshest common block");
  }
  return primary;
}

function runFile(executable: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      executable,
      [...args],
      { cwd: REPOSITORY_ROOT },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${executable} failed: ${stderr || stdout}`));
          return;
        }
        resolvePromise();
      },
    );
  });
}

interface OracleArtifact {
  readonly bytecode: { readonly object: Hex };
  readonly metadata: {
    readonly compiler: { readonly version: string };
    readonly language: string;
    readonly settings: {
      readonly optimizer: { readonly enabled: boolean; readonly runs: number };
      readonly metadata: {
        readonly useLiteralContent: boolean;
        readonly bytecodeHash: string;
        readonly appendCBOR: boolean;
      };
      readonly compilationTarget: Readonly<Record<string, string>>;
      readonly evmVersion: string;
    };
    readonly sources: Readonly<
      Record<string, { readonly keccak256: Hex; readonly content: string }>
    >;
  };
}

async function buildOracle(): Promise<OracleArtifact> {
  await runFile("/root/.foundry/bin/forge", ["build", "--root", ORACLE_ROOT]);
  const parsed: unknown = JSON.parse(await readFile(ORACLE_ARTIFACT, "utf8"));
  assertRecord(parsed, "Foundry artifact");
  const artifact = parsed as unknown as OracleArtifact;
  if (
    artifact.metadata.compiler.version !== "0.8.30+commit.73712a01" ||
    artifact.metadata.language !== "Solidity" ||
    artifact.metadata.settings.optimizer.enabled !== true ||
    artifact.metadata.settings.optimizer.runs !== 10_000 ||
    artifact.metadata.settings.evmVersion !== "cancun" ||
    artifact.metadata.settings.metadata.useLiteralContent !== true ||
    artifact.metadata.settings.metadata.bytecodeHash !== "none" ||
    artifact.metadata.settings.metadata.appendCBOR !== false ||
    artifact.metadata.settings.compilationTarget[
      "src/SUsdePerSUsdsRateOracle.sol"
    ] !== "SUsdePerSUsdsRateOracle" ||
    Object.keys(artifact.metadata.sources).length !== 5
  ) {
    throw new Error(
      "Foundry artifact compiler/settings/source metadata drifted",
    );
  }
  assertHex(artifact.bytecode.object, "oracle creation bytecode");
  if (artifact.bytecode.object.length < 4)
    throw new Error("oracle bytecode is empty");
  for (const [path, source] of Object.entries(artifact.metadata.sources)) {
    if (keccak256(stringToHex(source.content)) !== source.keccak256) {
      throw new Error(`artifact source content hash drifted for ${path}`);
    }
  }
  return artifact;
}

function oracleInitCode(creationBytecode: Hex): Hex {
  const constructorArguments = encodeAbiParameters(
    parseAbiParameters(
      "address,address,address,address,uint256,uint256,uint256,uint256",
    ),
    [
      SAFE_MARKET_CATALOG.sUsdsUsdsFeed,
      SAFE_MARKET_CATALOG.sUsdeUsdFeed,
      SAFE_MARKET_CATALOG.usdeUsdFeed,
      SAFE_MARKET_CATALOG.sequencerFeed,
      SAFE_MARKET_CATALOG.sUsdsUsdsMaximumAge,
      SAFE_MARKET_CATALOG.sUsdeUsdMaximumAge,
      SAFE_MARKET_CATALOG.usdeUsdMaximumAge,
      SAFE_MARKET_CATALOG.sequencerGracePeriod,
    ],
  );
  return concatHex([creationBytecode, constructorArguments]);
}

export function computeObservedRate(snapshot: QuorumSnapshot): bigint {
  const sUsdeUsde =
    (snapshot.feeds.sUsdeUsd.answer * 1_000_000_000_000_000_000n) /
    snapshot.feeds.usdeUsd.answer;
  const rate =
    (sUsdeUsde * 1_000_000_000_000_000_000n) / snapshot.feeds.sUsdsUsds.answer;
  if (rate === 0n) throw new Error("composed oracle rate rounded to zero");
  return rate;
}

export function createMarketTuple(input: {
  readonly expiry: bigint;
  readonly observedRate: bigint;
  readonly oracle: Address;
}): SafeMarketTuple {
  const rateMin = (input.observedRate * 995n) / 1_000n;
  const rateMax = (input.observedRate * 1_005n + 999n) / 1_000n;
  if (rateMin === 0n || rateMin >= rateMax)
    throw new Error("rate bounds are invalid");
  return {
    collateralAsset: SAFE_MARKET_CATALOG.collateral,
    referenceAsset: SAFE_MARKET_CATALOG.reference,
    expiryTimestamp: input.expiry,
    rateMin,
    rateMax,
    rateChangePerDayMax: SAFE_MARKET_CATALOG.rateChangePerDayMax,
    rateChangeCapacityMax: SAFE_MARKET_CATALOG.rateChangeCapacityMax,
    rateOracle: input.oracle,
  };
}

export function computeMarketId(market: SafeMarketTuple): Hex {
  return keccak256(encodeAbiParameters(MARKET_PARAMETERS, [market]));
}

export function createSafeBuilderFile(input: {
  readonly name: string;
  readonly description: string;
  readonly createdAt: number;
  readonly owner: Address;
  readonly data: Hex;
}): SafeBuilderFile {
  const unsigned = {
    version: "1.0" as const,
    chainId: "42161" as const,
    createdAt: input.createdAt,
    meta: {
      name: input.name,
      description: input.description,
      txBuilderVersion: "1.18.0" as const,
      createdFromSafeAddress: SAFE_MARKET_CATALOG.safe,
      createdFromOwnerAddress: input.owner,
    },
    transactions: [
      {
        to: SAFE_MARKET_CATALOG.timelock,
        value: "0" as const,
        data: input.data,
        contractMethod: null,
        contractInputsValues: null,
      },
    ] as const,
  };
  return {
    ...unsigned,
    meta: {
      ...unsigned.meta,
      checksum: safeBuilderChecksum(unsigned),
    },
  };
}

type SafeChecksumValue =
  | string
  | number
  | boolean
  | null
  | readonly SafeChecksumValue[]
  | { readonly [key: string]: SafeChecksumValue };

function safeChecksumSerialize(value: SafeChecksumValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => safeChecksumSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, SafeChecksumValue>>;
    const keys = Object.keys(record).sort();
    let serialized = `{${JSON.stringify(keys)}`;
    for (const key of keys)
      serialized += `${safeChecksumSerialize(record[key]!)},`;
    return `${serialized}}`;
  }
  return JSON.stringify(value);
}

function safeBuilderChecksum(input: {
  readonly version: "1.0";
  readonly chainId: "42161";
  readonly createdAt: number;
  readonly meta: {
    readonly name: string;
    readonly description: string;
    readonly txBuilderVersion: "1.18.0";
    readonly createdFromSafeAddress: Address;
    readonly createdFromOwnerAddress: Address;
  };
  readonly transactions: SafeBuilderFile["transactions"];
}): Hex {
  const checksumInput = {
    ...input,
    meta: { ...input.meta, name: null },
  } as unknown as SafeChecksumValue;
  return keccak256(stringToHex(safeChecksumSerialize(checksumInput)));
}

export function deriveCreate2Salt(initCodeHash: Hex, expiry: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "uint256,address,address,address,uint256,address,address,address,address,uint256,uint256,uint256,uint256,bytes32",
      ),
      [
        SAFE_MARKET_CATALOG.chainId,
        SAFE_MARKET_CATALOG.safe,
        SAFE_MARKET_CATALOG.collateral,
        SAFE_MARKET_CATALOG.reference,
        expiry,
        SAFE_MARKET_CATALOG.sUsdsUsdsFeed,
        SAFE_MARKET_CATALOG.sUsdeUsdFeed,
        SAFE_MARKET_CATALOG.usdeUsdFeed,
        SAFE_MARKET_CATALOG.sequencerFeed,
        SAFE_MARKET_CATALOG.sUsdsUsdsMaximumAge,
        SAFE_MARKET_CATALOG.sUsdeUsdMaximumAge,
        SAFE_MARKET_CATALOG.usdeUsdMaximumAge,
        SAFE_MARKET_CATALOG.sequencerGracePeriod,
        initCodeHash,
      ],
    ),
  );
}

export function predictOracleAddress(
  initCodeHash: Hex,
  create2Salt: Hex,
): Address {
  return getAddress(
    getContractAddress({
      opcode: "CREATE2",
      from: SAFE_MARKET_CATALOG.factory,
      salt: create2Salt,
      bytecodeHash: initCodeHash,
    }),
  );
}

export function deriveOperationSalt(create2Salt: Hex, marketId: Hex): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("uint256,address,bytes32,bytes32"), [
      SAFE_MARKET_CATALOG.chainId,
      SAFE_MARKET_CATALOG.safe,
      create2Salt,
      marketId,
    ]),
  );
}

export function computeTimelockOperationId(input: {
  readonly targets: readonly Address[];
  readonly values: readonly bigint[];
  readonly payloads: readonly Hex[];
  readonly salt: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address[],uint256[],bytes[],bytes32,bytes32"),
      [input.targets, input.values, input.payloads, ZERO_BYTES32, input.salt],
    ),
  );
}

function json(value: unknown): string {
  return `${JSON.stringify(
    value,
    (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    2,
  )}\n`;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function atomicWrite(path: string, value: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export function createSafeMarketProofRecord(input: {
  readonly status: SafeMarketProofStatus;
  readonly blockNumber: bigint;
  readonly safeNonce: bigint;
}): SafeMarketProofRecord {
  if (input.status === "not-run") {
    return {
      status: "not-run",
      forkProvider: null,
      forkBlock: null,
      exactBuilderBytes: false,
      safeNonceBefore: null,
      safeNonceAfter: null,
      assertions: [],
    };
  }
  return {
    status: "passed",
    forkProvider: "primary quorum provider",
    forkBlock: input.blockNumber,
    exactBuilderBytes: true,
    safeNonceBefore: input.safeNonce.toString(),
    safeNonceAfter: (input.safeNonce + 2n).toString(),
    assertions: [
      "owner -> Safe -> TimelockController scheduleBatch",
      "owner -> Safe -> TimelockController executeBatch",
      "Safe nonce progressed once per exact builder transaction",
      "timelock operation is done",
      "CREATE2 oracle runtime, immutable configuration, and live rate verified",
      "controller market tuple and market ID verified",
      "fees and whitelist-disabled state verified",
      "pool shares were created",
    ],
  };
}

export async function publishSafeMarketPackage(input: {
  readonly outputDirectory: string;
  readonly scheduleText: string;
  readonly executeText: string;
  readonly prove?: (stagedOutputDirectory: string) => Promise<void>;
  readonly createManifestText: (status: SafeMarketProofStatus) => string;
}): Promise<{
  readonly manifestText: string;
  readonly proofStatus: SafeMarketProofStatus;
}> {
  await mkdir(dirname(input.outputDirectory), { recursive: true });
  const stage = await mkdtemp(`${input.outputDirectory}.stage-`);
  const backup = `${input.outputDirectory}.backup-${process.pid}-${randomUUID()}`;
  let backupPresent = false;
  let published = false;
  try {
    await Promise.all([
      atomicWrite(resolve(stage, "01-schedule.json"), input.scheduleText),
      atomicWrite(resolve(stage, "02-execute.json"), input.executeText),
    ]);
    const proofStatus: SafeMarketProofStatus =
      input.prove === undefined ? "not-run" : "passed";
    if (input.prove !== undefined) await input.prove(stage);
    const manifestText = input.createManifestText(proofStatus);
    await atomicWrite(resolve(stage, "manifest.json"), manifestText);

    try {
      await rename(input.outputDirectory, backup);
      backupPresent = true;
    } catch (error: unknown) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
    try {
      await rename(stage, input.outputDirectory);
      published = true;
    } catch (publishError: unknown) {
      if (backupPresent) {
        try {
          await rename(backup, input.outputDirectory);
          backupPresent = false;
        } catch (restoreError: unknown) {
          throw new AggregateError(
            [publishError, restoreError],
            `package publish failed and the previous package remains recoverable at ${backup}`,
          );
        }
      }
      throw publishError;
    }
    if (backupPresent) {
      await rm(backup, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      backupPresent = false;
    }
    return { manifestText, proofStatus };
  } finally {
    if (!published) await rm(stage, { recursive: true, force: true });
  }
}

async function assertAbsentMarket(
  config: SafeMarketRpcConfig,
  blockNumber: bigint,
  poolManager: Address,
  predictedOracle: Address,
  marketId: Hex,
): Promise<void> {
  const check = async (url: string): Promise<string> => {
    const oracleCode = await rawCode(url, predictedOracle, blockNumber);
    const market = await staticCall(
      url,
      poolManager,
      "market(bytes32)",
      "address collateralAsset,address referenceAsset,uint256 expiryTimestamp,uint256 rateMin,uint256 rateMax,uint256 rateChangePerDayMax,uint256 rateChangeCapacityMax,address rateOracle",
      blockNumber,
      [marketId],
    );
    return JSON.stringify({ oracleCode, market }, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  };
  const [primary, secondary] = await Promise.all([
    check(config.primaryUrl),
    check(config.secondaryUrl),
  ]);
  if (primary !== secondary) {
    throw new Error("two-provider quorum disagreement on deployment vacancy");
  }
  const decoded = JSON.parse(primary) as {
    readonly oracleCode: Hex;
    readonly market: readonly string[];
  };
  if (decoded.oracleCode !== "0x" || decoded.market[0] !== ZERO_ADDRESS) {
    throw new Error(
      "predicted oracle or requested market is already initialized",
    );
  }
}

export async function prepareSafeMarketPreview(input: {
  readonly rpc: SafeMarketRpcConfig;
  readonly developerSkipProof?: true;
}): Promise<SafeMarketPreviewResult> {
  if (
    !input.rpc.primaryUrl.startsWith("http") ||
    !input.rpc.secondaryUrl.startsWith("http") ||
    input.rpc.primaryUrl === input.rpc.secondaryUrl
  ) {
    throw new TypeError("two distinct HTTP RPC provider URLs are required");
  }
  const artifact = await buildOracle();
  const block = await pinCommonBlock(input.rpc);
  const blockNumber = BigInt(block.number);
  const [primarySnapshot, secondarySnapshot] = await Promise.all([
    observeSnapshot(input.rpc.primaryUrl, block),
    observeSnapshot(input.rpc.secondaryUrl, block),
  ]);
  equalSnapshots(primarySnapshot, secondarySnapshot);
  const snapshot = primarySnapshot;
  const initCode = oracleInitCode(artifact.bytecode.object);
  const initCodeHash = keccak256(initCode);
  const expiry =
    BigInt(snapshot.block.timestamp) + SAFE_MARKET_CATALOG.duration;
  const create2Salt = deriveCreate2Salt(initCodeHash, expiry);
  const predictedOracle = predictOracleAddress(initCodeHash, create2Salt);
  const observedRate = computeObservedRate(snapshot);
  const market = createMarketTuple({
    expiry,
    observedRate,
    oracle: predictedOracle,
  });
  const marketId = computeMarketId(market);
  await assertAbsentMarket(
    input.rpc,
    blockNumber,
    snapshot.controller.poolManager,
    predictedOracle,
    marketId,
  );
  const deployData = encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: "deploy",
    args: [initCode, create2Salt],
  });
  const createPoolData = encodeFunctionData({
    abi: CREATE_POOL_ABI,
    functionName: "createNewPool",
    args: [
      {
        pool: market,
        unwindSwapFeePercentage: SAFE_MARKET_CATALOG.unwindSwapFee,
        swapFeePercentage: SAFE_MARKET_CATALOG.swapFee,
        isWhitelistEnabled: false,
      },
    ],
  });
  const targets = [
    SAFE_MARKET_CATALOG.factory,
    SAFE_MARKET_CATALOG.controller,
  ] as const;
  const values = [0n, 0n] as const;
  const payloads = [deployData, createPoolData] as const;
  const operationSalt = deriveOperationSalt(create2Salt, marketId);
  const operationId = computeTimelockOperationId({
    targets,
    values,
    payloads,
    salt: operationSalt,
  });
  const minimumDelay = BigInt(snapshot.timelock.minimumDelay);
  const scheduleData = encodeFunctionData({
    abi: TIMELOCK_ABI,
    functionName: "scheduleBatch",
    args: [
      targets,
      values,
      payloads,
      ZERO_BYTES32,
      operationSalt,
      minimumDelay,
    ],
  });
  const executeData = encodeFunctionData({
    abi: TIMELOCK_ABI,
    functionName: "executeBatch",
    args: [targets, values, payloads, ZERO_BYTES32, operationSalt],
  });
  const owner = snapshot.safe.owners[0]!;
  const createdAt = Number(BigInt(snapshot.block.timestamp) * 1_000n);
  const schedule = createSafeBuilderFile({
    name: "01 Schedule sUSDS/sUSDe Liquidity+Impairment market",
    description:
      "Schedules the exact atomic oracle deployment and Cork pool creation batch.",
    createdAt,
    owner,
    data: scheduleData,
  });
  const execute = createSafeBuilderFile({
    name: "02 Execute sUSDS/sUSDe Liquidity+Impairment market",
    description:
      "Executes the exact batch previously scheduled by proposal 01.",
    createdAt: createdAt + 1,
    owner,
    data: executeData,
  });
  const scheduleText = json(schedule);
  const executeText = json(execute);
  const context: SafeMarketBuildContext = {
    rpcUrl: input.rpc.primaryUrl,
    blockNumber,
    blockHash: block.hash,
    safe: SAFE_MARKET_CATALOG.safe,
    owner,
    safeNonce: BigInt(snapshot.safe.nonce),
    timelock: SAFE_MARKET_CATALOG.timelock,
    poolManager: snapshot.controller.poolManager,
    whitelistManager: snapshot.controller.whitelistManager,
    oracle: predictedOracle,
    market,
    marketId,
    operationId,
    scheduleData,
    executeData,
    minimumDelay,
    outputDirectory: SAFE_MARKET_OUTPUT_DIRECTORY,
  };
  const outputHashes: Record<string, string> = {
    "01-schedule.json": sha256(scheduleText),
    "02-execute.json": sha256(executeText),
  };
  const createManifestText = (proofStatus: SafeMarketProofStatus): string =>
    json({
      schemaVersion: "cork.safe-market-package/v1",
      profile: SAFE_MARKET_PROFILE,
      chainId: SAFE_MARKET_CATALOG.chainId,
      pinnedBlock: snapshot.block,
      providers: {
        primary: input.rpc.primaryUrl,
        secondary: input.rpc.secondaryUrl,
        quorum: "exact equality at freshest common block",
      },
      readiness: "mechanically-valid-governance-nonconforming",
      broadcastReady: false,
      custodyBoundary:
        "Unsigned preview only. No signing key, confirmation, Safe service submission, persistence service, or broadcast capability exists.",
      governance: {
        safe: SAFE_MARKET_CATALOG.safe,
        singleton: snapshot.safe.singleton,
        version: snapshot.safe.version,
        owners: snapshot.safe.owners,
        threshold: snapshot.safe.threshold,
        nonce: snapshot.safe.nonce,
        modules: snapshot.safe.modules,
        guard: snapshot.safe.guard,
        fallbackHandler: snapshot.safe.fallbackHandler,
        requiredProductionBaseline: "2-of-3",
        warning:
          "Observed 1-of-1 Safe does not conform to the production baseline.",
        timelock: SAFE_MARKET_CATALOG.timelock,
        minimumDelay: snapshot.timelock.minimumDelay,
        safeRoles: snapshot.timelock.roles,
        controllerPoolCreatorRole: snapshot.controller.poolCreatorRole,
      },
      compiler: {
        version: artifact.metadata.compiler.version,
        optimizerEnabled: true,
        optimizerRuns: 10_000,
        viaIr: false,
        evmVersion: "cancun",
        bytecodeHash: "none",
        appendCbor: false,
        literalSourceContent: true,
        creationCodeHash: keccak256(artifact.bytecode.object),
        initCodeHash,
      },
      oracle: {
        address: predictedOracle,
        create2Salt,
        formula:
          "floor(floor((sUSDe/USD) * 1e18 / (USDe/USD)) * 1e18 / (sUSDS/USDS))",
        timing: {
          sUsdsUsdsMaximumAge: SAFE_MARKET_CATALOG.sUsdsUsdsMaximumAge,
          sUsdeUsdMaximumAge: SAFE_MARKET_CATALOG.sUsdeUsdMaximumAge,
          usdeUsdMaximumAge: SAFE_MARKET_CATALOG.usdeUsdMaximumAge,
          sequencerGracePeriod: SAFE_MARKET_CATALOG.sequencerGracePeriod,
        },
        feeds: {
          sUsdsUsds: SAFE_MARKET_CATALOG.sUsdsUsdsFeed,
          sUsdeUsd: SAFE_MARKET_CATALOG.sUsdeUsdFeed,
          usdeUsd: SAFE_MARKET_CATALOG.usdeUsdFeed,
          sequencer: SAFE_MARKET_CATALOG.sequencerFeed,
        },
        observedRounds: snapshot.feeds,
        observedRate,
      },
      market: {
        tuple: market,
        marketId,
        duration: SAFE_MARKET_CATALOG.duration,
        whitelistEnabled: false,
        swapFee: SAFE_MARKET_CATALOG.swapFee,
        unwindSwapFee: SAFE_MARKET_CATALOG.unwindSwapFee,
        economicPolicy: {
          classification:
            "operator-selected economic parameters; not automatic risk approval",
          initialBound:
            "observed quorum rate minus/plus 0.5 percent, widened by conservative rounding",
          rateChangePerDayMax: SAFE_MARKET_CATALOG.rateChangePerDayMax,
          rateChangeCapacityMax: SAFE_MARKET_CATALOG.rateChangeCapacityMax,
        },
      },
      timelockBatch: {
        targets,
        values,
        payloads,
        predecessor: ZERO_BYTES32,
        salt: operationSalt,
        operationId,
        scheduleCalldataHash: keccak256(scheduleData),
        executeCalldataHash: keccak256(executeData),
      },
      safeBuilderFiles: ["01-schedule.json", "02-execute.json"],
      outputHashes,
      proof: createSafeMarketProofRecord({
        status: proofStatus,
        blockNumber,
        safeNonce: BigInt(snapshot.safe.nonce),
      }),
    });
  const published = await publishSafeMarketPackage({
    outputDirectory: SAFE_MARKET_OUTPUT_DIRECTORY,
    scheduleText,
    executeText,
    ...(input.developerSkipProof === true
      ? {}
      : {
          prove: async (stagedOutputDirectory: string) =>
            proveSafeMarketPackage({
              ...context,
              outputDirectory: stagedOutputDirectory,
            }),
        }),
    createManifestText,
  });
  const manifestText = published.manifestText;
  outputHashes["manifest.json"] = sha256(manifestText);
  return {
    schemaVersion: "cork.safe-market-preview/v1",
    profile: SAFE_MARKET_PROFILE,
    outputDirectory: SAFE_MARKET_OUTPUT_DIRECTORY,
    pinnedBlock: snapshot.block.number,
    pinnedBlockHash: snapshot.block.hash,
    marketId,
    predictedOracle,
    operationId,
    readiness: "mechanically-valid-governance-nonconforming",
    broadcastReady: false,
    proofStatus: published.proofStatus,
    outputHashes,
  };
}

export function rpcConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): SafeMarketRpcConfig {
  return {
    primaryUrl:
      environment["ARBITRUM_RPC_URL"] ?? "https://arb1.arbitrum.io/rpc",
    secondaryUrl:
      environment["ARBITRUM_RPC_URL_2"] ??
      "https://arbitrum-one.public.blastapi.io",
  };
}

export function prevalidatedOwnerSignature(owner: Address): Hex {
  return concatHex([padHex(owner, { size: 32 }), ZERO_BYTES32, "0x01"]);
}
