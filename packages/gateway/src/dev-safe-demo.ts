import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULTS: Readonly<{
  market: string;
  shares: string;
  minimumCollateral: string;
  nonce: string;
}> = Object.freeze({
  market: "synthetic-weth-usdc-2027",
  shares: "2500000000000",
  minimumCollateral: "1000000",
  nonce: "7",
});

const HELP = `Cork local Safe transaction demo

Usage:
  npm run mcp:safe-demo -- [options]

Options:
  --list                    List local synthetic markets and exit
  --coverage                Construct proposals for all six action profiles
  --market ID               Select a fixture market
  --shares AMOUNT           Paired shares requested, as an integer
  --min-collateral AMOUNT   Minimum collateral output, as an integer
  --nonce NONCE             Fixture Safe nonce
  --receiver ADDRESS        Optional lowercase receiver address
  --json                    Print the complete fixture result as JSON
  --help                    Print this help and exit

Defaults:
  market=${DEFAULTS.market}
  shares=${DEFAULTS.shares}
  min-collateral=${DEFAULTS.minimumCollateral}
  nonce=${DEFAULTS.nonce}

This command starts the local Model Context Protocol server, constructs an
unsigned fixture Safe transaction, prints it, and exits. It never connects to
a chain, collects Safe confirmations, or broadcasts.
`;

interface DemoOptions {
  readonly list: boolean;
  readonly coverage: boolean;
  readonly json: boolean;
  readonly market: string;
  readonly shares: string;
  readonly minimumCollateral: string;
  readonly nonce: string;
  readonly receiver?: string;
}

interface ToolCallEnvelope {
  readonly state?: unknown;
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
  readonly data?: {
    readonly fixtureOnly?: unknown;
    readonly broadcastReady?: unknown;
    readonly markets?: readonly {
      readonly id?: unknown;
      readonly displayName?: unknown;
      readonly shareQuantum?: unknown;
    }[];
    readonly market?: {
      readonly id?: unknown;
      readonly displayName?: unknown;
    };
    readonly prepared?: {
      readonly constraints?: {
        readonly requestedSharesIn?: unknown;
        readonly effectiveSharesIn?: unknown;
        readonly minimumCollateralAssetsOut?: unknown;
      };
    };
    readonly safeTransaction?: {
      readonly to?: unknown;
      readonly value?: unknown;
      readonly data?: unknown;
      readonly operation?: unknown;
      readonly nonce?: unknown;
      readonly safeTxHash?: unknown;
      readonly transactionAuthorization?: unknown;
    };
    readonly actions?: readonly {
      readonly profile?: unknown;
      readonly coreFunction?: unknown;
      readonly safeProposal?: {
        readonly nonce?: unknown;
        readonly safeTxHash?: unknown;
        readonly data?: unknown;
      };
    }[];
    readonly safety?: unknown;
  };
}

function fail(message: string): never {
  throw new TypeError(message);
}

function optionValue(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return fail(`${args[index]} requires a value`);
  }
  return value;
}

function parseOptions(args: readonly string[]): DemoOptions | "help" {
  let list = false;
  let coverage = false;
  let json = false;
  let market = DEFAULTS.market;
  let shares = DEFAULTS.shares;
  let minimumCollateral = DEFAULTS.minimumCollateral;
  let nonce = DEFAULTS.nonce;
  let receiver: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--help":
        return "help";
      case "--list":
        list = true;
        break;
      case "--coverage":
        coverage = true;
        break;
      case "--json":
        json = true;
        break;
      case "--market":
        market = optionValue(args, index);
        index += 1;
        break;
      case "--shares":
        shares = optionValue(args, index);
        index += 1;
        break;
      case "--min-collateral":
        minimumCollateral = optionValue(args, index);
        index += 1;
        break;
      case "--nonce":
        nonce = optionValue(args, index);
        index += 1;
        break;
      case "--receiver":
        receiver = optionValue(args, index);
        index += 1;
        break;
      default:
        return fail(`unknown argument: ${String(argument)}`);
    }
  }
  return {
    list,
    coverage,
    json,
    market,
    shares,
    minimumCollateral,
    nonce,
    ...(receiver === undefined ? {} : { receiver }),
  };
}

