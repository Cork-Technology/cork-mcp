# Run the local fixture server

The local fixture server lets a Model Context Protocol client discover and call Cork tools over standard input/output without production credentials or infrastructure. It is deliberately incapable of network access, signing, transaction submission, broadcast, or persistence. Every successful handler response includes `fixtureOnly: true` and an explicit fixture notice.

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

The smoke client starts the compiled server through the official standard-input/output client transport, negotiates the protocol, lists tools, calls `cork.capabilities.v1`, confirms the response is fixture-only, and shuts the child process down. A successful run prints the number of discovered tools.

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

## Fixture behavior

- The complete stable static tool catalog is discoverable, subject to the same scope, capability, closed-input, and bounded-work checks as the gateway.
- The seven capped-input capability variants remain unavailable and undiscoverable.
- Capability maturity uses deterministic local fixture identities and digests.
- Every tool implementation is in-memory and returns its handler name plus the validated input.
- No environment variables, secrets, provider addresses, chain connections, external services, databases, or signing keys are read.
- The unpublished release-candidate adapter remains unavailable. The local server uses only the stable adapter.

This mode tests protocol integration and tool discovery. It is not evidence that a production capability is activated, healthy, or safe to execute.

## Troubleshooting

`Node.js 22.x is required`

: Switch the active runtime to Node.js 22, rebuild, and ensure the client configuration points to that exact Node.js executable.

`Cannot find module .../dist/dev-server.js`

: Run `npm run build` before starting the server or connecting a client.

Client reports invalid protocol output

: Configure the client to execute `node .../dist/dev-server.js --quiet` directly. Shell wrappers and package-manager lifecycle output can corrupt standard output.

No production data appears

: This is intentional. The local fixture server never reads production providers or credentials.
