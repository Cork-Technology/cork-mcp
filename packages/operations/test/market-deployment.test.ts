import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  MARKET_DEPLOYMENT_FACTS,
  MARKET_REGISTRY_SOURCE_COMMIT,
  createMarketDeploymentSimulation,
  createMergedRFC007Release,
  keccak256Bytes,
  keccak256Digest,
  prepareMarketDeployment,
  quoteMarketDeployment,
  reconcileMarketDeployment,
  sha256Bytes,
  sha256CanonicalJson,
  type JsonValue,
  type MarketBuildPackageV1,
  type MarketDeploymentInputV1,
  type MarketDeploymentReceiptV1,
  type MarketQuoteResultV1,
  type PreparedMarketDeploymentV1,
  type RawObservationSuccessV1,
  type RFC007ArtifactNameV1,
  type RFC007SchemaBundleV1,
  type RFC007SchemaDocumentV1,
  type RFC007SchemaValidatorV1,
  type ReleasedProducerArtifactV1,
  type Sha256Digest,
} from "../src/index.js";

const address = (byte: string) => `0x${byte.repeat(40)}`;
const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const blockHash = (byte: string) => `0x${byte.repeat(64)}`;
const ZERO = address("0");
const REGISTRY = address("1");
const CA = address("2");
const REF = address("3");
const FACTORY = address("4");
const WRAPPER = address("5");
const SAFE = address("6");
const POOL = address("7");

function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function shaBytes(value: string): Sha256Digest {
  const raw = value.slice(2);
  const bytes = Uint8Array.from({ length: raw.length / 2 }, (_, index) =>
    Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16),
  );
  return `sha256:${hex(sha256Bytes(bytes))}`;
}

function deployCalldata(): string {
  const selector = hex(
    keccak256Bytes(new TextEncoder().encode("deploy(address,address)")).slice(
      0,
      4,
    ),
  );
  return `0x${selector}${"0".repeat(24)}${CA.slice(2)}${"0".repeat(24)}${REF.slice(2)}`;
}

function build(): MarketBuildPackageV1 {
  const registryDeployCalldata = deployCalldata();
  const poolCreationCalldata = "0x12345678";
  const registryDeployCalldataHash = keccak256Digest(
    Uint8Array.from(
      { length: registryDeployCalldata.length / 2 - 1 },
      (_, index) =>
        Number.parseInt(
          registryDeployCalldata.slice(2 + index * 2, 4 + index * 2),
          16,
        ),
    ),
  );
  const poolCreationCalldataHash = keccak256Digest(
    Uint8Array.from([0x12, 0x34, 0x56, 0x78]),
  );
  return {
    marketRegistry: REGISTRY,
    collateralAsset: CA,
    referenceAsset: REF,
    wrapperFactory: FACTORY,
    expectedWrapper: WRAPPER,
    registryDeployCalldata,
    registryDeployCalldataHash,
    poolCreationSender: SAFE,
    poolCreationTarget: POOL,
    poolCreationCalldata,
    poolCreationCalldataHash,
    orderedCallsDigest: sha256CanonicalJson([
      {
        sender: ZERO,
        target: REGISTRY,
        value: "0",
        dataDigest: registryDeployCalldataHash,
      },
      {
        sender: SAFE,
        target: POOL,
        value: "0",
        dataDigest: poolCreationCalldataHash,
      },
    ]),
  };
}

function artifact(
  document: RFC007SchemaDocumentV1,
  value: JsonValue,
): ReleasedProducerArtifactV1 {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const bytes = `0x${hex(encoded)}`;
  return {
    schemaVersion: `${document.artifactName}/v1`,
    producerIdentity: document.producerIdentity,
    bytes,
    byteDigest: shaBytes(bytes),
    contentDigest: document.schemaDigest,
  };
}

const SCHEMA_VALIDATOR: RFC007SchemaValidatorV1 = {
  validate: ({ schema, document }) => {
    if (
      schema === null ||
      typeof schema !== "object" ||
      Array.isArray(schema) ||
      document === null ||
      typeof document !== "object" ||
      Array.isArray(document)
    )
      return false;
    const required = (schema as { required?: unknown }).required;
    return (
      Array.isArray(required) &&
      required.every(
        (field) =>
          typeof field === "string" && Object.hasOwn(document as object, field),
      )
    );
  },
};

