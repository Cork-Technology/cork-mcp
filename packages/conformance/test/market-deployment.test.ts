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
  type MarketQuoteResultV1,
  type RawObservationSuccessV1,
  type RFC007ArtifactNameV1,
  type RFC007SchemaBundleV1,
  type RFC007SchemaDocumentV1,
  type RFC007SchemaValidatorV1,
  type ReleasedProducerArtifactV1,
  type Sha256Digest,
} from "@corkprotocol/operations";
import {
  MarketDeploymentRawReader,
  MarketRegistryClient,
} from "@corkprotocol/operations-node";

const digest = (byte: string) => `sha256:${byte.repeat(64)}` as Sha256Digest;
const address = (byte: string) => `0x${byte.repeat(40)}`;
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

function bytes(value: string): Uint8Array {
  return Uint8Array.from({ length: value.length / 2 - 1 }, (_, index) =>
    Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16),
  );
}

function shaBytes(value: string): Sha256Digest {
  return `sha256:${hex(sha256Bytes(bytes(value)))}`;
}

function build(): MarketBuildPackageV1 {
  const selector = hex(
    keccak256Bytes(new TextEncoder().encode("deploy(address,address)")).slice(
      0,
      4,
    ),
  );
  const registryDeployCalldata =
    `0x${selector}${"0".repeat(24)}${CA.slice(2)}` +
    `${"0".repeat(24)}${REF.slice(2)}`;
  const poolCreationCalldata = "0x12345678";
  const registryDeployCalldataHash = keccak256Digest(
    bytes(registryDeployCalldata),
  );
  const poolCreationCalldataHash = keccak256Digest(bytes(poolCreationCalldata));
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
  const artifactBytes = `0x${hex(
    new TextEncoder().encode(JSON.stringify(value)),
  )}`;
  return {
    schemaVersion: `${document.artifactName}/v1`,
    producerIdentity: document.producerIdentity,
    bytes: artifactBytes,
    byteDigest: shaBytes(artifactBytes),
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
      producerIdentity: `fixture-${artifactName}-producer`,
      releaseIdentity: "fixture-rfc007-release",
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
    revision: "fixture-merged-rfc007",
    releaseIdentity: "fixture-rfc007-release",
    documents,
  };
  const schemaBundle: RFC007SchemaBundleV1 = {
    ...bundleBase,
    bundleDigest: sha256CanonicalJson(bundleBase as unknown as JsonValue),
  };
  return {
    schemaVersion: "cork.market-deployment/v1",
    clientRequestId: "fixture-market-deployment",
    chainId: "31337",
    automationRelease: createMergedRFC007Release({
      schemaVersion: "cork.merged-rfc007-release/v1",
      status: "merged-immutable",
      revision: "fixture-merged-rfc007",
      releaseIdentity: "fixture-rfc007-release",
      underwritingService: {
        sourceCommit: "0a8db7ab30c0dcf1fee6379e2670ed51b10f45be",
        packageVersion: "fixture-1.0.0",
      },
      marketPipeline: {
        sourceCommit: "8985c6d614330cdcd49a22bcaffa41b83de1336f",
        packageVersion: "fixture-1.0.0",
      },
      marketRegistry: {
        sourceCommit: MARKET_REGISTRY_SOURCE_COMMIT,
        packageVersion: "fixture-1.0.0",
      },
      recipePackage: {
        identity: "fixture-market-recipe",
        version: "fixture-1",
        digest: digest("8"),
      },
      schemaDigests,
    }),
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
): RawObservationSuccessV1 {
  return {
    schemaVersion: "cork.raw-observation/v1",
    kind: "success",
    providerId,
    administrationId,
    sourceId: "fixture-chain-reader",
    requestDigest: digest("9"),
    sourceCommit: "ab".repeat(20),
    sourceSchemaDigest: digest("a"),
    observedAt: "1000",
    block: {
      kind: "independently-pinned",
      blockNumber: "100",
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
    collateralQuoteUnit: "FIXTURE_USD",
    referenceQuoteUnit: "FIXTURE_USD",
    conversionFeeds: [address("8"), address("9")],
    expectedWrapper: WRAPPER,
    rateOracleFactory: FACTORY,
    rateOracleRuntime: digest("e"),
  };
  return MARKET_DEPLOYMENT_FACTS.map((field) => ({
    field,
    observations: [
      observation("fixture-provider-a", "fixture-admin-a", values[field]),
      observation("fixture-provider-b", "fixture-admin-b", values[field]),
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

describe("public market deployment interleaving", () => {
  it("preserves producer artifacts and lets only same-block facts select fresh deployment", async () => {
    const rawBodies = [
      '{"data":[],"total":0,"limit":500,"offset":0,"meta":{"reads":{"31337":{"block_number":100}}}}',
      `{"chain_id":31337,"ca":"${CA}","ref":"${REF}","wrapper":"${WRAPPER}",` +
        '"deployed":true,"deployable":true,"reason":null,"meta":{"reads":{"31337":{"block_number":101}}}}',
    ];
    let readIndex = 0;
    const reader = new MarketDeploymentRawReader({
      sourceCommit: MARKET_REGISTRY_SOURCE_COMMIT,
      client: new MarketRegistryClient({
        transport: {
          origin: "https://fixture.invalid",
          administrationIdentity: "fixture-registry-admin",
          sourceSchemaDigest: digest("f"),
          fetch: async () =>
            new Response(rawBodies[readIndex++]!, {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        },
        now: () => "1000",
      }),
    });
    const metadata = await reader.read({ kind: "assets-list" });
    const oracle = await reader.read({
      kind: "oracle",
      chainId: 31337,
      ca: CA,
      ref: REF,
    });
    expect(metadata.kind).toBe("success");
    expect(oracle.kind).toBe("success");
    if (oracle.kind !== "success") return;
    expect(oracle.value.bodyBase64).toBe(
      Buffer.from(rawBodies[1]!).toString("base64"),
    );
    expect(oracle.value.projection).toMatchObject({
      ok: true,
      kind: "oracle",
      value: {
        deployedClaim: {
          classification: "untrusted-source-claim",
          value: true,
        },
        reads: { classification: "untrusted-source-metadata" },
      },
    });

    const input = deployment();
    const before = structuredClone(input);
    const quoted = quote(input);
    const prepared = prepareMarketDeployment(
      { quote: quoted, deployment: input, facts: facts(ZERO) },
      SCHEMA_VALIDATOR,
    );
    expect(input).toEqual(before);
    expect(prepared.outcome).toBe("fresh-deployment");
    if (prepared.outcome !== "fresh-deployment") return;
    expect(prepared.transactions).toHaveLength(2);
    expect(prepared.transactions[1]!.data).toBe(
      input.buildPackage.poolCreationCalldata,
    );
    expect(prepared.producerArtifactDigests).toEqual([
      input.handoff.byteDigest,
      input.resolvedArtifact.byteDigest,
      input.verdict.byteDigest,
      input.buildArtifact.byteDigest,
      input.stagingEvidence.byteDigest,
      input.unsignedSafeProposal.byteDigest,
      input.attestation.byteDigest,
    ]);
    const simulation = createMarketDeploymentSimulation({
      prepared,
      calls: prepared.transactions.map((transaction, transactionIndex) => ({
        transactionIndex,
        target: transaction.target,
        dataDigest: transaction.dataDigest,
        status: "success",
        reasonCode: "FIXTURE_SUCCESS",
      })),
      simulatedAt: "1001",
    });
    expect(simulation).toMatchObject({
      quoteDigest: quoted.quoteDigest,
      preparedDigest: prepared.preparedDigest,
      deploymentProven: false,
    });
    const registryReceipt = {
      transactionIndex: 0,
      transactionHash: keccak256Digest(Uint8Array.from([1])),
      blockNumber: "90",
      blockHash: blockHash("d"),
      parentBlockHash: blockHash("c"),
      final: true,
      status: "success" as const,
      ...prepared.transactions[0],
      events: [
        {
          kind: "wrapper-deployed" as const,
          emitter: REGISTRY,
          collateralAsset: CA,
          referenceAsset: REF,
          wrapperFactory: FACTORY,
          wrapper: WRAPPER,
        },
      ],
    };
    expect(
      reconcileMarketDeployment(
        {
          prepared,
          quote: quoted,
          deployment: input,
          preparationFacts: facts(ZERO),
          finalFacts: facts(WRAPPER),
          receipts: [registryReceipt],
        },
        SCHEMA_VALIDATOR,
      ),
    ).toMatchObject({
      status: "registry-only-partial",
      remainingTransactions: [prepared.transactions[1]],
      poolExecutionProven: false,
    });
  });

  it("fails before byte freeze on provider disagreement", () => {
    const disagreeing = facts();
    disagreeing[0] = {
      ...disagreeing[0]!,
      observations: [
        observation("fixture-provider-a", "fixture-admin-a", ZERO),
        observation("fixture-provider-b", "fixture-admin-b", WRAPPER),
      ],
    };
    const input = deployment();
    const result = prepareMarketDeployment(
      { quote: quote(input), deployment: input, facts: disagreeing },
      SCHEMA_VALIDATOR,
    );
    expect(result).toMatchObject({
      outcome: "conflict",
      code: "QUORUM_FAILED",
    });
    expect(JSON.stringify(result)).not.toContain("transactions");
  });
});
