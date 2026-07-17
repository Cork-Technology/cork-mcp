import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface FixtureCallResult {
  readonly ok?: unknown;
  readonly coreResult?: {
    readonly fixtureOnly?: unknown;
  };
}

function firstTextContent(content: readonly unknown[]): string | undefined {
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
  if (!listed.tools.some((tool) => tool.name === "cork.capabilities.v1")) {
    throw new Error("cork.capabilities.v1 was not discovered");
  }
  const called = await client.callTool({
    name: "cork.capabilities.v1",
    arguments: {},
  });
  const text = Array.isArray(called.content)
    ? firstTextContent(called.content)
    : undefined;
  if (text === undefined) {
    throw new Error("capability call returned no text content");
  }
  const result = JSON.parse(text) as FixtureCallResult;
  if (result.ok !== true || result.coreResult?.fixtureOnly !== true) {
    throw new Error("capability call was not a successful fixture response");
  }
  process.stdout.write(
    [
      "Cork local Model Context Protocol smoke test passed.",
      `Discovered tools: ${listed.tools.length}`,
      "Called: cork.capabilities.v1",
      "Safety: fixture-only response confirmed",
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
