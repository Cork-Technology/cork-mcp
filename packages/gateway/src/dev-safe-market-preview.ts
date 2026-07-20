#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SAFE_MARKET_PROFILE } from "./safe-market.js";

function firstText(content: unknown): string {
  if (!Array.isArray(content))
    throw new Error("tool returned no content array");
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
  throw new Error("tool returned no text content");
}

const unknown = process.argv.slice(2);
if (unknown.length > 0) {
  process.stderr.write(`unknown argument: ${unknown.join(", ")}\n`);
  process.exitCode = 2;
} else {
  const serverPath = fileURLToPath(new URL("./dev-server.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath, "--safe-market-preview", "--quiet"],
    stderr: "pipe",
  });
  const serverErrors: string[] = [];
  transport.stderr?.on("data", (chunk: Buffer | string) => {
    serverErrors.push(chunk.toString());
  });
  const client = new Client(
    { name: "cork-safe-market-preview", version: "0.1.0" },
    { capabilities: {} },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const tool = tools.tools.find(
      (candidate) => candidate.name === "cork_prepare_market",
    );
    if (tool === undefined)
      throw new Error("cork_prepare_market was not discovered");
    if (
      tools.tools.some((candidate) => candidate.name !== "cork_prepare_market")
    ) {
      throw new Error(
        "Safe market preview mode exposed an unrelated public tool",
      );
    }
    const called = await client.callTool({
      name: "cork_prepare_market",
      arguments: {
        variant: "safe-package",
        input: { profile: SAFE_MARKET_PROFILE },
      },
    });
    if (called.isError === true) {
      throw new Error(`tool call failed: ${firstText(called.content)}`);
    }
    const parsed: unknown = JSON.parse(firstText(called.content));
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "unknown client failure";
    const details = serverErrors.join("").trim();
    process.stderr.write(
      details.length === 0 ? `${message}\n` : `${message}\n${details}\n`,
    );
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
