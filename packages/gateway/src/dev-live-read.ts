import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HELP = `Cork live read-only integration test

Usage:
  npm run mcp:live-read -- [--json]

Options:
  --json  Print the machine-readable summary
  --help  Print this help and exit

The command calls the public Phoenix API through the Cork Model Context
Protocol server and canonical Node adapter. It performs GET requests only.
API payloads remain untrusted source observations and are never executed.
`;

interface RouterEnvelope {
  readonly ok?: unknown;
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
  };
  readonly coreResult?: {
    readonly kind?: unknown;
    readonly failure?: {
      readonly code?: unknown;
      readonly message?: unknown;
    };
    readonly observedAt?: unknown;
    readonly value?: {
      readonly operation?: unknown;
      readonly items?: readonly unknown[];
      readonly pages?: readonly {
        readonly statusCode?: unknown;
        readonly bodyDigest?: unknown;
      }[];
      readonly pagination?: {
        readonly complete?: unknown;
        readonly pagesRead?: unknown;
        readonly itemsRead?: unknown;
        readonly stopReason?: unknown;
      };
    };
  };
}

interface ReadSummary {
  readonly operation: string;
  readonly items: number;
  readonly pages: number;
  readonly complete: boolean;
  readonly statusCodes: readonly number[];
  readonly payloadDigests: readonly string[];
}

interface SuccessfulRead {
  readonly summary: ReadSummary;
  readonly items: readonly unknown[];
}

interface MarketSnapshot {
  readonly poolId: string;
  readonly poolName: string;
  readonly chainId: number;
  readonly expiry: string;
  readonly isWhitelistEnabled: boolean;
  readonly isDepositPaused: boolean;
  readonly collateralSymbol: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function firstText(content: unknown): string {
  if (!Array.isArray(content)) return fail("tool returned invalid content");
  for (const item of content) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      return item.text;
    }
  }
  return fail("tool returned no text content");
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function assertPoolPartition(
  items: readonly unknown[],
  cutoff: string,
  partition: "current" | "past",
): void {
  if (items.length === 0) {
    fail(`the Phoenix API returned no ${partition} pools`);
  }
  const cutoffMs = Date.parse(cutoff);
  for (const item of items) {
    const expiry = record(item)?.["expiry"];
    const expiryMs =
      typeof expiry === "string" ? Date.parse(expiry) : Number.NaN;
    const matches =
      partition === "current" ? expiryMs > cutoffMs : expiryMs < cutoffMs;
    if (!Number.isFinite(expiryMs) || !matches) {
      fail(
        `${partition} pool response contained an invalid expiry: ${String(expiry)}`,
      );
    }
  }
}

function marketSnapshot(value: unknown, label: string): MarketSnapshot {
  const pool = record(value);
  const collateral = record(pool?.["collateralToken"]);
  if (
    pool === undefined ||
    typeof pool["poolId"] !== "string" ||
    typeof pool["poolName"] !== "string" ||
    typeof pool["chainId"] !== "number" ||
    typeof pool["expiry"] !== "string" ||
    typeof pool["isWhitelistEnabled"] !== "boolean" ||
    typeof pool["isDepositPaused"] !== "boolean" ||
    typeof collateral?.["symbol"] !== "string"
  ) {
    fail(`${label} contained an incomplete market record`);
  }
  return {
    poolId: pool["poolId"],
    poolName: pool["poolName"],
    chainId: pool["chainId"],
    expiry: pool["expiry"],
    isWhitelistEnabled: pool["isWhitelistEnabled"],
    isDepositPaused: pool["isDepositPaused"],
    collateralSymbol: collateral["symbol"],
  };
}

