#!/usr/bin/env node

import {
  createLocalFixtureGateway,
  LOCAL_FIXTURE_NOTICE,
} from "./dev-fixture.js";
import { createLocalLiveReadGateway, PHOENIX_API_ORIGIN } from "./live-read.js";
import { PublicToolRouter } from "./public-tools.js";
import { startStdioServer } from "./stable.js";

const VERSION = "0.1.0";
const HELP = `Cork Model Context Protocol server

Usage: cork-mcp [--live-read] [--quiet]

Options:
  --live-read  Enable read-only requests to the public Phoenix API
  --quiet    Suppress the fixture warning on stderr
  --help     Print this help and exit
  --version  Print the server version and exit

The server uses standard input/output. Without --live-read it is fully local.
Live-read mode permits GET requests only to the configured public Phoenix API.
Neither mode signs, confirms, submits, broadcasts, or persists transactions.
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
    (arg) => arg !== "--quiet" && arg !== "--live-read",
  );
  if (unknown.length > 0) {
    fail(`Unknown argument: ${unknown.join(", ")}`, 2);
  }
  requireSupportedRuntime();
  const liveRead = args.includes("--live-read");
  if (!args.includes("--quiet")) {
    process.stderr.write(
      liveRead
        ? `[cork-mcp] Live read-only mode: GET ${PHOENIX_API_ORIGIN}; responses remain untrusted source observations.\n`
        : `[cork-mcp] ${LOCAL_FIXTURE_NOTICE}\n`,
    );
  }
  const gateway = liveRead
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