function deployment(): MarketDeploymentInputV1 {
  const buildPackage = build();
  const names: readonly RFC007ArtifactNameV1[] = [
    "attestation",
    "build",
    "handoff",
    "resolvedArtifact",
    "staging",
    "unsignedSafeProposal",
    "verdict",
  ];
  const values: Record<RFC007ArtifactNameV1, JsonValue> = {
    attestation: { schemaVersion: "attestation/v1", payload: "06" },
    build: buildPackage as unknown as JsonValue,
    handoff: { schemaVersion: "handoff/v1", payload: "01" },
    resolvedArtifact: {
      schemaVersion: "resolvedArtifact/v1",
      payload: "02",
    },
    staging: { schemaVersion: "staging/v1", payload: "04" },
    unsignedSafeProposal: {
      schemaVersion: "unsignedSafeProposal/v1",
      payload: "05",
    },
    verdict: { schemaVersion: "verdict/v1", payload: "03" },
  };
  const documents = names.map((artifactName) => {
    const schema = {
      required: Object.keys(
        values[artifactName] as Record<string, unknown>,
      ).sort(),
    };
    const base = {
      artifactName,
      encoding: "canonical-json-utf8" as const,
      producerIdentity: `${artifactName}-producer`,
      releaseIdentity: "rfc-007/release-1",
      schema,
    };
    return {
      ...base,
      schemaDigest: sha256CanonicalJson(base as unknown as JsonValue),
    };
  });
  const schemaDigests = Object.fromEntries(
    documents.map((document) => [document.artifactName, document.schemaDigest]),
  ) as MarketDeploymentInputV1["automationRelease"]["schemaDigests"];
  const bundleBase = {
    schemaVersion: "cork.rfc007-schema-bundle/v1" as const,
    revision: "rfc-007-merged-1",
    releaseIdentity: "rfc-007/release-1",
    documents,
  };
  const schemaBundle: RFC007SchemaBundleV1 = {
    ...bundleBase,
    bundleDigest: sha256CanonicalJson(bundleBase as unknown as JsonValue),
  };
  const automationRelease = createMergedRFC007Release({
    schemaVersion: "cork.merged-rfc007-release/v1",
    status: "merged-immutable",
    revision: "rfc-007-merged-1",
    releaseIdentity: "rfc-007/release-1",
    underwritingService: {
      sourceCommit: "0a8db7ab30c0dcf1fee6379e2670ed51b10f45be",
      packageVersion: "1.0.0",
    },
    marketPipeline: {
      sourceCommit: "8985c6d614330cdcd49a22bcaffa41b83de1336f",
      packageVersion: "1.0.0",
    },
    marketRegistry: {
      sourceCommit: MARKET_REGISTRY_SOURCE_COMMIT,
      packageVersion: "1.0.0",
    },
    recipePackage: {
      identity: "cork-market-recipe",
      version: "1.0.0",
      digest: digest("8"),
    },
    schemaDigests,
  });
  return {
    schemaVersion: "cork.market-deployment/v1",
    clientRequestId: "request-1",
    chainId: "1",
    automationRelease,
    schemaBundle,
    handoff: artifact(documents[2]!, values.handoff),
    resolvedArtifact: artifact(documents[3]!, values.resolvedArtifact),
    verdict: artifact(documents[6]!, values.verdict),
    buildArtifact: artifact(documents[1]!, values.build),
    buildPackage,
    stagingEvidence: artifact(documents[4]!, values.staging),
    unsignedSafeProposal: artifact(documents[5]!, values.unsignedSafeProposal),
    attestation: artifact(documents[0]!, values.attestation),
  };
}

function observation(
  providerId: string,
  administrationId: string,
  value: JsonValue,
  block = "100",
): RawObservationSuccessV1 {
  return {
    schemaVersion: "cork.raw-observation/v1",
    kind: "success",
    providerId,
    administrationId,
    sourceId: "market-chain-reader",
    requestDigest: digest("9"),
    sourceCommit: "ab".repeat(20),
    sourceSchemaDigest: digest("a"),
    observedAt: "1000",
    block: {
      kind: "independently-pinned",
      blockNumber: block,
      blockHash: blockHash("b"),
      parentBlockHash: blockHash("c"),
    },
    value,
  };
}

