import {
  MARKET_REGISTRY_SOURCE_COMMIT,
  MarketRegistryClient,
  type MarketRegistryPayload,
} from "./market-registry.js";
import type { RawObservation } from "./evidence.js";

export type MarketDeploymentRead =
  | { readonly kind: "assets-list" }
  | {
      readonly kind: "asset";
      readonly chainId: number;
      readonly address: string;
    }
  | {
      readonly kind: "oracle";
      readonly chainId: number;
      readonly ca: string;
      readonly ref: string;
    };

export class MarketDeploymentRawReader {
  readonly #client: MarketRegistryClient;

  public constructor(input: {
    readonly client: MarketRegistryClient;
    readonly sourceCommit: typeof MARKET_REGISTRY_SOURCE_COMMIT;
  }) {
    if (input.sourceCommit !== MARKET_REGISTRY_SOURCE_COMMIT) {
      throw new TypeError("market-registry source identity drifted");
    }
    this.#client = input.client;
  }

  public read(
    input: MarketDeploymentRead,
  ): Promise<RawObservation<MarketRegistryPayload>> {
    if (input.kind === "assets-list") return this.#client.listAssets();
    if (input.kind === "asset") {
      return this.#client.getAsset({
        chainId: input.chainId,
        address: input.address,
      });
    }
    if (input.kind === "oracle") {
      return this.#client.getOracle({
        chainId: input.chainId,
        ca: input.ca,
        ref: input.ref,
      });
    }
    throw new TypeError("only three pinned market-deployment reads exist");
  }
}