function summarize(envelope: RouterEnvelope, label: string): SuccessfulRead {
  if (envelope.ok !== true || envelope.coreResult === undefined) {
    return fail(
      `${label} failed (${String(envelope.error?.code)}): ${String(envelope.error?.message)}`,
    );
  }
  const observation = envelope.coreResult;
  if (observation.kind !== "success" || observation.value === undefined) {
    return fail(
      `${label} source observation failed (${String(observation.failure?.code)}): ${String(observation.failure?.message)}`,
    );
  }
  const value = observation.value;
  if (
    typeof value.operation !== "string" ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.pages) ||
    value.pagination === undefined ||
    value.pagination.complete !== true ||
    typeof value.pagination.pagesRead !== "number" ||
    typeof value.pagination.itemsRead !== "number"
  ) {
    return fail(
      `${label} returned an incomplete or malformed projection (${String(value.pagination?.stopReason)})`,
    );
  }
  const statusCodes = value.pages.map((page) => {
    if (typeof page.statusCode !== "number") {
      return fail(`${label} page omitted its HTTP status`);
    }
    return page.statusCode;
  });
  const payloadDigests = value.pages.map((page) => {
    if (typeof page.bodyDigest !== "string") {
      return fail(`${label} page omitted its payload digest`);
    }
    return page.bodyDigest;
  });
  return {
    summary: {
      operation: value.operation,
      items: value.pagination.itemsRead,
      pages: value.pagination.pagesRead,
      complete: true,
      statusCodes,
      payloadDigests,
    },
    items: value.items,
  };
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(HELP);
} else {
  const unknown = args.filter((argument) => argument !== "--json");
  if (unknown.length > 0) fail(`unknown argument: ${unknown.join(", ")}`);

  const serverPath = fileURLToPath(new URL("./dev-server.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath, "--live-read", "--quiet"],
    stderr: "pipe",
  });
  const serverErrors: string[] = [];
  transport.stderr?.on("data", (chunk: Buffer | string) => {
    serverErrors.push(chunk.toString());
  });
  const client = new Client(
    { name: "cork-live-read-test", version: "0.1.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const expectedTools = [
      "cork.phoenix.pools.list.v1",
      "cork.phoenix.poolWhitelists.list.v1",
      "cork.phoenix.flows.list.v1",
      "cork.phoenix.limitOrders.markets.list.v1",
      "cork.phoenix.limitOrders.orderbook.list.v1",
      "cork.phoenix.limitOrders.fills.list.v1",
    ];
    for (const name of expectedTools) {
      if (!tools.tools.some((tool) => tool.name === name)) {
        fail(`${name} was not discovered`);
      }
    }
    if (
      tools.tools.some(
        (tool) => tool.name.includes("prepare") || tool.name.includes("submit"),
      )
    ) {
      fail("live read-only mode exposed a write tool");
    }

    const call = async (
      name: string,
      argumentsValue: Readonly<Record<string, unknown>>,
      label: string,
    ): Promise<SuccessfulRead> =>
      summarize(
        JSON.parse(
          firstText(
            (await client.callTool({ name, arguments: argumentsValue }))
              .content,
          ),
        ) as RouterEnvelope,
        label,
      );

    const bounds = { maxPages: 3, maxItems: 500, limit: 200 } as const;
    const cutoff = new Date().toISOString();
    const allPools = await call(
      "cork.phoenix.pools.list.v1",
      bounds,
      "all pools",
    );
    const currentPools = await call(
      "cork.phoenix.pools.list.v1",
      { ...bounds, expiryAfter: cutoff },
      "current pools",
    );
    const pastPools = await call(
      "cork.phoenix.pools.list.v1",
      { ...bounds, expiryBefore: cutoff },
      "past pools",
    );
    assertPoolPartition(currentPools.items, cutoff, "current");
    assertPoolPartition(pastPools.items, cutoff, "past");
    const currentMarketSnapshot = currentPools.items.map((item) =>
      marketSnapshot(item, "current pool response"),
    );
    const pastMarketSnapshot = pastPools.items.map((item) =>
      marketSnapshot(item, "past pool response"),
    );
    const firstPool = record(currentPools.items[0] ?? allPools.items[0]);
    const poolId = firstPool?.["poolId"];
    if (firstPool === undefined || typeof poolId !== "string") {
      fail("the Phoenix API returned no pool identity for related reads");
    }

    const [flows, whitelists, orderMarkets, orderbook, fills] =
      await Promise.all([
        call("cork.phoenix.flows.list.v1", { ...bounds, poolId }, "pool flows"),
        call(
          "cork.phoenix.poolWhitelists.list.v1",
          { ...bounds, poolId },
          "pool whitelists",
        ),
        call(
          "cork.phoenix.limitOrders.markets.list.v1",
          bounds,
          "limit-order markets",
        ),
        call(
          "cork.phoenix.limitOrders.orderbook.list.v1",
          bounds,
          "limit-order orderbook",
        ),
        call(
          "cork.phoenix.limitOrders.fills.list.v1",
          bounds,
          "limit-order fills",
        ),
      ]);

    const summary = {
      schemaVersion: "cork.live-read-test/v1",
      endpoint: "https://api-phoenix.cork.tech",
      cutoff,
      discoveredTools: tools.tools.length,
      selectedPool: {
        poolId,
        poolName: firstPool["poolName"],
        expiry: firstPool["expiry"],
      },
      reads: {
        allPools: allPools.summary,
        currentPools: currentPools.summary,
        pastPools: pastPools.summary,
        flows: flows.summary,
        whitelists: whitelists.summary,
        limitOrderMarkets: orderMarkets.summary,
        orderbook: orderbook.summary,
        fills: fills.summary,
      },
      markets: {
        current: currentMarketSnapshot,
        currentWithoutWhitelist: currentMarketSnapshot.filter(
          (market) => !market.isWhitelistEnabled,
        ),
        pastWithoutWhitelist: pastMarketSnapshot.filter(
          (market) => !market.isWhitelistEnabled,
        ),
      },
      safety: {
        methods: ["GET"],
        writeToolsExposed: false,
        poolPartitionsVerified: true,
        sourceClassification: "untrusted-observation",
      },
    } as const;
    if (args.includes("--json")) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      const lines = Object.entries(summary.reads).map(
        ([name, value]) =>
          `- ${name}: ${value.items} items, ${value.pages} page(s), HTTP ${value.statusCodes.join(",")}`,
      );
      const unwhitelisted = summary.markets.currentWithoutWhitelist;
      process.stdout.write(
        [
          "Cork live read-only integration test passed.",
          `Endpoint: ${summary.endpoint}`,
          `Discovered read tools: ${summary.discoveredTools}`,
          `Cutoff: ${summary.cutoff}`,
          `Selected pool: ${String(summary.selectedPool.poolName)} (${summary.selectedPool.poolId})`,
          ...lines,
          `Current markets without a whitelist: ${unwhitelisted.length}`,
          ...unwhitelisted.map(
            (market) =>
              `  - ${market.poolName} (${market.poolId}, chain ${market.chainId})`,
          ),
          "Safety: GET only; no write tools exposed; source data remained untrusted",
          "",
        ].join("\n"),
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    const stderr = serverErrors.join("").trim();
    process.stderr.write(
      `Cork live read-only integration test failed: ${message}${stderr.length === 0 ? "" : `\nServer stderr:\n${stderr}`}\n`,
    );
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
