#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createLocalFixtureGateway,
  LOCAL_FIXTURE_NOTICE,
} from "./dev-fixture.js";
import { createLocalLiveReadGateway, PHOENIX_API_ORIGIN } from "./live-read.js";
import {
  PUBLIC_TOOL_REGISTRY,
  PublicToolRouter,
  type PublicToolName,
  type PublicToolRegistryEntry,
} from "./public-tools.js";
import type { CredentialClaims } from "./controls.js";

const VERSION = "0.1.0";
const MAX_INPUT_BYTES = 2_000_000;

const HELP = `Cork command-line interface

Usage:
  cork capabilities [--live-read]
  cork query VARIANT --input-file FILE [--live-read]
  cork compute VARIANT --input-file FILE
  cork decode VARIANT --input-file FILE
  cork prepare phoenix VARIANT --input-file FILE
  cork prepare orders VARIANT --input-file FILE
  cork prepare market VARIANT --input-file FILE
  cork track VARIANT --input-file FILE
  cork submit VARIANT --input-file FILE
  cork call TOOL --input-file FILE [--live-read]

Options:
  --input-file FILE  Read JSON from FILE, or use - for standard input
  --input JSON       Use inline JSON instead of a file
  --variant NAME     Alternative to the positional variant
  --live-read        Enable GET-only reads from the public Phoenix API
  --pretty           Pretty-print JSON output
  --quiet            Suppress mode notices on standard error
  --help             Print this help and exit
  --version          Print the version and exit

Typed commands accept the selected variant's inner input object. The raw
"call" command accepts the complete public tool input object. Output is the
same structured envelope returned by the Model Context Protocol server.
`;

interface CliIo {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  readonly readInput: (path: string) => Promise<string>;
}

interface CliGateway {
  readonly router: PublicToolRouter;
  readonly principal: CredentialClaims;
}

export interface CliDependencies {
  readonly io?: CliIo;
  readonly createGateway?: (liveRead: boolean) => CliGateway;
}

interface ParsedOptions {
  readonly command: readonly string[];
  readonly liveRead: boolean;
  readonly pretty: boolean;
  readonly quiet: boolean;
  readonly inputFile?: string;
  readonly inlineInput?: string;
  readonly variant?: string;
}

function fail(message: string): never {
  throw new TypeError(message);
}

function optionValue(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return fail(`${String(args[index])} requires a value`);
  }
  return value;
}

function parseOptions(args: readonly string[]): ParsedOptions {
  const command: string[] = [];
  let liveRead = false;
  let pretty = false;
  let quiet = false;
  let inputFile: string | undefined;
  let inlineInput: string | undefined;
  let variant: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--live-read":
        liveRead = true;
        break;
      case "--pretty":
        pretty = true;
        break;
      case "--quiet":
        quiet = true;
        break;
      case "--input-file":
        inputFile = optionValue(args, index);
        index += 1;
        break;
      case "--input":
        inlineInput = optionValue(args, index);
        index += 1;
        break;
      case "--variant":
        variant = optionValue(args, index);
        index += 1;
        break;
      default:
        if (argument?.startsWith("--") === true) {
          fail(`unknown option: ${argument}`);
        }
        if (argument !== undefined) command.push(argument);
    }
  }
  if (inputFile !== undefined && inlineInput !== undefined) {
    fail("--input-file and --input are mutually exclusive");
  }
  return {
    command,
    liveRead,
    pretty,
    quiet,
    ...(inputFile === undefined ? {} : { inputFile }),
    ...(inlineInput === undefined ? {} : { inlineInput }),
    ...(variant === undefined ? {} : { variant }),
  };
}

function commandEntry(segments: readonly string[]): {
  readonly entry: PublicToolRegistryEntry;
  readonly rest: readonly string[];
} {
  const entry = [...PUBLIC_TOOL_REGISTRY]
    .sort((left, right) => right.cliPath.length - left.cliPath.length)
    .find((candidate) =>
      candidate.cliPath.every((part, index) => segments[index] === part),
    );
  if (entry === undefined) fail(`unknown command: ${segments.join(" ")}`);
  return { entry, rest: segments.slice(entry.cliPath.length) };
}

