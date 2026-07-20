import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import {
  prevalidatedOwnerSignature,
  SAFE_MARKET_CATALOG,
  type SafeBuilderFile,
  type SafeMarketBuildContext,
  type SafeMarketTuple,
} from "./safe-market.js";

const ZERO_ADDRESS = getAddress("0x0000000000000000000000000000000000000000");

const SAFE_EXEC_ABI = [
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

interface RpcError {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly data?: unknown;
}

interface TransactionReceipt {
  readonly status: Hex;
  readonly blockNumber: Hex;
  readonly transactionHash: Hex;
}

export function assertPinnedForkBlock(
  value: unknown,
  context: Pick<SafeMarketBuildContext, "blockNumber" | "blockHash">,
): void {
  assertRecord(value, "Anvil pinned block");
  const number = value["number"];
  const hash = value["hash"];
  assertHex(number, "Anvil pinned block number");
  assertHex(hash, "Anvil pinned block hash");
  if (BigInt(number) !== context.blockNumber) {
    throw new Error(
      `Anvil fork block number ${BigInt(number)} does not match quorum block ${context.blockNumber}`,
    );
  }
  if (hash.toLowerCase() !== context.blockHash.toLowerCase()) {
    throw new Error(
      `Anvil fork block hash ${hash} does not match quorum hash ${context.blockHash}`,
    );
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

function assertHex(value: unknown, label: string): asserts value is Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/u.test(value)) {
    throw new TypeError(`${label} is not hexadecimal`);
  }
}

let rpcId = 1;

async function rpc(
  url: string,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Anvil ${method} returned HTTP ${response.status}`);
  const payload: unknown = await response.json();
  assertRecord(payload, `Anvil ${method} response`);
  if (payload["error"] !== undefined) {
    const error = payload["error"] as RpcError;
    const message =
      typeof error.message === "string" ? error.message : "unknown Anvil error";
    throw new Error(`Anvil ${method} failed: ${message}`);
  }
  if (!("result" in payload)) throw new Error(`Anvil ${method} omitted result`);
  return payload["result"];
}

async function waitForAnvil(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Anvil exited with ${child.exitCode}`);
    try {
      const chainId = await rpc(url, "eth_chainId", []);
      if (chainId === "0xa4b1") return;
    } catch {
      // The child has not opened its JSON-RPC listener yet.
    }
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 100),
    );
  }
  throw new Error("Anvil did not become ready within 20 seconds");
}

async function callHex(
  url: string,
  address: Address,
  signature: string,
  output: string,
  args: readonly unknown[] = [],
): Promise<readonly unknown[]> {
  const [name = ""] = signature.split("(");
  const inputsText = signature.slice(name.length + 1, -1);
  const inputs = inputsText.length === 0 ? [] : inputsText.split(",");
  const abi = [
    {
      type: "function",
      name,
      stateMutability: "view",
      inputs: inputs.map((type, index) => ({ type, name: `arg${index}` })),
      outputs: parseAbiParameters(output),
    },
  ] as const;
  const data = encodeFunctionData({
    abi,
    functionName: name,
    args: args as never,
  });
  const returned = await rpc(url, "eth_call", [
    { to: address, data },
    "latest",
  ]);
  assertHex(returned, `${signature} result`);
  return decodeAbiParameters(
    parseAbiParameters(output),
    returned,
  ) as readonly unknown[];
}

function bigintValue(value: unknown, label: string): bigint {
  if (typeof value !== "bigint")
    throw new TypeError(`${label} is not an integer`);
  return value;
}

function addressValue(value: unknown, label: string): Address {
  if (typeof value !== "string")
    throw new TypeError(`${label} is not an address`);
  return getAddress(value);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new TypeError(`${label} is not boolean`);
  return value;
}

async function receipt(url: string, hash: Hex): Promise<TransactionReceipt> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await rpc(url, "eth_getTransactionReceipt", [hash]);
    if (value !== null) {
      assertRecord(value, "transaction receipt");
      const status = value["status"];
      const blockNumber = value["blockNumber"];
      const transactionHash = value["transactionHash"];
      assertHex(status, "receipt status");
      assertHex(blockNumber, "receipt block number");
      assertHex(transactionHash, "receipt transaction hash");
      if (status !== "0x1")
        throw new Error(`fork transaction reverted: ${hash}`);
      return { status, blockNumber, transactionHash };
    }
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 100),
    );
  }
  throw new Error(`fork transaction receipt timed out: ${hash}`);
}