function firstText(content: unknown): string {
  if (!Array.isArray(content)) {
    return fail("tool returned invalid content");
  }
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

function parseEnvelope(content: unknown): ToolCallEnvelope {
  return JSON.parse(firstText(content)) as ToolCallEnvelope;
}

function assertSuccessful(
  envelope: ToolCallEnvelope,
  operation: string,
): asserts envelope is ToolCallEnvelope & {
  readonly state: "ok";
  readonly data: NonNullable<ToolCallEnvelope["data"]>;
} {
  if (envelope.state !== "ok" || envelope.data === undefined) {
    const code = String(envelope.error?.code ?? "UNKNOWN");
    const message = String(envelope.error?.message ?? "no error message");
    fail(`${operation} failed (${code}): ${message}`);
  }
}

const parsed = parseOptions(process.argv.slice(2));
if (parsed === "help") {
  process.stdout.write(HELP);
} else {
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
    { name: "cork-local-safe-demo", version: "0.1.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    const marketsEnvelope = parseEnvelope(
      (
        await client.callTool({
          name: "cork_query",
          arguments: { variant: "fixture-markets", input: {} },
        })
      ).content,
    );
    assertSuccessful(marketsEnvelope, "market listing");
    const markets = marketsEnvelope.data.markets;
    if (markets === undefined || markets.length === 0) {
      fail("market listing returned no local fixture markets");
    }
    if (parsed.list) {
      process.stdout.write(
        [
          "Local synthetic Cork markets:",
          ...markets.map(
            (market) =>
              `- ${String(market.id)}: ${String(market.displayName)} (share quantum ${String(market.shareQuantum)})`,
          ),
          "",
        ].join("\n"),
      );
    } else if (parsed.coverage) {
      const coverageEnvelope = parseEnvelope(
        (
          await client.callTool({
            name: "cork_prepare_phoenix",
            arguments: {
              variant: "fixture-safe-coverage",
              input: {
                marketId: parsed.market,
                baseSafeNonce: parsed.nonce,
              },
            },
          })
        ).content,
      );
      assertSuccessful(coverageEnvelope, "Safe action coverage preparation");
      const result = coverageEnvelope.data;
      if (
        result.fixtureOnly !== true ||
        result.broadcastReady !== false ||
        result.actions === undefined ||
        result.actions.length !== 6 ||
        result.actions.some(
          (action) =>
            typeof action.safeProposal?.safeTxHash !== "string" ||
            typeof action.safeProposal.data !== "string",
        )
      ) {
        fail("Safe action coverage returned an unsafe or incomplete result");
      }
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(
          [
            "Cork local Safe action coverage constructed.",
            `Market: ${String(result.market?.displayName)}`,
            ...result.actions.map(
              (action) =>
                `- ${String(action.profile)} -> ${String(action.coreFunction)} | nonce ${String(action.safeProposal?.nonce)} | ${String(action.safeProposal?.safeTxHash)}`,
            ),
            "",
            "Six proposals constructed; no Safe confirmations collected.",
            "Broadcast: no — synthetic local fixtures only",
            "Chain simulation: no — use production evidence and a pinned fork for a real Safe",
            "",
            "Use --json to inspect every prepared, finalized, and Safe proposal artifact.",
            "",
          ].join("\n"),
        );
      }
    } else {
      const selected = markets.find((market) => market.id === parsed.market);
      if (selected === undefined) {
        fail(`unknown local fixture market: ${parsed.market}`);
      }
      const preparedEnvelope = parseEnvelope(
        (
          await client.callTool({
            name: "cork_prepare_phoenix",
            arguments: {
              variant: "fixture-safe-unwind",
              input: {
                marketId: parsed.market,
                requestedSharesIn: parsed.shares,
                minimumCollateralAssetsOut: parsed.minimumCollateral,
                safeNonce: parsed.nonce,
                ...(parsed.receiver === undefined
                  ? {}
                  : { receiver: parsed.receiver }),
              },
            },
          })
        ).content,
      );
      assertSuccessful(preparedEnvelope, "Safe unwind preparation");
      const result = preparedEnvelope.data;
      const transaction = result.safeTransaction;
      if (
        result.fixtureOnly !== true ||
        result.broadcastReady !== false ||
        transaction === undefined ||
        typeof transaction.data !== "string" ||
        typeof transaction.safeTxHash !== "string"
      ) {
        fail("Safe unwind preparation returned an unsafe or incomplete result");
      }
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        const constraints = result.prepared?.constraints;
        process.stdout.write(
          [
            "Cork local Safe transaction constructed.",
            `Market: ${String(result.market?.displayName)}`,
            `Requested shares: ${String(constraints?.requestedSharesIn)}`,
            `Effective shares after precision rounding: ${String(constraints?.effectiveSharesIn)}`,
            `Safe nonce: ${String(transaction.nonce)}`,
            `Safe transaction hash: ${transaction.safeTxHash}`,
            `Target: ${String(transaction.to)}`,
            `Value: ${String(transaction.value)}`,
            `Operation: ${String(transaction.operation)}`,
            `Calldata bytes: ${(transaction.data.length - 2) / 2}`,
            "Authorization: caller-owned; no Safe confirmations collected",
            "Broadcast: no — local fixture only",
            "",
            "Use --json to inspect the complete prepared, finalized, and Safe artifacts.",
            "",
          ].join("\n"),
        );
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    const stderr = serverErrors.join("").trim();
    process.stderr.write(
      `Cork local Safe demo failed: ${message}${stderr.length === 0 ? "" : `\nServer stderr:\n${stderr}`}\n`,
    );
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
