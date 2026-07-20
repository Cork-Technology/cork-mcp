import { type CredentialClaims } from "./controls.js";
import {
  prepareSafeMarketPreview,
  rpcConfigFromEnvironment,
  SAFE_MARKET_PROFILE,
} from "./safe-market.js";
import { type RouterCallResult, type RouterErrorCode } from "./router.js";
import { type StdioToolDefinition, type StdioToolRouter } from "./stable.js";

export const SAFE_MARKET_PREVIEW_TOOL = Object.freeze({
  name: "cork.safe.market.preview.prepare.v1",
  description:
    "Prepare and fork-prove the immutable sUSDS/sUSDe Arbitrum Safe package without signing or broadcasting.",
  inputSchema: {
    type: "object" as const,
    additionalProperties: false as const,
    properties: {
      profile: { type: "string" as const, const: SAFE_MARKET_PROFILE },
    },
    required: ["profile"] as const,
  },
  annotations: {
    title: "Prepare production-like Safe market package",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
});

function error(code: RouterErrorCode, message: string): RouterCallResult {
  return { ok: false, error: { code, message } };
}

function validInput(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    (value as Readonly<Record<string, unknown>>)["profile"] ===
      SAFE_MARKET_PROFILE
  );
}

export class SafeMarketPreviewRouter implements StdioToolRouter {
  public listTools(
    principal: CredentialClaims,
  ): readonly StdioToolDefinition[] {
    return principal.environment === "safe-market-preview" &&
      principal.scopes.includes("market-deployment:write")
      ? [SAFE_MARKET_PREVIEW_TOOL]
      : [];
  }

  public async call(input: {
    readonly name: string;
    readonly arguments: unknown;
    readonly principal: CredentialClaims;
    readonly signal?: AbortSignal;
    readonly deadlineAtMs?: number;
  }): Promise<RouterCallResult> {
    if (input.name !== SAFE_MARKET_PREVIEW_TOOL.name) {
      return error(
        "UNKNOWN_TOOL",
        "tool is not available in Safe market preview mode",
      );
    }
    if (
      input.principal.environment !== "safe-market-preview" ||
      !input.principal.scopes.includes("market-deployment:write")
    ) {
      return error(
        "AUTHENTICATION_SCOPE_DENIED",
        "preview credential scope is required",
      );
    }
    if (!validInput(input.arguments)) {
      return error(
        "INVALID_INPUT",
        "the immutable Safe market profile is required",
      );
    }
    if (input.signal?.aborted === true) {
      return error("REQUEST_CANCELLED", "request was cancelled");
    }
    try {
      const result = await prepareSafeMarketPreview({
        rpc: rpcConfigFromEnvironment(),
      });
      return {
        ok: true,
        toolName: input.name,
        coreResult: result,
        transportMetadata: {
          principalId: input.principal.principalId,
          environment: input.principal.environment,
          scope: "market-deployment:write",
        },
      };
    } catch (caught: unknown) {
      const message =
        caught instanceof Error ? caught.message : "unknown failure";
      process.stderr.write(
        `[cork-mcp] Safe market preview failed closed: ${message}\n`,
      );
      return error(
        "HANDLER_FAILED",
        "Safe market preview failed closed; see server stderr",
      );
    }
  }
}

export interface SafeMarketPreviewGateway {
  readonly principal: CredentialClaims;
  readonly router: SafeMarketPreviewRouter;
}

export function createSafeMarketPreviewGateway(): SafeMarketPreviewGateway {
  const principal: CredentialClaims = Object.freeze({
    credentialId: "safe-market-preview-credential",
    principalId: "safe-market-preview-principal",
    ownerId: "safe-market-preview-owner",
    environment: "safe-market-preview",
    trafficClass: "first-party",
    scopes: ["market-deployment:write"] as const,
    issuedAtMs: 0,
    revocationId: "safe-market-preview-revocation",
  });
  return Object.freeze({
    principal,
    router: new SafeMarketPreviewRouter(),
  });
}