function parseJson(source: string): unknown {
  if (Buffer.byteLength(source, "utf8") > MAX_INPUT_BYTES) {
    fail(`JSON input exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return fail("input is not valid JSON");
  }
}

async function loadJson(options: ParsedOptions, io: CliIo): Promise<unknown> {
  if (options.inlineInput !== undefined) return parseJson(options.inlineInput);
  if (options.inputFile === undefined) {
    return fail("a JSON input is required via --input-file or --input");
  }
  return parseJson(await io.readInput(options.inputFile));
}

function defaultGateway(liveRead: boolean): CliGateway {
  const gateway = liveRead
    ? createLocalLiveReadGateway({
        fetch: (input, init) => fetch(input, init),
        now: () => Date.now().toString(),
      })
    : createLocalFixtureGateway();
  return {
    router: new PublicToolRouter(gateway.router),
    principal: gateway.principal,
  };
}

const DEFAULT_IO: CliIo = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
  readInput: async (path) => {
    if (path !== "-") return readFile(path, "utf8");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  },
};

function jsonText(value: unknown, pretty: boolean): string {
  return `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;
}

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const io = dependencies.io ?? DEFAULT_IO;
  if (args.includes("--help")) {
    io.stdout(HELP);
    return 0;
  }
  if (args.includes("--version")) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  try {
    const runtimeMajor = Number.parseInt(
      process.versions.node.split(".")[0] ?? "",
      10,
    );
    if (dependencies.createGateway === undefined && runtimeMajor !== 22) {
      fail(`Node.js 22.x is required; received ${process.versions.node}`);
    }
    const options = parseOptions(args);
    if (options.command.length === 0) fail("a command is required");
    const gateway = (dependencies.createGateway ?? defaultGateway)(
      options.liveRead,
    );
    let name: PublicToolName;
    let argumentsValue: unknown;
    if (options.command[0] === "call") {
      const rawName = options.command[1];
      if (
        rawName === undefined ||
        !PUBLIC_TOOL_REGISTRY.some((entry) => entry.name === rawName)
      ) {
        fail("call requires a registered public tool name");
      }
      if (options.command.length !== 2)
        fail("call accepts exactly one tool name");
      name = rawName as PublicToolName;
      argumentsValue = await loadJson(options, io);
    } else {
      const { entry, rest } = commandEntry(options.command);
      name = entry.name;
      if (entry.inputStyle === "empty") {
        if (
          rest.length > 0 ||
          options.variant !== undefined ||
          options.inputFile !== undefined ||
          options.inlineInput !== undefined
        ) {
          fail(`${entry.cliPath.join(" ")} does not accept input`);
        }
        argumentsValue = {};
      } else {
        if (rest.length > 1) fail("too many positional arguments");
        const variant = options.variant ?? rest[0];
        if (variant === undefined) fail("a variant is required");
        argumentsValue = {
          variant,
          input: await loadJson(options, io),
        };
      }
    }
    if (!options.quiet) {
      io.stderr(
        options.liveRead
          ? `[cork] Live read-only mode: GET ${PHOENIX_API_ORIGIN}; responses remain untrusted observations.\n`
          : `[cork] ${LOCAL_FIXTURE_NOTICE}\n`,
      );
    }
    const result = await gateway.router.call({
      name,
      arguments: argumentsValue,
      principal: gateway.principal,
    });
    if (!result.ok) {
      io.stderr(
        jsonText(
          { schemaVersion: "cork.tool-error/v1", error: result.error },
          options.pretty,
        ),
      );
      return 2;
    }
    io.stdout(jsonText(result.coreResult, options.pretty));
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    io.stderr(
      jsonText(
        {
          schemaVersion: "cork.tool-error/v1",
          error: { code: "CLI_INPUT_INVALID", message },
        },
        args.includes("--pretty"),
      ),
    );
    return 2;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  realpathSync(resolve(invokedPath)) ===
    realpathSync(resolve(fileURLToPath(import.meta.url)))
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