function facts(lookup: string = ZERO) {
  const values: Record<(typeof MARKET_DEPLOYMENT_FACTS)[number], JsonValue> = {
    lookupWrapper: lookup,
    wrapperFactory: FACTORY,
    marketRegistryRuntime: digest("b"),
    wrapperFactoryRuntime: digest("c"),
    wrapperRuntime: digest("d"),
    factoryRelationship: true,
    collateralRegistered: true,
    referenceRegistered: true,
    collateralDecimals: "18",
    referenceDecimals: "6",
    collateralQuoteUnit: "USD",
    referenceQuoteUnit: "USD",
    conversionFeeds: [address("8"), address("9")],
    expectedWrapper: WRAPPER,
    rateOracleFactory: FACTORY,
    rateOracleRuntime: digest("e"),
  };
  return MARKET_DEPLOYMENT_FACTS.map((field) => ({
    field,
    observations: [
      observation("provider-a", "admin-a", values[field]),
      observation("provider-b", "admin-b", values[field]),
    ],
  }));
}

function quote(
  input: MarketDeploymentInputV1,
): Extract<MarketQuoteResultV1, { readonly outcome: "quoted" }> {
  const result = quoteMarketDeployment(
    {
      schemaVersion: "cork.market-deployment-quote-input/v1",
      clientRequestId: input.clientRequestId,
      chainId: input.chainId,
      automationRelease: input.automationRelease,
      schemaBundle: input.schemaBundle,
      handoff: input.handoff,
    },
    SCHEMA_VALIDATOR,
  );
  if (result.outcome !== "quoted") throw new Error(result.issues.join(", "));
  return result;
}

function prepare(
  input: MarketDeploymentInputV1,
  currentFacts = facts(),
): PreparedMarketDeploymentV1 {
  return prepareMarketDeployment(
    { quote: quote(input), deployment: input, facts: currentFacts },
    SCHEMA_VALIDATOR,
  );
}

type FreshPreparation = Extract<
  PreparedMarketDeploymentV1,
  { readonly outcome: "fresh-deployment" }
>;

function receipt(
  prepared: FreshPreparation,
  transactionIndex: 0 | 1,
  includeRegistryEvent = true,
): MarketDeploymentReceiptV1 {
  const transaction = prepared.transactions[transactionIndex];
  const events =
    transactionIndex === 0
      ? includeRegistryEvent
        ? ([
            {
              kind: "wrapper-deployed",
              emitter: REGISTRY,
              collateralAsset: CA,
              referenceAsset: REF,
              wrapperFactory: FACTORY,
              wrapper: WRAPPER,
            },
          ] as const)
        : []
      : ([
          {
            kind: "pool-created",
            emitter: POOL,
            collateralAsset: CA,
            referenceAsset: REF,
            wrapper: WRAPPER,
          },
        ] as const);
  return {
    transactionIndex,
    transactionHash: keccak256Digest(Uint8Array.from([transactionIndex + 1])),
    blockNumber: `${90 + transactionIndex}`,
    blockHash: blockHash(transactionIndex === 0 ? "d" : "e"),
    parentBlockHash: blockHash(transactionIndex === 0 ? "c" : "d"),
    final: true,
    status: "success",
    ...transaction,
    events,
  };
}

