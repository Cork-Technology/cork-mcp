import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface FixtureCallResult {
  readonly state?: unknown;
  readonly data?: {
    readonly fixtureOnly?: unknown;
    readonly broadcastReady?: unknown;
    readonly markets?: readonly {
      readonly id?: unknown;
      readonly displayName?: unknown;
    }[];
    readonly market?: {
      readonly id?: unknown;
      readonly displayName?: unknown;
    };
    readonly safeTransaction?: {
      readonly to?: unknown;
      readonly data?: unknown;
      readonly nonce?: unknown;
      readonly safeTxHash?: unknown;
      readonly transactionAuthorization?: unknown;
    };
  };
}

function firstTextContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
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
  return undefined;
}

function parseCallResult(content: unknown, label: string): FixtureCallResult {
  const value = firstTextContent(content);
  if (value === undefined) {
    throw new Error(`${label} returned no text content`);
  }
  return JSON.parse(value) as FixtureCallResult;
}

const serverPath = fileURLToPath(new URL("./dev-server.js", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath, "--quiet"],
  stderr: "pipe",
});
const serverErrors: string[] = [];
transport.stderr?.on("data", (chunk: Buffer | string) => {
  serverErrors.push(chunk.toString());
});
const client = new Client(
  { name: "cork-local-fixture-smoke", version: "0.1.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  const listed = await client.listTools();
  if (!listed.tools.some((tool) => tool.name === "cork_capabilities")) {
    throw new Error("cork_capabilities was not discovered");
  }
  for (const name of ["cork_query", "cork_prepare_phoenix"]) {
    if (!listed.tools.some((tool) => tool.name === name)) {
      throw new Error(`${name} was not discovered`);
    }
  }
  const called = await client.callTool({
    name: "cork_capabilities",
    arguments: {},
  });
  const result = parseCallResult(called.content, "capability call");
  if (result.state !== "ok" || result.data === undefined) {
    throw new Error("capability call was not a successful fixture response");
  }

  const listedMarkets = parseCallResult(
    (
      await client.callTool({
        name: "cork_query",
        arguments: { variant: "fixture-markets", input: {} },
      })
    ).content,
    "local market list",
  );
  const market = listedMarkets.data?.markets?.[0];
  if (
    listedMarkets.state !== "ok" ||
    listedMarkets.data?.fixtureOnly !== true ||
    typeof market?.id !== "string" ||
    typeof market.displayName !== "string"
  ) {
    throw new Error("local market list did not return a fixture market");
  }

  const prepared = parseCallResult(
    (
      await client.callTool({
        name: "cork_prepare_phoenix",
        arguments: {
          variant: "fixture-safe-unwind",
          input: {
            marketId: market.id,
            requestedSharesIn: "2500000000000",
            minimumCollateralAssetsOut: "1000000",
            safeNonce: "7",
          },
        },
      })
    ).content,
    "local Safe unwind preparation",
  );
  const safeTransaction = prepared.data?.safeTransaction;
  if (
    prepared.state !== "ok" ||
    prepared.data?.fixtureOnly !== true ||
    prepared.data.broadcastReady !== false ||
    typeof safeTransaction?.to !== "string" ||
    typeof safeTransaction.data !== "string" ||
    typeof safeTransaction.safeTxHash !== "string" ||
    safeTransaction.transactionAuthorization !== "caller-owned-not-collected"
  ) {
    throw new Error("local Safe unwind preparation was not safe and complete");
  }
  const calldataBytes = Math.max(0, (safeTransaction.data.length - 2) / 2);
  process.stdout.write(
    [
      "Cork local Model Context Protocol smoke test passed.",
      `Discovered tools: ${listed.tools.length}`,
      `Fixture market: ${market.displayName}`,
      `Safe transaction hash: ${safeTransaction.safeTxHash}`,
      `Target: ${safeTransaction.to}`,
      `Calldata: ${calldataBytes} bytes`,
      `Safe nonce: ${String(safeTransaction.nonce)}`,
      "Authorization: caller-owned; no Safe confirmations collected",
      "Safety: local fixture only; transaction was not broadcast",
      "",
    ].join("\n"),
  );
} catch (error: unknown) {
  const message =
    error instanceof Error ? error.message : "unknown smoke error";
  const stderr = serverErrors.join("").trim();
  process.stderr.write(
    `Cork local Model Context Protocol smoke test failed: ${message}${stderr.length === 0 ? "" : `\nServer stderr:\n${stderr}`}\n`,
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
