import { CAPPED_INPUT_CAPABILITY_IDS } from "@corkprotocol/operations";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { createLocalFixtureGateway } from "../src/dev-fixture.js";
import { createLocalLiveReadGateway } from "../src/live-read.js";
import {
  PUBLIC_TOOL_NAMES,
  PublicToolRouter,
  type PublicToolResultEnvelope,
} from "../src/public-tools.js";
import { startStdioServer } from "../src/stable.js";

function fixturePublicRouter(): {
  readonly fixture: ReturnType<typeof createLocalFixtureGateway>;
  readonly router: PublicToolRouter;
} {
  const fixture = createLocalFixtureGateway();
  return { fixture, router: new PublicToolRouter(fixture.router) };
}

describe("public tool registry", () => {
  it("exposes exactly the nine high-level families and no granular tools", () => {
    const { fixture, router } = fixturePublicRouter();
    const tools = router.listTools(fixture.principal);

    expect(tools.map(({ name }) => name)).toEqual(PUBLIC_TOOL_NAMES);
    expect(tools.some(({ name }) => name.includes(".v1"))).toBe(false);
    for (const tool of tools) {
      expect(tool.outputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(tool.annotations).toMatchObject({
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  it("builds strict discriminated schemas from only callable variants", () => {
    const live = createLocalLiveReadGateway({
      fetch: async () => new Response('{"items":[],"hasMore":false}'),
      now: () => "1",
    });
    const router = new PublicToolRouter(live.router);
    const tools = router.listTools(live.principal);

    expect(tools.map(({ name }) => name)).toEqual([
      "cork_query",
      "cork_compute",
      "cork_decode",
      "cork_capabilities",
    ]);
    const query = tools.find(({ name }) => name === "cork_query");
    expect(query?.inputSchema.properties["variant"]?.enum).toEqual([
      "phoenix-pools",
      "phoenix-pool-whitelists",
      "phoenix-flows",
      "limit-order-markets",
      "limit-order-orderbook",
      "limit-order-fills",
    ]);
    expect(query?.inputSchema.oneOf).toHaveLength(6);
  });

  it("delegates through the existing guarded router and adds canonical provenance", async () => {
    const { fixture, router } = fixturePublicRouter();
    const result = await router.call({
      name: "cork_query",
      arguments: { variant: "fixture-markets", input: {} },
      principal: fixture.principal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const envelope = result.coreResult as PublicToolResultEnvelope;
    expect(envelope).toMatchObject({
      schemaVersion: "cork.tool-result/v1",
      tool: "cork_query",
      variant: "fixture-markets",
      state: "ok",
      data: { fixtureOnly: true },
      provenance: {
        source: "canonical-gateway",
        environment: "local-fixture",
        targetTool: "cork.local.markets.list.v1",
      },
    });
    expect(envelope.provenance.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("rejects unknown top-level fields, nested fields, and unsupported actions", async () => {
    const { fixture, router } = fixturePublicRouter();
    const base = {
      variant: "fixed-mul-div-floor",
      input: { amount: "100", rate: "25", scale: "10" },
    };
    for (const argumentsValue of [
      { ...base, unexpected: true },
      { ...base, input: { ...base.input, unexpected: true } },
      { ...base, input: { ...base.input, amount: "1".repeat(79) } },
      { variant: "exercise-capped.prepare", input: {} },
    ]) {
      const result = await router.call({
        name: "cork_compute",
        arguments: argumentsValue,
        principal: fixture.principal,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("computes exact integer math and reports the callable public inventory", async () => {
    const { fixture, router } = fixturePublicRouter();
    const computed = await router.call({
      name: "cork_compute",
      arguments: {
        variant: "fixed-mul-div-floor",
        input: { amount: "7", rate: "10", scale: "3" },
      },
      principal: fixture.principal,
    });
    expect(computed.ok).toBe(true);
    if (computed.ok) {
      expect(computed.coreResult).toMatchObject({
        state: "ok",
        data: { result: "23", rounding: "floor" },
      });
    }

    const capabilities = await router.call({
      name: "cork_capabilities",
      arguments: {},
      principal: fixture.principal,
    });
    expect(capabilities.ok).toBe(true);
    if (!capabilities.ok) return;
    const envelope = capabilities.coreResult as PublicToolResultEnvelope;
    expect(envelope.data).toMatchObject({
      schemaVersion: "cork.public-capabilities/v1",
      omittedCapabilityIds: CAPPED_INPUT_CAPABILITY_IDS,
      safety: {
        signingKeysHeld: false,
        transactionsBroadcast: false,
        hostedHttpTransport: false,
      },
    });
    expect(JSON.stringify(envelope.data)).not.toContain(
      "exercise-capped.prepare",
    );
  });

  it("fails closed on local cancellation and elapsed deadlines", async () => {
    const { fixture, router } = fixturePublicRouter();
    const argumentsValue = {
      variant: "fixed-mul-div-floor",
      input: { amount: "7", rate: "10", scale: "3" },
    };
    const controller = new AbortController();
    controller.abort();
    const cancelled = await router.call({
      name: "cork_compute",
      arguments: argumentsValue,
      principal: fixture.principal,
      signal: controller.signal,
    });
    expect(cancelled).toMatchObject({
      ok: false,
      error: { code: "REQUEST_CANCELLED" },
    });

    const expired = await router.call({
      name: "cork_compute",
      arguments: argumentsValue,
      principal: fixture.principal,
      deadlineAtMs: Date.now() - 1,
    });
    expect(expired).toMatchObject({
      ok: false,
      error: { code: "DEADLINE_EXCEEDED" },
    });
  });

  it("publishes output schemas and returns identical text and structured content", async () => {
    const { fixture, router } = fixturePublicRouter();
    const listSchema = { kind: "list" };
    const callSchema = { kind: "call" };
    const handlers = new Map<unknown, (request: unknown) => Promise<unknown>>();
    class FakeServer {
      public constructor(_info: unknown, _options: unknown) {}
      public setRequestHandler(
        schema: unknown,
        handler: (request: unknown) => Promise<unknown>,
      ): void {
        handlers.set(schema, handler);
      }
      public async connect(_transport: unknown): Promise<void> {}
    }
    class FakeTransport {}

    await startStdioServer({
      router,
      principal: fixture.principal,
      loader: {
        load: async () => ({
          Server: FakeServer,
          StdioServerTransport: FakeTransport,
          ListToolsRequestSchema: listSchema,
          CallToolRequestSchema: callSchema,
        }),
      },
    });
    const listed = (await handlers.get(listSchema)?.({})) as {
      readonly tools: readonly {
        readonly name: string;
        readonly outputSchema?: unknown;
        readonly annotations?: unknown;
      }[];
    };
    expect(
      listed.tools.find(({ name }) => name === "cork_compute"),
    ).toMatchObject({
      outputSchema: { type: "object" },
      annotations: { readOnlyHint: true, openWorldHint: false },
    });

    const called = (await handlers.get(callSchema)?.({
      params: {
        name: "cork_compute",
        arguments: {
          variant: "fixed-mul-div-floor",
          input: { amount: "5", rate: "5", scale: "2" },
        },
      },
    })) as {
      readonly content: readonly { readonly text: string }[];
      readonly structuredContent: unknown;
      readonly isError: boolean;
    };
    expect(called.isError).toBe(false);
    expect(JSON.parse(called.content[0]!.text)).toEqual(
      called.structuredContent,
    );
  });
});

describe("registry-driven command-line interface", () => {
  it("runs a typed command and a raw call through the same public router", async () => {
    const { fixture, router } = fixturePublicRouter();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
      readInput: async () => '{"amount":"9","rate":"5","scale":"2"}',
    };
    const code = await runCli(
      ["compute", "fixed-mul-div-floor", "--input-file", "-", "--quiet"],
      {
        io,
        createGateway: () => ({ router, principal: fixture.principal }),
      },
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout[0] ?? "null")).toMatchObject({
      tool: "cork_compute",
      variant: "fixed-mul-div-floor",
      data: { result: "22" },
    });
    expect(stderr).toEqual([]);

    stdout.length = 0;
    const rawCode = await runCli(
      ["call", "cork_capabilities", "--input", "{}", "--quiet"],
      {
        io,
        createGateway: () => ({ router, principal: fixture.principal }),
      },
    );
    expect(rawCode).toBe(0);
    expect(JSON.parse(stdout[0] ?? "null")).toMatchObject({
      tool: "cork_capabilities",
      variant: "list",
    });
  });
});
