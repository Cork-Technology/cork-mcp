import {
  buildRequestIdentity,
  canonicalJson,
  failureObservation,
  sha256Text,
  successObservation,
  type RawObservation,
  type SourceIdentity,
} from "./evidence.js";
import type { Sha256Digest } from "@corkprotocol/operations";

export const LIMIT_ORDER_PROTOCOL_ADDRESS =
  "0x111111125421ca6dc452d289314280a0f8842a65" as const;

export type InventoryInvalidatorRegime =
  | "bit-invalidator"
  | "remaining-invalidator";

export interface InventoryServiceOrder {
  readonly orderHash: string;
  readonly submissionDigest: string;
  readonly acceptedServiceIdentity: string;
  readonly signedOrderPayloadDigest: string;
  readonly makerTraits: string;
  readonly nonceOrEpoch: string;
  readonly invalidatorRegime: InventoryInvalidatorRegime;
  readonly indexedStatus: "accepted" | "open" | "partially-filled" | "unknown";
  readonly makingAmount: string;
  readonly indexedRemainingMakingAmount: string;
  readonly expiry: string;
  readonly acceptedPrincipal: string;
  readonly acceptedCredential: string;
  readonly clientRequestId: string;
}

export interface MakerWideInventoryPage {
  readonly scope: "maker-wide";
  readonly items: readonly InventoryServiceOrder[];
  readonly nextCursor: string | null;
  readonly sourcePayloadDigest: string;
}

export interface MakerWideInventoryPageReader {
  readPage(input: {
    readonly maker: string;
    readonly makerToken: string;
    readonly spender: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
    readonly cursor: string | null;
  }): Promise<MakerWideInventoryPage>;
}

export interface InventoryChainObservation {
  readonly canonicalBlockNumber: string;
  readonly canonicalBlockHash: string;
  readonly parentBlockHash: string;
  readonly observedAt: string;
  readonly invalidated: boolean;
  readonly rawInvalidatorValue: string;
  readonly expired: boolean;
  readonly remainingMakingAmount: string;
}

export interface InventoryChainReader {
  observe(input: {
    readonly maker: string;
    readonly orderHash: string;
    readonly makerTraits: string;
    readonly nonceOrEpoch: string;
    readonly invalidatorRegime: InventoryInvalidatorRegime;
    readonly makingAmount: string;
    readonly expiry: string;
  }): Promise<InventoryChainObservation>;
}

export interface CompleteInventoryAdapterConfig {
  readonly serviceIdentity: string;
  readonly administrationIdentity: string;
  readonly origin: string;
  readonly sourceCommit: string;
  readonly sourceSchemaDigest: Sha256Digest;
  readonly sourceProfile: string;
  readonly pageReader: MakerWideInventoryPageReader;
  readonly chainReader: InventoryChainReader;
  readonly now: () => string;
}

export interface CompleteInventoryRequest {
  readonly requestingPrincipal: string;
  readonly maker: string;
  readonly makerToken: string;
  readonly spender: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
  readonly maxPages: number;
  readonly maxItems: number;
}

export interface MakerOrderInventoryRecord {
  readonly orderHash: string;
  readonly submissionDigest: string;
  readonly acceptedServiceIdentity: string;
  readonly signedOrderPayloadDigest: string;
  readonly makerTraits: string;
  readonly nonceOrEpoch: string;
  readonly invalidatorRegime: InventoryInvalidatorRegime;
  readonly indexedStatus: "accepted" | "open" | "partially-filled" | "unknown";
  readonly makingAmount: string;
  readonly remainingMakingAmount: string;
  readonly expiry: string;
  readonly invalidatorObservation: {
    readonly regime: InventoryInvalidatorRegime;
    readonly canonicalBlockNumber: string;
    readonly canonicalBlockHash: string;
    readonly parentBlockHash: string;
    readonly observedAt: string;
    readonly invalidated: boolean;
    readonly rawValue: string;
  };
}

