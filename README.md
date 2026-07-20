# Cork Model Context Protocol server

`cork-mcp` gives agents and applications a typed interface to Cork Protocol market data and transaction construction.

It exposes tools for:

- discovering Cork pools, flows, whitelists, limit-order markets, orders, and fills;
- verifying market and deployment evidence;
- inspecting and preparing token authority changes;
- preparing, finalizing, simulating, and reconciling Cork actions;
- constructing caller-owned Safe transactions without collecting confirmations;
- preparing limit orders and market deployments; and
- reporting which capabilities are currently callable.

Read results preserve the upstream response bytes and label them as untrusted source observations. Write tools construct artifacts only. The server does not hold signing keys, confirm Safe transactions, or broadcast on behalf of the caller.

## Requirements

- Node.js 22
- npm 10.9

The packages are currently consumed from this repository rather than a public package release.

The runnable server has two explicit modes: a no-network fixture mode for
transaction construction tests and an opt-in live read-only mode for Phoenix
market data. Production write activation requires operator-supplied evidence,
policy, credentials, and chain infrastructure; it is not enabled by this
repository alone.

## Install

```
git clone https://github.com/Cork-Technology/cork-mcp.git
cd cork-mcp
npm ci
npm run build
```

Confirm the runtime and repository are healthy:

```
npm run check:runtime
npm run ci
```

## Try it locally

Run a complete local client/server handshake:

```
npm run mcp:smoke
```

This starts the server over standard input/output, discovers its tools, and constructs a deterministic non-broadcast Safe transaction for a synthetic market.

List the synthetic markets available to the Safe demo:

```
npm run mcp:safe-demo -- --list
```

Construct a Safe transaction:

```
npm run mcp:safe-demo
```

Construct one proposal for each of the six supported Cork action profiles:

```
npm run mcp:safe-coverage
```

The coverage command produces sequential, unsigned Safe proposals for
`safeUnwindMint`, `safeDeposit`, `safeMint`, `safeUnwindSwap`,
`safeUnwindDeposit`, and `safeRedeem`. It is a deterministic local encoding
test, not a chain simulation.

Add `-- --json` to `mcp:safe-coverage` to inspect all six complete artifacts.

Select a market and inspect the complete artifacts:

```
npm run mcp:safe-demo -- \
  --market synthetic-wsteth-usdc-2027 \
  --shares 5000000000000 \
  --min-collateral 2000000 \
  --nonce 8 \
  --json
```

The Safe demo is fully local. Its chain, markets, addresses, balances, evidence, and Permit2 signatures are fixtures and must not be submitted to a real chain.

## Read live Cork market data

Run the opt-in read-only integration test:

```
npm run mcp:live-read
```

The command calls `https://api-phoenix.cork.tech` through the Model Context Protocol server and canonical Node adapter. It tests:

- all, current, and expired pools;
- pool flows and whitelist entries;
- limit-order markets;
- the orderbook; and
- fills.

Live-read mode exposes only capability and read tools. It permits HTTP `GET` requests to the configured Phoenix origin and does not expose preparation, signing, submission, or broadcast tools. Add `--json` for a machine-readable result.

List the current markets whose whitelist is disabled:

```
npm run mcp:live-read -- --json \
  | sed -n '/^{/,$p' \
  | jq '.markets.currentWithoutWhitelist'
```

The result can legitimately be empty. Never substitute an expired market or a
whitelist-enabled market when preparing a current transaction.

## Simulate a mint against a deployed market

The repository includes a pinned historical-fork test for the Arbitrum
`USDC-yoUSD-12JUL2026` market. The market had its whitelist disabled and was
active at the pinned block. The test gives its isolated test account 1 USDC,
calls the real deployed Bundler3 and Cork adapter, and verifies that exactly 1
cPT and 1 cST are minted with no collateral left on the adapter.

Install [Foundry](https://getfoundry.sh/getting-started/installation) and run:

```
npm run test:historical-mint
```

Set `ARBITRUM_RPC_URL` to an archive-capable Arbitrum endpoint if the public
fallback is unavailable. The command runs entirely on a local fork and omits
Foundry's `--broadcast` option.

## Connect a Model Context Protocol client

Build once, then configure the client to start the server directly with Node.js 22:

```
{
  "mcpServers": {
    "cork": {
      "command": "/absolute/path/to/node-22",
      "args": [
        "/absolute/path/to/cork-mcp/packages/gateway/dist/dev-server.js",
        "--quiet"
      ],
      "cwd": "/absolute/path/to/cork-mcp"
    }
  }
}
```

The default server is fixture-only and performs no network requests. Add `--live-read` before `--quiet` to enable the public read-only Phoenix tools.

Run the server manually when debugging a client connection:

```
npm run mcp:dev
```

The process waits for a client on standard input/output. This is expected. Server diagnostics use standard error so they do not corrupt the protocol stream.

## Tool behavior

Every tool has a closed input schema: unknown fields are rejected. The gateway also enforces credential scopes, capability maturity, bounded work, cancellation, and deadlines before invoking a handler.

The main tool groups are:

| Group             | Examples                                                   | Effect                         |
| ----------------- | ---------------------------------------------------------- | ------------------------------ |
| Capabilities      | `cork.capabilities.v1`                                     | Read                           |
| Phoenix data      | `cork.phoenix.pools.list.v1`, `cork.phoenix.flows.list.v1` | Read                           |
| Limit orders      | market, orderbook, fill, maker, taker, cancellation tools  | Read or construct              |
| Authority         | inspect, onboard preparation, revocation preparation       | Read or construct              |
| Cork actions      | mint, unwind, repurchase, redeem lifecycles                | Construct, simulate, reconcile |
| Market deployment | quote, prepare, simulate, reconcile                        | Construct, simulate, reconcile |
| Local demos       | market list, Safe unwind, six-profile Safe coverage        | Fixture only                   |

A tool being discoverable does not mean that a production capability is active. `cork.capabilities.v1` is the source for the current callable state.

## Safe boundary

The server may construct calldata, Safe transaction fields, and the Safe transaction hash. Safe message signatures and Safe transaction confirmations remain separate. The caller owns confirmation, submission, receipt storage, and retries.

For a real Safe proposal, the caller must supply current verified market evidence, the exact Safe configuration and nonce, caller-owned authorization artifacts, and a simulation against pinned chain state. The local demo does not substitute fixture values for those inputs.

## Packages

| Package                         | Purpose                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `@corkprotocol/operations`      | Browser-safe canonical encoders, validators, hashes, and operation state machines |
| `@corkprotocol/operations-node` | Phoenix, Market Registry, provider, and inventory observation adapters            |
| `@corkprotocol/gateway`         | Model Context Protocol transport, routing, controls, local server, and demos      |
| `@corkprotocol/conformance`     | Cross-package and public-artifact conformance tests                               |

The Rust signing gate is under `crates/signing-gate` and remains independent from the TypeScript operation core.

## Development

```
npm run format:check
npm run build
npm run typecheck
npm run test
npm run ci
```

Useful focused commands:

```
npm test --workspace @corkprotocol/operations
npm test --workspace @corkprotocol/operations-node
npm test --workspace @corkprotocol/gateway
npm test --workspace @corkprotocol/conformance
```

See [docs/local-development.md](./docs/local-development.md) for local modes and troubleshooting, [docs/integration.md](./docs/integration.md) for integration contracts, and [docs/security.md](./docs/security.md) for trust and custody boundaries.

## License

This repository is currently unlicensed for external redistribution. See `package.json` for the recorded package license state.
