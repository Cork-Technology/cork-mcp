export const RELEASE_CANDIDATE_MCP_PROTOCOL_ERA = "2026-07-28-RC" as const;
export const REQUIRED_RELEASE_CANDIDATE_SDK_VERSION = "2.0.0-beta.4" as const;

export interface ReleaseCandidateAdapterStatus {
  readonly available: false;
  readonly requiredVersion: typeof REQUIRED_RELEASE_CANDIDATE_SDK_VERSION;
  readonly code: "RELEASE_CANDIDATE_SDK_UNPUBLISHED";
  readonly message: string;
}

export const RELEASE_CANDIDATE_ADAPTER_STATUS: ReleaseCandidateAdapterStatus = {
  available: false,
  requiredVersion: REQUIRED_RELEASE_CANDIDATE_SDK_VERSION,
  code: "RELEASE_CANDIDATE_SDK_UNPUBLISHED",
  message:
    "The exact @modelcontextprotocol/sdk 2.0.0-beta.4 release is unpublished; no substitute adapter is permitted.",
};

export function startReleaseCandidateServer(): never {
  throw new Error(
    `${RELEASE_CANDIDATE_ADAPTER_STATUS.code}: ${RELEASE_CANDIDATE_ADAPTER_STATUS.message}`,
  );
}