async function executeThroughSafe(
  url: string,
  context: SafeMarketBuildContext,
  data: Hex,
): Promise<TransactionReceipt> {
  const safeData = encodeFunctionData({
    abi: SAFE_EXEC_ABI,
    functionName: "execTransaction",
    args: [
      context.timelock,
      0n,
      data,
      0,
      0n,
      0n,
      0n,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      prevalidatedOwnerSignature(context.owner),
    ],
  });
  const result = await rpc(url, "eth_sendTransaction", [
    {
      from: context.owner,
      to: context.safe,
      data: safeData,
      gas: "0x5f5e100",
    },
  ]);
  assertHex(result, "transaction hash");
  return receipt(url, result);
}

function assertMarketTuple(
  actual: readonly unknown[],
  expected: SafeMarketTuple,
): void {
  const expectedValues: readonly (Address | bigint)[] = [
    expected.collateralAsset,
    expected.referenceAsset,
    expected.expiryTimestamp,
    expected.rateMin,
    expected.rateMax,
    expected.rateChangePerDayMax,
    expected.rateChangeCapacityMax,
    expected.rateOracle,
  ];
  if (actual.length !== expectedValues.length)
    throw new Error("market tuple length drifted");
  actual.forEach((value, index) => {
    const expectedValue = expectedValues[index];
    const normalized =
      typeof expectedValue === "string"
        ? addressValue(value, `market[${index}]`)
        : bigintValue(value, `market[${index}]`);
    if (normalized !== expectedValue)
      throw new Error(`market tuple field ${index} drifted`);
  });
}

async function loadExactBuilderData(
  context: SafeMarketBuildContext,
  filename: string,
  expected: Hex,
): Promise<Hex> {
  const parsed: unknown = JSON.parse(
    await readFile(resolve(context.outputDirectory, filename), "utf8"),
  );
  assertRecord(parsed, filename);
  const file = parsed as unknown as SafeBuilderFile;
  const transaction = file.transactions[0];
  if (
    file.version !== "1.0" ||
    file.chainId !== "42161" ||
    file.transactions.length !== 1 ||
    transaction.to !== context.timelock ||
    transaction.value !== "0" ||
    transaction.contractMethod !== null ||
    transaction.contractInputsValues !== null ||
    transaction.data !== expected
  ) {
    throw new Error(
      `${filename} does not contain the exact expected raw transaction`,
    );
  }
  return transaction.data;
}

