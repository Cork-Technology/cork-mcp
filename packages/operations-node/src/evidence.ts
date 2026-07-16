import { createHash } from "node:crypto";
import {
  validateRawObservation,
  type IndependentlyPinnedBlockV1,
  type JsonValue,
  type RawObservationV1,
  type Sha256Digest,
} from "@corkprotocol/operations";

export const RAW_OBSERVATION_SCHEMA_VERSION =
  "cork.raw-observation/v1" as const;
export const UPSTREAM_PAYLOAD_SCHEMA_VERSION = "cork.upstream/v1" as const;

export type ObservationMethod = "GET" | "PROVIDER_READ";

export interface SourceIdentity {
  readonly service: string;
  readonly administrationIdentity: string;
  readonly origin: string;
  readonly sourceCommit: string;
  readonly sourceSchemaDigest: Sha256Digest;
}

export type QueryEntry = readonly [name: string, value: string];

export interface RequestIdentity {
  readonly method: ObservationMethod;
  readonly path: string;
  readonly query: readonly QueryEntry[];
  readonly digest: Sha256Digest;
}

export type ExactBlockReference = IndependentlyPinnedBlockV1;

export type StructuredFailureCode =
  | "INVALID_REQUEST"
  | "UPSTREAM_TRANSPORT_FAILED"
  | "UPSTREAM_CONTENT_DECODING_FAILED"
  | "UPSTREAM_REDIRECT_RESPONSE_UNAVAILABLE"
  | "UPSTREAM_PROJECTION_FAILED"
  | "PROVIDER_READ_FAILED"
  | "PROVIDER_OBSERVATION_INVALID";

export interface StructuredFailure {
  readonly code: StructuredFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type RawSuccessObservation<T> = Omit<
  Extract<RawObservationV1, { readonly kind: "success" }>,
  "value"
> & {
  readonly value: T;
};

export type RawFailureObservation = Extract<
  RawObservationV1,
  { readonly kind: "failure" }
>;

export type RawObservation<T> =
  | RawSuccessObservation<T>
  | RawFailureObservation;

export interface DecodedByteEnvelope {
  readonly bodyBase64: string;
  readonly bodyLength: string;
  readonly bodyDigest: string;
}

export interface UpstreamPayloadBase extends DecodedByteEnvelope {
  readonly schemaVersion: typeof UPSTREAM_PAYLOAD_SCHEMA_VERSION;
  readonly claim: "source-payload";
  readonly source: SourceIdentity;
  readonly request: RequestIdentity;
  readonly observedAt: string;
  readonly statusCode: number;
  readonly mediaType?: string;
}

export interface DecodedPayloadRead {
  readonly bytes: Uint8Array;
  readonly payload: UpstreamPayloadBase;
}

export type DecodedPayloadResult =
  | {
      readonly ok: true;
      readonly value: DecodedPayloadRead;
    }
  | {
      readonly ok: false;
      readonly failure: StructuredFailure;
    };

export class UpstreamRedirectResponseUnavailableError extends Error {
  public override readonly name = "UpstreamRedirectResponseUnavailableError";

  public constructor(
    message = "transport could not expose the manual redirect response",
  ) {
    super(message);
  }
}

export function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function sha256Text(value: string): string {
  return sha256Bytes(new TextEncoder().encode(value));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function buildRequestIdentity(
  method: ObservationMethod,
  path: string,
  query: readonly QueryEntry[],
): RequestIdentity {
  const normalized = canonicalJson({ method, path, query });
  return {
    method,
    path,
    query: query.map(([name, value]) => [name, value] as const),
    digest: sha256Text(normalized) as Sha256Digest,
  };
}

export function pathWithQuery(request: RequestIdentity): string {
  if (request.query.length === 0) {
    return request.path;
  }
  const parameters = new URLSearchParams();
  for (const [name, value] of request.query) {
    parameters.append(name, value);
  }
  return `${request.path}?${parameters.toString()}`;
}

export function createDecodedByteEnvelope(
  bytes: Uint8Array,
): DecodedByteEnvelope {
  return {
    bodyBase64: Buffer.from(bytes).toString("base64"),
    bodyLength: String(bytes.byteLength),
    bodyDigest: sha256Bytes(bytes),
  };
}

export async function readDecodedPayload(input: {
  readonly response: Response;
  readonly source: SourceIdentity;
  readonly request: RequestIdentity;
  readonly observedAt: string;
}): Promise<DecodedPayloadResult> {
  if (input.response.redirected) {
    return {
      ok: false,
      failure: {
        code: "UPSTREAM_REDIRECT_RESPONSE_UNAVAILABLE",
        message:
          "transport followed a redirect instead of exposing the source response",
        retryable: false,
      },
    };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await input.response.arrayBuffer();
  } catch {
    return {
      ok: false,
      failure: {
        code: "UPSTREAM_CONTENT_DECODING_FAILED",
        message: "transport could not expose decoded application payload bytes",
        retryable: false,
      },
    };
  }

  const bytes = new Uint8Array(buffer);
  const trimmedMediaType = input.response.headers.get("content-type")?.trim();
  const payloadBase = {
    schemaVersion: UPSTREAM_PAYLOAD_SCHEMA_VERSION,
    claim: "source-payload" as const,
    source: input.source,
    request: input.request,
    observedAt: input.observedAt,
    statusCode: input.response.status,
    ...createDecodedByteEnvelope(bytes),
  };
  const payload =
    trimmedMediaType === undefined || trimmedMediaType.length === 0
      ? payloadBase
      : { ...payloadBase, mediaType: trimmedMediaType };

  return {
    ok: true,
    value: {
      bytes,
      payload,
    },
  };
}

export function successObservation<T>(input: {
  readonly source: SourceIdentity;
  readonly request: RequestIdentity;
  readonly observedAt: string;
  readonly value: T;
  readonly block?: ExactBlockReference;
}): RawSuccessObservation<T> {
  return validateRawObservation({
    schemaVersion: RAW_OBSERVATION_SCHEMA_VERSION,
    kind: "success",
    providerId: input.source.service,
    administrationId: input.source.administrationIdentity,
    sourceId: input.source.origin,
    requestDigest: input.request.digest,
    sourceCommit: input.source.sourceCommit,
    sourceSchemaDigest: input.source.sourceSchemaDigest,
    observedAt: input.observedAt,
    value: input.value as JsonValue,
    ...(input.block === undefined ? {} : { block: input.block }),
  }) as RawSuccessObservation<T>;
}

export function failureObservation(input: {
  readonly source: SourceIdentity;
  readonly request: RequestIdentity;
  readonly observedAt: string;
  readonly failure: Omit<StructuredFailure, "retryable"> & {
    readonly retryable?: boolean;
  };
}): RawFailureObservation {
  return validateRawObservation({
    schemaVersion: RAW_OBSERVATION_SCHEMA_VERSION,
    kind: "failure",
    providerId: input.source.service,
    administrationId: input.source.administrationIdentity,
    sourceId: input.source.origin,
    requestDigest: input.request.digest,
    sourceCommit: input.source.sourceCommit,
    sourceSchemaDigest: input.source.sourceSchemaDigest,
    observedAt: input.observedAt,
    failure: {
      code: input.failure.code,
      message: input.failure.message,
      retryable: input.failure.retryable ?? false,
    },
  }) as RawFailureObservation;
}
