import { type CredentialClaims } from "./controls.js";
import {
  type ClosedInputSchema,
  type JsonPropertySchema,
  type RouterCallResult,
} from "./router.js";

export const STABLE_MCP_SDK_VERSION = "1.29.0" as const;
export const STABLE_MCP_PROTOCOL_ERA = "2025-11-25" as const;

interface RequestEnvelope {
  readonly params?: {
    readonly name?: unknown;
    readonly arguments?: unknown;
  };
}

interface ServerLike {
  setRequestHandler(
    schema: unknown,
    handler: (request: RequestEnvelope) => Promise<unknown>,
  ): void;
  connect(transport: unknown): Promise<void>;
}

interface ServerConstructor {
  new (
    info: { readonly name: string; readonly version: string },
    options: {
      readonly capabilities: {
        readonly tools: Readonly<Record<string, never>>;
      };
    },
  ): ServerLike;
}

interface TransportConstructor {
  new (): unknown;
}

export interface StableSdkModules {
  readonly Server: ServerConstructor;
  readonly StdioServerTransport: TransportConstructor;
  readonly ListToolsRequestSchema: unknown;
  readonly CallToolRequestSchema: unknown;
}

export interface StableSdkLoader {
  load(): Promise<StableSdkModules>;
}

const runtimeImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<Record<string, unknown>>;

export const defaultStableSdkLoader: StableSdkLoader = {
  async load(): Promise<StableSdkModules> {
    const [serverModule, stdioModule, typesModule] = await Promise.all([
      runtimeImport("@modelcontextprotocol/sdk/server/index.js"),
      runtimeImport("@modelcontextprotocol/sdk/server/stdio.js"),
      runtimeImport("@modelcontextprotocol/sdk/types.js"),
    ]);
    return {
      Server: serverModule["Server"] as ServerConstructor,
      StdioServerTransport: stdioModule[
        "StdioServerTransport"
      ] as TransportConstructor,
      ListToolsRequestSchema: typesModule["ListToolsRequestSchema"],
      CallToolRequestSchema: typesModule["CallToolRequestSchema"],
    };
  },
};

export interface StdioToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ClosedInputSchema;
  readonly outputSchema?: JsonPropertySchema;
  readonly annotations?: {
    readonly title?: string;
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
    readonly openWorldHint?: boolean;
  };
}

export interface StdioToolRouter {
  listTools(principal: CredentialClaims): readonly StdioToolDefinition[];
  call(input: {
    readonly name: string;
    readonly arguments: unknown;
    readonly principal: CredentialClaims;
    readonly signal?: AbortSignal;
    readonly deadlineAtMs?: number;
  }): Promise<RouterCallResult>;
}

function mcpTool(tool: StdioToolDefinition): StdioToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: tool.outputSchema }),
    ...(tool.annotations === undefined
      ? {}
      : { annotations: tool.annotations }),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorPayload(result: Extract<RouterCallResult, { ok: false }>): {
  readonly schemaVersion: "cork.tool-error/v1";
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
} {
  return {
    schemaVersion: "cork.tool-error/v1",
    error: result.error,
  };
}

export async function startStdioServer(input: {
  readonly router: StdioToolRouter;
  readonly principal: CredentialClaims;
  readonly loader?: StableSdkLoader;
}): Promise<ServerLike> {
  const sdk = await (input.loader ?? defaultStableSdkLoader).load();
  const server = new sdk.Server(
    { name: "@corkprotocol/gateway", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(sdk.ListToolsRequestSchema, async () => ({
    tools: input.router.listTools(input.principal).map(mcpTool),
  }));
  server.setRequestHandler(sdk.CallToolRequestSchema, async (request) => {
    const name = request.params?.name;
    const result =
      typeof name === "string"
        ? await input.router.call({
            name,
            arguments: request.params?.arguments ?? {},
            principal: input.principal,
          })
        : {
            ok: false as const,
            error: {
              code: "INVALID_INPUT" as const,
              message: "tool name is required",
            },
          };
    const payload = result.ok ? result.coreResult : errorPayload(result);
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      ...(isRecord(payload) ? { structuredContent: payload } : {}),
      isError: !result.ok,
    };
  });
  await server.connect(new sdk.StdioServerTransport());
  return server;
}