export interface MakerOrderInventory {
  readonly schemaVersion: "cork.maker-order-inventory/v1";
  readonly requestingPrincipal: string;
  readonly sourceProfile: string;
  readonly maker: string;
  readonly makerToken: string;
  readonly spender: typeof LIMIT_ORDER_PROTOCOL_ADDRESS;
  readonly observedAt: string;
  readonly complete: boolean;
  readonly pagesRead: string;
  readonly finalCursor: "";
  readonly records: readonly MakerOrderInventoryRecord[];
  readonly warnings: readonly string[];
  readonly inventoryDigest: string;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const BYTES32 = /^0x[0-9a-f]{64}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const UINT = /^(?:0|[1-9][0-9]*)$/;

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new TypeError(`${label} must not be empty`);
}

function assertAddress(value: string, label: string): void {
  if (!ADDRESS.test(value)) {
    throw new TypeError(`${label} must be a lowercase address`);
  }
}

function assertBytes32(value: string, label: string): void {
  if (!BYTES32.test(value)) {
    throw new TypeError(`${label} must be a lowercase bytes32 value`);
  }
}

function assertSha256(value: string, label: string): void {
  if (!SHA256.test(value)) {
    throw new TypeError(`${label} must be a lowercase sha256 digest`);
  }
}

function assertUint(value: string, label: string): void {
  if (!UINT.test(value)) {
    throw new TypeError(`${label} must be a canonical unsigned integer`);
  }
}

function validateServiceOrder(
  value: InventoryServiceOrder,
  index: number,
): void {
  const label = `items[${index}]`;
  assertBytes32(value.orderHash, `${label}.orderHash`);
  assertSha256(value.submissionDigest, `${label}.submissionDigest`);
  assertNonEmpty(
    value.acceptedServiceIdentity,
    `${label}.acceptedServiceIdentity`,
  );
  assertSha256(
    value.signedOrderPayloadDigest,
    `${label}.signedOrderPayloadDigest`,
  );
  assertUint(value.makerTraits, `${label}.makerTraits`);
  assertUint(value.nonceOrEpoch, `${label}.nonceOrEpoch`);
  if (
    value.invalidatorRegime !== "bit-invalidator" &&
    value.invalidatorRegime !== "remaining-invalidator"
  ) {
    throw new TypeError(`${label}.invalidatorRegime is unsupported`);
  }
  if (
    value.indexedStatus !== "accepted" &&
    value.indexedStatus !== "open" &&
    value.indexedStatus !== "partially-filled" &&
    value.indexedStatus !== "unknown"
  ) {
    throw new TypeError(`${label}.indexedStatus is unsupported`);
  }
  assertUint(value.makingAmount, `${label}.makingAmount`);
  assertUint(
    value.indexedRemainingMakingAmount,
    `${label}.indexedRemainingMakingAmount`,
  );
  assertUint(value.expiry, `${label}.expiry`);
  assertNonEmpty(value.acceptedPrincipal, `${label}.acceptedPrincipal`);
  assertNonEmpty(value.acceptedCredential, `${label}.acceptedCredential`);
  assertNonEmpty(value.clientRequestId, `${label}.clientRequestId`);
}

function validateChainObservation(
  value: InventoryChainObservation,
  makingAmount: string,
): void {
  assertUint(value.canonicalBlockNumber, "canonicalBlockNumber");
  assertBytes32(value.canonicalBlockHash, "canonicalBlockHash");
  assertBytes32(value.parentBlockHash, "parentBlockHash");
  assertUint(value.observedAt, "chain observedAt");
  if (
    typeof value.invalidated !== "boolean" ||
    typeof value.expired !== "boolean"
  ) {
    throw new TypeError("chain invalidated and expired must be boolean");
  }
  assertUint(value.rawInvalidatorValue, "rawInvalidatorValue");
  assertUint(value.remainingMakingAmount, "remainingMakingAmount");
  if (BigInt(value.remainingMakingAmount) > BigInt(makingAmount)) {
    throw new TypeError("chain remaining amount exceeds signed making amount");
  }
}

