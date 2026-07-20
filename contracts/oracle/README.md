# Cork oracle contracts

This Foundry module contains Cork's immutable Arbitrum oracle for quoting one sUSDe share in sUSDS shares. `SUsdePerSUsdsRateOracle` isolates the sUSDe/USDe share exchange rate using sUSDe/USD and USDe/USD, then divides it by sUSDS/USDS. Each composition uses full-precision arithmetic and rounds down.

The deployed contract has no owner, mutable state, upgrade path, fallback price, or setter. It checks the Arbitrum sequencer, validates every Chainlink round, and rejects stale or malformed data. Its constructor fixes all four feed addresses, three independent maximum ages, and the sequencer recovery grace period as immutable bytecode configuration.

Every `rate()` read fails closed and uses four read-only static feed calls. There is no callback or state-changing reentrancy surface. Chainlink proxy governance, semantic feed identity, and any post-deployment decimal drift remain deployment and monitoring trust boundaries; operators must verify the eight immutable getters and monitor proxy aggregators.

Run all commands from this directory:

- `/root/.foundry/bin/forge fmt --check`
- `/root/.foundry/bin/forge build`
- `/root/.foundry/bin/forge test`
- `/root/.foundry/bin/forge lint`

The normal suite is deterministic and does not require network access. Set `ARBITRUM_RPC_URL` to opt into the live Arbitrum composition test; without it, Foundry reports that fork test as skipped.

The build uses the installed Solidity 0.8.30 binary at `/usr/local/bin/solc-0.8.30`, targets Cancun, enables the optimizer for 10,000 runs, embeds literal source content, and omits compiler metadata from bytecode. These settings are explicit because the final creation code and CREATE2 address must be reproducible before an EIP-2470 deployment is proposed.

The module has no package-manager dependency or Git submodule. Its only local arithmetic primitive is the unsigned, round-down subset of Uniswap v3-core `FullMath.sol`, pinned to tag `v1.0.0` at `https://github.com/Uniswap/v3-core/blob/v1.0.0/contracts/libraries/FullMath.sol`. Local changes use qualified custom errors and no Solidity `unchecked` block. This keeps the final creation code independent of third-party source changes and dependency resolution.