describe("merged RFC 007 market deployment", () => {
  it("quotes the byte-preserved handoff and prepares two exact released calls", () => {
    const input = deployment();
    const quoted = quote(input);
    expect(quoted.handoff).toEqual(input.handoff);
    expect(quoted.schemaBundleDigest).toBe(input.schemaBundle.bundleDigest);
    const prepared = prepare(input);
    expect(prepared.outcome).toBe("fresh-deployment");
    if (prepared.outcome !== "fresh-deployment") return;
    expect(prepared.quoteDigest).toBe(quoted.quoteDigest);
    expect(prepared.pair).toEqual({
      chainId: "1",
      collateralAsset: CA,
      referenceAsset: REF,
    });
    expect(prepared.transactions).toEqual([
      {
        sender: ZERO,
        target: REGISTRY,
        value: "0",
        data: input.buildPackage.registryDeployCalldata,
        dataDigest: input.buildPackage.registryDeployCalldataHash,
      },
      {
        sender: SAFE,
        target: POOL,
        value: "0",
        data: "0x12345678",
        dataDigest: input.buildPackage.poolCreationCalldataHash,
      },
    ]);
    expect(prepared.producerArtifactDigests).toEqual([
      input.handoff.byteDigest,
      input.resolvedArtifact.byteDigest,
      input.verdict.byteDigest,
      input.buildArtifact.byteDigest,
      input.stagingEvidence.byteDigest,
      input.unsignedSafeProposal.byteDigest,
      input.attestation.byteDigest,
    ]);

    const tampered = {
      ...input,
      handoff: { ...input.handoff, bytes: "0xffff" },
    };
    expect(
      quoteMarketDeployment(
        {
          schemaVersion: "cork.market-deployment-quote-input/v1",
          clientRequestId: tampered.clientRequestId,
          chainId: tampered.chainId,
          automationRelease: tampered.automationRelease,
          schemaBundle: tampered.schemaBundle,
          handoff: tampered.handoff,
        },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({ outcome: "invalid", code: "INPUT_INVALID" });
    const schemaInvalidBytes = `0x${hex(
      new TextEncoder().encode(JSON.stringify({ schemaVersion: "handoff/v1" })),
    )}`;
    const schemaInvalid = {
      ...input,
      handoff: {
        ...input.handoff,
        bytes: schemaInvalidBytes,
        byteDigest: shaBytes(schemaInvalidBytes),
      },
    };
    expect(
      prepareMarketDeployment(
        { quote: quoted, deployment: schemaInvalid, facts: facts() },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({ outcome: "conflict", code: "INPUT_INVALID" });
    expect(
      prepareMarketDeployment(
        {
          quote: quoted,
          deployment: { ...input, clientRequestId: "different-request" },
          facts: facts(),
        },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({ outcome: "conflict", code: "INPUT_INVALID" });
    expect(() =>
      createMergedRFC007Release({
        ...input.automationRelease,
        status: "merged-immutable",
        schemaDigests: {
          ...input.automationRelease.schemaDigests,
          callerDigest: digest("f"),
        },
      } as never),
    ).toThrow();
  });

  it("requires independent identical-block quorum and ignores hostile registry claims", () => {
    const input = deployment();
    const quoted = quote(input);
    const wrongBlock = facts();
    wrongBlock[0] = {
      ...wrongBlock[0]!,
      observations: [
        observation("provider-a", "admin-a", ZERO),
        observation("provider-b", "admin-b", ZERO, "101"),
      ],
    };
    expect(
      prepareMarketDeployment(
        { quote: quoted, deployment: input, facts: wrongBlock },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({ outcome: "conflict", code: "QUORUM_FAILED" });

    const hostile = {
      ...facts(),
      deployed: true,
      deployable: true,
      reads: { block: "latest" },
    };
    expect(
      prepareMarketDeployment(
        { quote: quoted, deployment: input, facts: hostile as never },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({ outcome: "conflict", code: "INPUT_INVALID" });
  });

  it("keeps simulation advisory over unchanged prepared bytes", () => {
    const input = deployment();
    const fresh = prepare(input);
    expect(fresh).toMatchObject({
      outcome: "fresh-deployment",
    });
    if (fresh.outcome !== "fresh-deployment") return;
    for (const status of ["success", "revert", "unavailable"] as const) {
      const simulation = createMarketDeploymentSimulation({
        prepared: fresh,
        calls: fresh.transactions.map((transaction, transactionIndex) => ({
          transactionIndex,
          target: transaction.target,
          dataDigest: transaction.dataDigest,
          status,
          reasonCode: status.toUpperCase(),
        })),
        simulatedAt: "1001",
      });
      expect(simulation.preparedDigest).toBe(fresh.preparedDigest);
      expect(simulation.quoteDigest).toBe(fresh.quoteDigest);
      expect(simulation.deploymentProven).toBe(false);
      expect(simulation.status).toBe(status);
      expect(fresh.transactions[1].data).toBe("0x12345678");
    }
    expect(() =>
      createMarketDeploymentSimulation({
        prepared: {
          ...fresh,
          transactions: [
            fresh.transactions[0],
            { ...fresh.transactions[1], data: "0xdeadbeef" },
          ],
        },
        calls: [],
        simulatedAt: "1001",
      }),
    ).toThrow("changed");
  });

  it("authoritatively reconciles existing, fresh, repeated, and partial paths", () => {
    const input = deployment();
    const quoted = quote(input);
    const fresh = prepare(input);
    const existing = prepare(input, facts(WRAPPER));
    expect(existing).toMatchObject({
      outcome: "existing-wrapper",
      transactions: [],
      poolExecutionProven: false,
    });
    if (
      fresh.outcome !== "fresh-deployment" ||
      existing.outcome !== "existing-wrapper"
    )
      return;
    const reconcile = (
      prepared: FreshPreparation | typeof existing,
      receipts: readonly MarketDeploymentReceiptV1[],
      finalFacts = facts(WRAPPER),
      deploymentInput = input,
    ) =>
      reconcileMarketDeployment(
        {
          prepared,
          quote: quoted,
          deployment: deploymentInput,
          preparationFacts:
            prepared.outcome === "existing-wrapper" ? facts(WRAPPER) : facts(),
          finalFacts,
          receipts,
        },
        SCHEMA_VALIDATOR,
      );
    expect(reconcile(existing, []).status).toBe("verified-existing-wrapper");
    const registry = receipt(fresh, 0);
    const pool = receipt(fresh, 1);
    const completed = reconcile(fresh, [registry, pool]);
    expect(completed).toMatchObject({
      status: "fresh-two-step-success",
      wrapperDeploymentProven: true,
      poolExecutionProven: true,
      producerArtifactDigests: fresh.producerArtifactDigests,
    });
    expect(reconcile(fresh, [receipt(fresh, 0, false), pool]).status).toBe(
      "repeat-registry-no-event",
    );
    expect(reconcile(fresh, [registry])).toMatchObject({
      status: "registry-only-partial",
      remainingTransactions: [fresh.transactions[1]],
      poolExecutionProven: false,
    });
    expect(reconcile(fresh, [])).toMatchObject({
      status: "uncertain-registry-outcome",
      remainingTransactions: fresh.transactions,
    });
    expect(
      reconcile(fresh, [registry, { ...pool, target: REGISTRY }]).status,
    ).toBe("pool-evidence-mismatch");
    expect(
      reconcile(fresh, [
        registry,
        {
          ...pool,
          events: [
            {
              kind: "pool-created",
              emitter: POOL,
              collateralAsset: REF,
              referenceAsset: CA,
              wrapper: WRAPPER,
            },
          ],
        },
      ]).status,
    ).toBe("pool-evidence-mismatch");
    expect(reconcile(fresh, [registry], facts(ZERO)).status).toBe("conflict");
    const changedRelationships = facts(WRAPPER);
    changedRelationships[15] = {
      ...changedRelationships[15]!,
      observations: [
        observation("provider-a", "admin-a", digest("f")),
        observation("provider-b", "admin-b", digest("f")),
      ],
    };
    expect(reconcile(fresh, [registry], changedRelationships).status).toBe(
      "conflict",
    );
    expect(
      reconcile(fresh, [registry], facts(WRAPPER), {
        ...input,
        attestation: { ...input.attestation, bytes: "0xffff" },
      }).status,
    ).toBe("conflict");
    expect(completed.status).not.toBe("conflict");
    expect(completed.status).not.toBe("pool-evidence-mismatch");
    if (
      completed.status === "conflict" ||
      completed.status === "pool-evidence-mismatch"
    )
      return;
    expect(completed.verifiedReceiptDigests).toHaveLength(2);
    expect(completed.finalBinding).toEqual({
      blockNumber: "100",
      blockHash: blockHash("b"),
      parentBlockHash: blockHash("c"),
    });
  });

  it("rejects a quote with a different released producer handoff", () => {
    const first = deployment();
    const second = {
      ...first,
      clientRequestId: "request-2",
    };
    expect(
      prepareMarketDeployment(
        {
          quote: quote(first),
          deployment: second,
          facts: facts(),
        },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({
      outcome: "conflict",
      code: "INPUT_INVALID",
    });
    expect(
      quoteMarketDeployment(
        {
          schemaVersion: "cork.market-deployment-quote-input/v1",
          clientRequestId: first.clientRequestId,
          chainId: first.chainId,
          automationRelease: first.automationRelease,
          schemaBundle: first.schemaBundle,
          handoff: { ...first.handoff, producerIdentity: "other-producer" },
        },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({
      outcome: "invalid",
      code: "INPUT_INVALID",
    });
  });

  it("keeps the pure market deployment module browser-safe", async () => {
    const source = await readFile(
      new URL("../src/market-deployment.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /(?:node:|process\.|Buffer|fetch\(|WebSocket|child_process|fs\/promises)/u,
    );
  });
});