function emptyInventory(
  request: CompleteInventoryRequest,
  sourceProfile: string,
  observedAt: string,
  pagesRead: number,
  warnings: readonly string[],
): MakerOrderInventory {
  const withoutDigest = {
    schemaVersion: "cork.maker-order-inventory/v1" as const,
    requestingPrincipal: request.requestingPrincipal,
    sourceProfile,
    maker: request.maker,
    makerToken: request.makerToken,
    spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
    observedAt,
    complete: false,
    pagesRead: String(pagesRead),
    finalCursor: "" as const,
    records: [] as readonly MakerOrderInventoryRecord[],
    warnings,
  };
  return {
    ...withoutDigest,
    inventoryDigest: sha256Text(canonicalJson(withoutDigest)),
  };
}

export class CompleteMakerInventoryAdapter {
  readonly #source: SourceIdentity;
  readonly #sourceProfile: string;
  readonly #pageReader: MakerWideInventoryPageReader;
  readonly #chainReader: InventoryChainReader;
  readonly #now: () => string;

  public constructor(config: CompleteInventoryAdapterConfig) {
    assertNonEmpty(config.serviceIdentity, "serviceIdentity");
    assertNonEmpty(config.administrationIdentity, "administrationIdentity");
    assertNonEmpty(config.origin, "origin");
    assertNonEmpty(config.sourceCommit, "sourceCommit");
    assertNonEmpty(config.sourceProfile, "sourceProfile");
    this.#source = {
      service: config.serviceIdentity,
      administrationIdentity: config.administrationIdentity,
      origin: config.origin,
      sourceCommit: config.sourceCommit,
      sourceSchemaDigest: config.sourceSchemaDigest,
    };
    this.#sourceProfile = config.sourceProfile;
    this.#pageReader = config.pageReader;
    this.#chainReader = config.chainReader;
    this.#now = config.now;
  }

  public async read(
    request: CompleteInventoryRequest,
  ): Promise<RawObservation<MakerOrderInventory>> {
    const observedAt = this.#now();
    const identity = buildRequestIdentity("GET", "/maker-order-inventory", [
      ["maker", request.maker],
      ["makerToken", request.makerToken],
      ["spender", request.spender],
    ]);
    try {
      assertNonEmpty(request.requestingPrincipal, "requestingPrincipal");
      assertAddress(request.maker, "maker");
      assertAddress(request.makerToken, "makerToken");
      if (request.spender !== LIMIT_ORDER_PROTOCOL_ADDRESS) {
        throw new TypeError("spender is not the pinned protocol");
      }
      if (
        !Number.isSafeInteger(request.maxPages) ||
        request.maxPages < 1 ||
        !Number.isSafeInteger(request.maxItems) ||
        request.maxItems < 1
      ) {
        throw new TypeError("inventory bounds must be positive safe integers");
      }
    } catch (error) {
      return failureObservation({
        source: this.#source,
        request: identity,
        observedAt,
        failure: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "invalid inventory request",
        },
      });
    }

    let cursor: string | null = null;
    let pagesRead = 0;
    const seenCursors = new Set<string>();
    const serviceRecords = new Map<string, InventoryServiceOrder>();
    try {
      while (true) {
        if (pagesRead >= request.maxPages) {
          throw new TypeError("complete inventory exceeded the page bound");
        }
        const page = await this.#pageReader.readPage({
          maker: request.maker,
          makerToken: request.makerToken,
          spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
          cursor,
        });
        pagesRead += 1;
        if (page.scope !== "maker-wide") {
          throw new TypeError(
            "filtered standard orderbook listing cannot prove completeness",
          );
        }
        assertSha256(page.sourcePayloadDigest, "sourcePayloadDigest");
        for (const [index, item] of page.items.entries()) {
          validateServiceOrder(item, index);
          const previous = serviceRecords.get(item.orderHash);
          if (
            previous !== undefined &&
            canonicalJson(previous) !== canonicalJson(item)
          ) {
            throw new TypeError("duplicate order hash has conflicting records");
          }
          serviceRecords.set(item.orderHash, item);
          if (serviceRecords.size > request.maxItems) {
            throw new TypeError("complete inventory exceeded the item bound");
          }
        }
        if (page.nextCursor === null) break;
        if (page.nextCursor.length === 0 || seenCursors.has(page.nextCursor)) {
          throw new TypeError("inventory cursor is empty or repeated");
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
    } catch (error) {
      const partial = emptyInventory(
        request,
        this.#sourceProfile,
        observedAt,
        pagesRead,
        [
          error instanceof Error
            ? error.message
            : "inventory enumeration failed",
        ],
      );
      return failureObservation({
        source: this.#source,
        request: identity,
        observedAt,
        failure: {
          code: "UPSTREAM_PROJECTION_FAILED",
          message: partial.warnings[0]!,
        },
      });
    }

    const records: MakerOrderInventoryRecord[] = [];
    try {
      let commonBlock:
        | readonly [number: string, hash: string, parent: string]
        | undefined;
      for (const item of serviceRecords.values()) {
        const chain = await this.#chainReader.observe({
          maker: request.maker,
          orderHash: item.orderHash,
          makerTraits: item.makerTraits,
          nonceOrEpoch: item.nonceOrEpoch,
          invalidatorRegime: item.invalidatorRegime,
          makingAmount: item.makingAmount,
          expiry: item.expiry,
        });
        validateChainObservation(chain, item.makingAmount);
        const block = [
          chain.canonicalBlockNumber,
          chain.canonicalBlockHash,
          chain.parentBlockHash,
        ] as const;
        commonBlock ??= block;
        if (
          commonBlock[0] !== block[0] ||
          commonBlock[1] !== block[1] ||
          commonBlock[2] !== block[2]
        ) {
          throw new TypeError(
            "inventory chain observations are not from one canonical block",
          );
        }
        if (
          chain.expired ||
          chain.invalidated ||
          chain.remainingMakingAmount === "0"
        ) {
          continue;
        }
        records.push({
          orderHash: item.orderHash,
          submissionDigest: item.submissionDigest,
          acceptedServiceIdentity: item.acceptedServiceIdentity,
          signedOrderPayloadDigest: item.signedOrderPayloadDigest,
          makerTraits: item.makerTraits,
          nonceOrEpoch: item.nonceOrEpoch,
          invalidatorRegime: item.invalidatorRegime,
          indexedStatus: item.indexedStatus,
          makingAmount: item.makingAmount,
          remainingMakingAmount: chain.remainingMakingAmount,
          expiry: item.expiry,
          invalidatorObservation: {
            regime: item.invalidatorRegime,
            canonicalBlockNumber: chain.canonicalBlockNumber,
            canonicalBlockHash: chain.canonicalBlockHash,
            parentBlockHash: chain.parentBlockHash,
            observedAt: chain.observedAt,
            invalidated: chain.invalidated,
            rawValue: chain.rawInvalidatorValue,
          },
        });
      }
    } catch (error) {
      const partial = emptyInventory(
        request,
        this.#sourceProfile,
        observedAt,
        pagesRead,
        [
          error instanceof Error
            ? error.message
            : "chain reconstruction failed",
        ],
      );
      return failureObservation({
        source: this.#source,
        request: identity,
        observedAt,
        failure: {
          code: "PROVIDER_OBSERVATION_INVALID",
          message: partial.warnings[0]!,
        },
      });
    }

    records.sort((left, right) =>
      left.orderHash.localeCompare(right.orderHash),
    );
    const withoutDigest = {
      schemaVersion: "cork.maker-order-inventory/v1" as const,
      requestingPrincipal: request.requestingPrincipal,
      sourceProfile: this.#sourceProfile,
      maker: request.maker,
      makerToken: request.makerToken,
      spender: LIMIT_ORDER_PROTOCOL_ADDRESS,
      observedAt,
      complete: true,
      pagesRead: String(pagesRead),
      finalCursor: "" as const,
      records,
      warnings: [] as readonly string[],
    };
    const inventory: MakerOrderInventory = {
      ...withoutDigest,
      inventoryDigest: sha256Text(canonicalJson(withoutDigest)),
    };
    return successObservation({
      source: this.#source,
      request: identity,
      observedAt,
      value: inventory,
    });
  }
}
