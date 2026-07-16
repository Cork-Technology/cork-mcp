import {
  type CredentialClaims,
  type ToolDefinition,
  type ToolRouter,
} from "./index.js";

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

function mcpTool(tool: ToolDefinition): {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolDefinition["inputSchema"];
} {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

export async function startStdioServer(input: {
  readonly router: ToolRouter;
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
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: !result.ok,
    };
  });
  await server.connect(new sdk.StdioServerTransport());
  return server;
}