export async function proveSafeMarketPackage(
  context: SafeMarketBuildContext,
): Promise<void> {
  const port = 38_000 + (process.pid % 1_000);
  const url = `http://127.0.0.1:${port}`;
  const stderr: string[] = [];
  const child = spawn(
    "/root/.foundry/bin/anvil",
    [
      "--fork-url",
      context.rpcUrl,
      "--fork-block-number",
      context.blockNumber.toString(),
      "--chain-id",
      "42161",
      "--hardfork",
      "cancun",
      "--gas-limit",
      "100000000",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--silent",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr?.on("data", (chunk: Buffer | string) =>
    stderr.push(chunk.toString()),
  );
  try {
    await waitForAnvil(url, child);
    const pinnedForkBlock = await rpc(url, "eth_getBlockByNumber", [
      `0x${context.blockNumber.toString(16)}`,
      false,
    ]);
    assertPinnedForkBlock(pinnedForkBlock, context);
    await rpc(url, "anvil_impersonateAccount", [context.owner]);
    await rpc(url, "anvil_setBalance", [context.owner, "0x3635c9adc5dea00000"]);
    const scheduleData = await loadExactBuilderData(
      context,
      "01-schedule.json",
      context.scheduleData,
    );
    const executeData = await loadExactBuilderData(
      context,
      "02-execute.json",
      context.executeData,
    );
    const [nonceBefore] = await callHex(
      url,
      context.safe,
      "nonce()",
      "uint256",
    );
    if (bigintValue(nonceBefore, "Safe nonce") !== context.safeNonce) {
      throw new Error("fork Safe nonce differs from the quorum snapshot");
    }
    await executeThroughSafe(url, context, scheduleData);
    const [nonceScheduled] = await callHex(
      url,
      context.safe,
      "nonce()",
      "uint256",
    );
    if (bigintValue(nonceScheduled, "Safe nonce") !== context.safeNonce + 1n) {
      throw new Error("Safe nonce did not progress after schedule");
    }
    await executeThroughSafe(url, context, executeData);
    const [nonceExecuted] = await callHex(
      url,
      context.safe,
      "nonce()",
      "uint256",
    );
    if (bigintValue(nonceExecuted, "Safe nonce") !== context.safeNonce + 2n) {
      throw new Error("Safe nonce did not progress after execute");
    }
    const [operationDone] = await callHex(
      url,
      context.timelock,
      "isOperationDone(bytes32)",
      "bool",
      [context.operationId],
    );
    if (!booleanValue(operationDone, "timelock operation state")) {
      throw new Error("timelock operation is not done");
    }
    const deployedCode = await rpc(url, "eth_getCode", [
      context.oracle,
      "latest",
    ]);
    assertHex(deployedCode, "oracle runtime code");
    if (deployedCode === "0x")
      throw new Error("oracle runtime was not deployed");
    const oracleChecks = [
      ["sUsdsUsdsFeed()", "address", SAFE_MARKET_CATALOG.sUsdsUsdsFeed],
      ["sUsdeUsdFeed()", "address", SAFE_MARKET_CATALOG.sUsdeUsdFeed],
      ["usdeUsdFeed()", "address", SAFE_MARKET_CATALOG.usdeUsdFeed],
      ["sequencerUptimeFeed()", "address", SAFE_MARKET_CATALOG.sequencerFeed],
      [
        "sUsdsUsdsMaximumAge()",
        "uint256",
        SAFE_MARKET_CATALOG.sUsdsUsdsMaximumAge,
      ],
      [
        "sUsdeUsdMaximumAge()",
        "uint256",
        SAFE_MARKET_CATALOG.sUsdeUsdMaximumAge,
      ],
      ["usdeUsdMaximumAge()", "uint256", SAFE_MARKET_CATALOG.usdeUsdMaximumAge],
      [
        "sequencerGracePeriod()",
        "uint256",
        SAFE_MARKET_CATALOG.sequencerGracePeriod,
      ],
    ] as const;
    for (const [signature, output, expected] of oracleChecks) {
      const [actual] = await callHex(url, context.oracle, signature, output);
      const normalized =
        output === "address"
          ? addressValue(actual, signature)
          : bigintValue(actual, signature);
      if (normalized !== expected)
        throw new Error(`${signature} immutable drifted`);
    }
    const [liveRate] = await callHex(url, context.oracle, "rate()", "uint256");
    const rate = bigintValue(liveRate, "oracle rate");
    if (rate < context.market.rateMin || rate > context.market.rateMax) {
      throw new Error(
        "deployed oracle rate is outside the frozen initial bounds",
      );
    }
    const actualMarket = await callHex(
      url,
      context.poolManager,
      "market(bytes32)",
      "address collateralAsset,address referenceAsset,uint256 expiryTimestamp,uint256 rateMin,uint256 rateMax,uint256 rateChangePerDayMax,uint256 rateChangeCapacityMax,address rateOracle",
      [context.marketId],
    );
    assertMarketTuple(actualMarket, context.market);
    const [swapFee] = await callHex(
      url,
      context.poolManager,
      "swapFee(bytes32)",
      "uint256",
      [context.marketId],
    );
    const [unwindFee] = await callHex(
      url,
      context.poolManager,
      "unwindSwapFee(bytes32)",
      "uint256",
      [context.marketId],
    );
    if (
      bigintValue(swapFee, "swap fee") !== SAFE_MARKET_CATALOG.swapFee ||
      bigintValue(unwindFee, "unwind fee") !== SAFE_MARKET_CATALOG.unwindSwapFee
    ) {
      throw new Error("market fee configuration drifted");
    }
    const [whitelistEnabled] = await callHex(
      url,
      context.whitelistManager,
      "isMarketWhitelistEnabled(bytes32)",
      "bool",
      [context.marketId],
    );
    if (booleanValue(whitelistEnabled, "whitelist state")) {
      throw new Error("market whitelist was not disabled");
    }
    const shares = await callHex(
      url,
      context.poolManager,
      "shares(bytes32)",
      "address principalToken,address swapToken",
      [context.marketId],
    );
    if (
      addressValue(shares[0], "principal token") === ZERO_ADDRESS ||
      addressValue(shares[1], "swap token") === ZERO_ADDRESS
    ) {
      throw new Error("pool share bootstrap did not complete");
    }
    if (keccak256(scheduleData) !== keccak256(context.scheduleData)) {
      throw new Error("schedule calldata hash changed during proof");
    }
    if (keccak256(executeData) !== keccak256(context.executeData)) {
      throw new Error("execute calldata hash changed during proof");
    }
  } catch (error: unknown) {
    const detail = stderr.join("").trim();
    const message =
      error instanceof Error ? error.message : "unknown proof failure";
    throw new Error(
      detail.length === 0 ? message : `${message}; Anvil: ${detail}`,
    );
  } finally {
    try {
      await rpc(url, "anvil_stopImpersonatingAccount", [context.owner]);
    } catch {
      // The child may already have exited; process termination below is authoritative.
    }
    child.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => {
      if (child.exitCode !== null) resolvePromise();
      else {
        child.once("exit", () => resolvePromise());
        setTimeout(() => {
          child.kill("SIGKILL");
          resolvePromise();
        }, 2_000);
      }
    });
  }
}
