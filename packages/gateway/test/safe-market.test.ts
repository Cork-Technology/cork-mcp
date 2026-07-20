import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeMarketId,
  computeTimelockOperationId,
  createMarketTuple,
  createSafeBuilderFile,
  createSafeMarketProofRecord,
  deriveCreate2Salt,
  deriveOperationSalt,
  predictOracleAddress,
  prevalidatedOwnerSignature,
  publishSafeMarketPackage,
  SAFE_MARKET_CATALOG,
} from "../src/safe-market.js";
import { assertPinnedForkBlock } from "../src/safe-market-proof.js";
import {
  createSafeMarketPreviewGateway,
  SafeMarketPreviewRouter,
} from "../src/safe-market-mode.js";
import { createLocalFixtureGateway } from "../src/dev-fixture.js";
import { PublicToolRouter } from "../src/public-tools.js";
import { startStdioServer, type StdioToolRouter } from "../src/stable.js";
import type { CredentialClaims } from "../src/controls.js";
import type { Hex } from "viem";

const OWNER = "0x7e57CCf8199d2d5561f370FC4d13C82aCbcbA0c2";
const INIT_CODE_HASH = `0x${"11".repeat(32)}` as Hex;
const EXPIRY = 1_785_155_261n;

describe("Safe market pure builder", () => {
  it("rounds the operator-selected half-percent bounds conservatively", () => {
    const market = createMarketTuple({
      expiry: EXPIRY,
      observedRate: 1_123_354_869_197_319_272n,
      oracle: "0x9Bd3C27362723254aE7264EdDC03FB28dcFffC75",
    });
    expect(market.rateMin).toBe(1_117_738_094_851_332_675n);
    expect(market.rateMax).toBe(1_128_971_643_543_305_869n);
    expect(market.expiryTimestamp).toBe(EXPIRY);
    expect(market.rateChangePerDayMax).toBe(500_000_000_000_000n);
    expect(market.rateChangeCapacityMax).toBe(3_500_000_000_000_000n);
  });

  it("hashes the exact controller Market tuple", () => {
    expect(
      computeMarketId({
        collateralAsset: SAFE_MARKET_CATALOG.collateral,
        referenceAsset: SAFE_MARKET_CATALOG.reference,
        expiryTimestamp: EXPIRY,
        rateMin: 1_117_737_095_851_332_675n,
        rateMax: 1_128_970_634_503_104_863n,
        rateChangePerDayMax: SAFE_MARKET_CATALOG.rateChangePerDayMax,
        rateChangeCapacityMax: SAFE_MARKET_CATALOG.rateChangeCapacityMax,
        rateOracle: "0x9Bd3C27362723254aE7264EdDC03FB28dcFffC75",
      }),
    ).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it("binds deterministic deployment and operation identities to mutations", () => {
    const salt = deriveCreate2Salt(INIT_CODE_HASH, EXPIRY);
    expect(deriveCreate2Salt(INIT_CODE_HASH, EXPIRY)).toBe(salt);
    expect(deriveCreate2Salt(INIT_CODE_HASH, EXPIRY + 1n)).not.toBe(salt);
    const oracle = predictOracleAddress(INIT_CODE_HASH, salt);
    expect(predictOracleAddress(INIT_CODE_HASH, salt)).toBe(oracle);
    const marketId = `0x${"22".repeat(32)}` as Hex;
    const operationSalt = deriveOperationSalt(salt, marketId);
    const operationId = computeTimelockOperationId({
      targets: [SAFE_MARKET_CATALOG.factory, SAFE_MARKET_CATALOG.controller],
      values: [0n, 0n],
      payloads: ["0x1234", "0xabcd"],
      salt: operationSalt,
    });
    expect(
      computeTimelockOperationId({
        targets: [SAFE_MARKET_CATALOG.factory, SAFE_MARKET_CATALOG.controller],
        values: [0n, 0n],
        payloads: ["0x1234", "0xabce"],
        salt: operationSalt,
      }),
    ).not.toBe(operationId);
    expect(deriveOperationSalt(salt, `0x${"23".repeat(32)}`)).not.toBe(
      operationSalt,
    );
  });

  it("emits a raw, importable Builder transaction and owner prevalidation", () => {
    const file = createSafeBuilderFile({
      name: "test",
      description: "test transaction",
      createdAt: 1,
      owner: OWNER,
      data: "0x1234",
    });
    expect(file).toMatchObject({
      version: "1.0",
      chainId: "42161",
      meta: {
        txBuilderVersion: "1.18.0",
        createdFromSafeAddress: SAFE_MARKET_CATALOG.safe,
        createdFromOwnerAddress: OWNER,
        checksum: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      },
      transactions: [
        {
          to: SAFE_MARKET_CATALOG.timelock,
          value: "0",
          data: "0x1234",
          contractMethod: null,
          contractInputsValues: null,
        },
      ],
    });
    const signature = prevalidatedOwnerSignature(OWNER);
    expect(signature.length).toBe(132);
    expect(signature.endsWith("01")).toBe(true);
    expect(
      createSafeBuilderFile({
        name: "a renamed batch",
        description: "test transaction",
        createdAt: 1,
        owner: OWNER,
        data: "0x1234",
      }).meta.checksum,
    ).toBe(file.meta.checksum);
    expect(
      createSafeBuilderFile({
        name: "test",
        description: "mutated description",
        createdAt: 1,
        owner: OWNER,
        data: "0x1234",
      }).meta.checksum,
    ).not.toBe(file.meta.checksum);
  });

  it("cannot falsely attest a developer-skipped proof as passed", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "cork-safe-market-skip-"));
    const outputDirectory = resolve(root, "published");
    try {
      const published = await publishSafeMarketPackage({
        outputDirectory,
        scheduleText: '{"transaction":"schedule"}\n',
        executeText: '{"transaction":"execute"}\n',
        createManifestText: (status) =>
          `${JSON.stringify({
            proof: createSafeMarketProofRecord({
              status,
              blockNumber: 123n,
              safeNonce: 7n,
            }),
          })}\n`,
      });
      const manifest = JSON.parse(
        await readFile(resolve(outputDirectory, "manifest.json"), "utf8"),
      ) as {
        readonly proof: {
          readonly status: string;
          readonly exactBuilderBytes: boolean;
          readonly assertions: readonly string[];
        };
      };
      expect(published.proofStatus).toBe("not-run");
      expect(manifest.proof).toMatchObject({
        status: "not-run",
        exactBuilderBytes: false,
        assertions: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an Anvil fork whose pinned hash differs from quorum", () => {
    const context = {
      blockNumber: 123n,
      blockHash: `0x${"ab".repeat(32)}` as Hex,
    };
    expect(() =>
      assertPinnedForkBlock(
        { number: "0x7b", hash: `0x${"cd".repeat(32)}` },
        context,
      ),
    ).toThrow(/fork block hash .* does not match quorum hash/u);
    expect(() =>
      assertPinnedForkBlock(
        { number: "0x7c", hash: context.blockHash },
        context,
      ),
    ).toThrow(/fork block number 124 does not match quorum block 123/u);
  });

  it("preserves an existing published package when staged proof fails", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "cork-safe-market-publish-"));
    const outputDirectory = resolve(root, "published");
    const oldFiles = {
      "01-schedule.json": '{"old":"schedule"}\n',
      "02-execute.json": '{"old":"execute"}\n',
      "manifest.json": '{"old":"manifest"}\n',
    } as const;
    try {
      await mkdir(outputDirectory);
      await Promise.all(
        Object.entries(oldFiles).map(([name, value]) =>
          writeFile(resolve(outputDirectory, name), value),
        ),
      );
      await expect(
        publishSafeMarketPackage({
          outputDirectory,
          scheduleText: '{"new":"schedule"}\n',
          executeText: '{"new":"execute"}\n',
          prove: async (stagedOutputDirectory) => {
            expect(
              await readFile(
                resolve(stagedOutputDirectory, "01-schedule.json"),
                "utf8",
              ),
            ).toBe('{"new":"schedule"}\n');
            expect(
              await readFile(
                resolve(stagedOutputDirectory, "02-execute.json"),
                "utf8",
              ),
            ).toBe('{"new":"execute"}\n');
            throw new Error("injected proof failure");
          },
          createManifestText: () => '{"new":"manifest"}\n',
        }),
      ).rejects.toThrow("injected proof failure");
      await Promise.all(
        Object.entries(oldFiles).map(async ([name, value]) =>
          expect(await readFile(resolve(outputDirectory, name), "utf8")).toBe(
            value,
          ),
        ),
      );
      expect(await readdir(root)).toEqual(["published"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Safe market mode isolation and protocol routing", () => {
  it("does not activate safe-package in the default fixture mode", () => {
    const fixture = createLocalFixtureGateway();
    const router = new PublicToolRouter(fixture.router);
    const marketTool = router
      .listTools(fixture.principal)
      .find((tool) => tool.name === "cork_prepare_market");
    expect(JSON.stringify(marketTool?.inputSchema)).not.toContain(
      "safe-package",
    );
  });

  it("exposes only the public market family in explicit preview mode", async () => {
    const gateway = createSafeMarketPreviewGateway();
    const publicRouter = new PublicToolRouter(gateway.router);
    expect(
      publicRouter.listTools(gateway.principal).map((tool) => tool.name),
    ).toEqual(["cork_prepare_market"]);
    const rejected = await publicRouter.call({
      name: "cork_prepare_market",
      arguments: { variant: "safe-package", input: { profile: "mutated" } },
      principal: gateway.principal,
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
  });

  it("routes the safe-package variant through the Model Context Protocol handler", async () => {
    const principal: CredentialClaims = {
      credentialId: "test",
      principalId: "test",
      ownerId: "test",
      environment: "safe-market-preview",
      trafficClass: "first-party",
      scopes: ["market-deployment:write"],
      issuedAtMs: 0,
      revocationId: "test",
    };
    const internal: StdioToolRouter = {
      listTools: () => new SafeMarketPreviewRouter().listTools(principal),
      call: async (input) => ({
        ok: true,
        toolName: input.name,
        coreResult: { proofStatus: "passed", broadcastReady: false },
        transportMetadata: {
          principalId: "test",
          environment: "safe-market-preview",
          scope: "market-deployment:write",
        },
      }),
    };
    const router = new PublicToolRouter(internal);
    const handlers = new Map<unknown, (request: unknown) => Promise<unknown>>();
    const listSchema = Symbol("list");
    const callSchema = Symbol("call");
    await startStdioServer({
      router,
      principal,
      loader: {
        load: async () => ({
          Server: class {
            public constructor(_info: unknown, _options: unknown) {}
            public setRequestHandler(
              schema: unknown,
              handler: (request: unknown) => Promise<unknown>,
            ): void {
              handlers.set(schema, handler);
            }
            public async connect(_transport: unknown): Promise<void> {}
          },
          StdioServerTransport: class {},
          ListToolsRequestSchema: listSchema,
          CallToolRequestSchema: callSchema,
        }),
      },
    });
    const listed = await handlers.get(listSchema)?.({});
    expect(listed).toMatchObject({ tools: [{ name: "cork_prepare_market" }] });
    const called = await handlers.get(callSchema)?.({
      params: {
        name: "cork_prepare_market",
        arguments: {
          variant: "safe-package",
          input: { profile: "susds-susde-liquidity-impairment" },
        },
      },
    });
    expect(called).toMatchObject({
      isError: false,
      structuredContent: {
        tool: "cork_prepare_market",
        variant: "safe-package",
        data: { proofStatus: "passed", broadcastReady: false },
      },
    });
  });
});
