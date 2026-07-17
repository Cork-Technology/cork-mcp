#!/usr/bin/env node

import {
  createLocalFixtureGateway,
  LOCAL_FIXTURE_NOTICE,
} from "./dev-fixture.js";
import { startStdioServer } from "./stable.js";

const VERSION = "0.1.0";
const HELP = `Cork local fixture Model Context Protocol server

Usage: cork-mcp-dev [--quiet]

Options:
  --quiet    Suppress the fixture warning on stderr
  --help     Print this help and exit
  --version  Print the server version and exit

The no-argument and --quiet forms start a standard-input/output server.
This fixture performs no network calls, signing, submission, or persistence.
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
  const unknown = args.filter((arg) => arg !== "--quiet");
  if (unknown.length > 0) {
    fail(`Unknown argument: ${unknown.join(", ")}`, 2);
  }
  requireSupportedRuntime();
  if (!args.includes("--quiet")) {
    process.stderr.write(`[cork-mcp] ${LOCAL_FIXTURE_NOTICE}\n`);
  }
  const fixture = createLocalFixtureGateway();
  await startStdioServer({
    router: fixture.router,
    principal: fixture.principal,
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
