#!/usr/bin/env node

import {
  createLocalFixtureGateway,
  LOCAL_FIXTURE_NOTICE,
} from "./dev-fixture.js";
import { createLocalLiveReadGateway, PHOENIX_API_ORIGIN } from "./live-read.js";
import { PublicToolRouter } from "./public-tools.js";
import { createSafeMarketPreviewGateway } from "./safe-market-mode.js";
import { startStdioServer } from "./stable.js";

const VERSION = "0.1.0";
const HELP = `Cork Model Context Protocol server

Usage: cork-mcp [--live-read | --safe-market-preview] [--quiet]

Options:
  --live-read  Enable read-only requests to the public Phoenix API
  --safe-market-preview  Build and fork-prove the immutable Arbitrum Safe package
  --quiet    Suppress the fixture warning on stderr
  --help     Print this help and exit
  --version  Print the server version and exit

The server uses standard input/output. Without an explicit mode it is fully local.
Live-read mode permits GET requests only to the configured public Phoenix API.
Safe-market-preview reads two Arbitrum providers and writes unsigned Safe files.
No mode signs, confirms, submits, or broadcasts transactions.
`;

function fail(message: string, exitCode: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(exitCode);
}

function requireSupportedRuntime(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (major !== 22) {
    fail(
      `Node.js 22.x is required; received ${process.versions.node}. Switch runtimes before starting the local fixture server.`,
      1,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }
  if (args.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const unknown = args.filter(
    (arg) =>
      arg !== "--quiet" &&
      arg !== "--live-read" &&
      arg !== "--safe-market-preview",
  );
  if (unknown.length > 0) {
    fail(`Unknown argument: ${unknown.join(", ")}`, 2);
  }
  requireSupportedRuntime();
  const liveRead = args.includes("--live-read");
  const safeMarketPreview = args.includes("--safe-market-preview");
  if (liveRead && safeMarketPreview) {
    fail("--live-read and --safe-market-preview are mutually exclusive", 2);
  }
  if (!args.includes("--quiet")) {
    process.stderr.write(
      safeMarketPreview
        ? "[cork-mcp] Safe market preview mode: quorum reads and local fork proof only; no transaction will be signed or broadcast.\n"
        : liveRead
          ? `[cork-mcp] Live read-only mode: GET ${PHOENIX_API_ORIGIN}; responses remain untrusted source observations.\n`
          : `[cork-mcp] ${LOCAL_FIXTURE_NOTICE}\n`,
    );
  }
  const gateway = safeMarketPreview
    ? createSafeMarketPreviewGateway()
    : liveRead
      ? createLocalLiveReadGateway({
          fetch: (input, init) => fetch(input, init),
          now: () => Date.now().toString(),
        })
      : createLocalFixtureGateway();
  await startStdioServer({
    router: new PublicToolRouter(gateway.router),
    principal: gateway.principal,
  });
}

await main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "unknown startup error";
  process.stderr.write(
    `[cork-mcp] Failed to start local fixture server: ${message}\n`,
  );
  process.exitCode = 1;
});
