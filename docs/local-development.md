# Run the local fixture server

The local fixture server lets a Model Context Protocol client discover and call Cork tools over standard input/output without production credentials or infrastructure. It is deliberately incapable of network access, production signature verification, Safe confirmation, transaction submission, broadcast, or persistence. Every successful handler response includes `fixtureOnly: true` and an explicit fixture notice.

## Prerequisites

- Node.js 22.x. Other major versions are rejected at startup.
- npm 10.9.x.
- A clone of this repository. The workspace packages are not published releases.

Install and build from the repository root:

```
cd /root/repos/cork-mcp
npm ci
npm run build
```

## Prove the real protocol handshake

Run the included smoke client:

```
npm run mcp:smoke
```

The smoke client starts the compiled server through the official standard-input/output client transport, negotiates the protocol, lists tools, calls `cork.capabilities.v1`, lists local markets, constructs a sample Safe transaction, confirms it is fixture-only and non-broadcast, and shuts the child process down. A successful run prints the market, Safe transaction hash, target, nonce, and calldata size.

## Construct local Safe transactions

List the available synthetic markets:

```
npm run mcp:safe-demo -- --list
```

Construct a paired-share unwind for the default market:

```
npm run mcp:safe-demo
```

Construct a proposal for every supported action profile:

```
npm run mcp:safe-coverage
```

This covers `safeUnwindMint`, `safeDeposit`, `safeMint`, `safeUnwindSwap`,
`safeUnwindDeposit`, and `safeRedeem` with sequential fixture Safe nonces. The
result proves canonical preparation, calldata construction, and Safe hashing;
it does not claim chain execution or Safe confirmation.

Choose a market and vary the amounts or Safe nonce:

```
npm run mcp:safe-demo -- \
  --market synthetic-wsteth-usdc-2027 \
  --shares 5000000000000 \
  --min-collateral 2000000 \
  --nonce 8
```

Add `--json` to inspect the complete prepared action, finalized calldata, evidence bindings, and Safe wrapper. Add `--receiver 0x...` to test a different lowercase fixture receiver.

The command is a real Model Context Protocol client/server round trip. The resulting bundler calldata is produced by the canonical paired-share unwind implementation, and the Safe transaction hash is produced by the canonical Safe implementation. Changing only the Safe nonce preserves the calldata and changes the Safe transaction hash. Requested shares are rounded down to the market's displayed precision quantum; the result shows both requested and effective amounts.

The two included markets are synthetic. Their chain identifier, pool identifiers, token addresses, Safe configuration, evidence, and Permit2 signatures are deterministic fixtures. The injected verification seams accept only for local testing. The artifacts must not be imported into a production Safe or submitted to a chain.

## Start the server manually

```
npm run mcp:dev
```

The command rebuilds the workspaces and then waits for a Model Context Protocol client on standard input/output. Appearing to hang is expected. Server notices go only to standard error so standard output remains protocol-clean. Press `Ctrl+C` to stop a manually started server.

For a client-managed process, build once and configure the client to invoke Node.js directly:

```
{
  "mcpServers": {
    "cork-local": {
      "command": "/absolute/path/to/node-22",
      "args": [
        "/root/repos/cork-mcp/packages/gateway/dist/dev-server.js",
        "--quiet"
      ],
      "cwd": "/root/repos/cork-mcp"
    }
  }
}
```

Use the absolute path returned by `command -v node` while Node.js 22 is active. Do not configure a client to run `npm run mcp:dev`: npm may write lifecycle banners to standard output. Direct execution keeps the protocol stream clean.

## Query live current and past markets

Run the opt-in read-only integration client:

```
npm run mcp:live-read
```

The client calls the official Phoenix application programming interface through
the canonical Node adapter and the full Model Context Protocol transport. It
checks all, current, and expired pools as well as flows, whitelist entries,
limit-order markets, orderbook entries, and fills. Add `--json` for structured
output.

Live-read mode allows HTTP `GET` requests only and exposes no construction,
signing, submission, or broadcast tools. Start that server mode directly with:

```
node packages/gateway/dist/dev-server.js --live-read --quiet
```

Filter the validated current market snapshot to markets without a whitelist:

```
npm run mcp:live-read -- --json \
  | sed -n '/^{/,$p' \
  | jq '.markets.currentWithoutWhitelist'
```

An empty array means no current market satisfies the filter. It is not safe to
fall back silently to an expired or whitelist-enabled market.

## Simulate the pinned historical mint

With Foundry installed, run:

```
npm run test:historical-mint
```

The test forks Arbitrum at block `482789214`, before the whitelist-disabled
`USDC-yoUSD-12JUL2026` market expired. It uses fork-only balance mutation to
fund an isolated account with 1 USDC, calls the real deployed Bundler3 and Cork
adapter, and asserts a 1 cPT plus 1 cST mint with no adapter residue. No
transaction is broadcast. Set `ARBITRUM_RPC_URL` to an archive-capable endpoint
to override the public fallback.

## Fixture behavior

- The complete stable static tool catalog is discoverable, subject to the same scope, capability, closed-input, and bounded-work checks as the gateway.
- Three additional `cork.local.*` tools exist only in the local fixture router. They cannot appear in the production static catalog.
- The seven capped-input capability variants remain unavailable and undiscoverable.
- Capability maturity uses deterministic local fixture identities and digests.
- Stable hosted-tool handlers remain in-memory echoes. The local market-list and Safe-unwind handlers call the canonical Cork operation core and return deterministic fixture artifacts.
- No environment variables, secrets, provider addresses, chain connections, external services, databases, or signing keys are read.
- The unpublished release-candidate adapter remains unavailable. The local server uses only the stable adapter.

This mode tests protocol integration, tool discovery, action encoding, precision rounding, Safe hash construction, and custody separation. It is not evidence that a production capability is activated, healthy, simulated against current state, or safe to execute.

## Moving from fixtures to a real market

A real-market test needs current, independently verified deployment and signing-policy generations; provider quorum; pool relationships and live token profiles; Safe singleton, handler, owners, threshold, modules, guard, and nonce; real caller-owned Permit2 signatures; and a pinned-block simulation. None of those values are inferred from the local fixture or from stale documentation. Even in a real integration, the Model Context Protocol server should stop at an unsigned Safe proposal: Safe confirmations and broadcast remain caller-owned.

## Troubleshooting

`Node.js 22.x is required`

: Switch the active runtime to Node.js 22, rebuild, and ensure the client configuration points to that exact Node.js executable.

`Cannot find module .../dist/dev-server.js`

: Run `npm run build` before starting the server or connecting a client.

Client reports invalid protocol output

: Configure the client to execute `node .../dist/dev-server.js --quiet` directly. Shell wrappers and package-manager lifecycle output can corrupt standard output.

No production data appears

: This is intentional. The local fixture server never reads production providers or credentials.
