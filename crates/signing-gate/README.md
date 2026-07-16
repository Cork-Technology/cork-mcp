# Cork independent signing gate

This crate is an independent Security Engineering verification boundary. It has no TypeScript source dependency and does not import the Cork operation-core implementation. Native Rust and `cdylib` WebAssembly interfaces verify an immutable policy generation and evaluate caller-supplied finalized bytes against host-injected raw observations and exact-byte simulation evidence.

Policy authority is rooted only at repository `Cork-Technology/cork-signing-gate` and immutable path `policy-generations/{policyId}/{generation}/`. Policy activation and retirement require exactly two ordered, distinct, valid Ed25519 signatures from the approved offline Security Engineering root. Security and deployment keyrings must be disjoint. A one-key tombstone can only emergency-disable the unchanged active policy; it cannot activate, reactivate, change content, or roll back generation.

The gate accepts finalized bytes as untrusted caller input. Observation and simulation traits are supplied by the enforcing host and must be backed by independently controlled gate providers, including at least one endpoint absent from the operation-core provider set. The crate constructs no provider or network client. A WebAssembly host supplies the same raw injected evidence through the separate evidence JSON argument; an account component may claim enforcement only when that host actually refuses authorization without an `allow` decision.

An allow binds the gate build, exact active policy generation and digest, account component, deployment, intent, execution and payload digests, optional core simulation digest, manifest, runtime and proxy evidence, independently agreed fresh canonical block, and successful exact-byte simulation. A deny is structured, carries no invented freshness, and never mutates or returns replacement execution bytes.

The crate exposes no signing function, production key material, persistence, custody, Safe confirmation collection, broadcast, retry scheduler, or authorization transport. Ed25519 support is verification-only in the library surface. Test vectors use deterministic non-production keys solely to define compile-ready verification mutations.

## Interfaces

- `verify_policy_generation(policy, context)` and `verify_policy_generation_json(...)`
- `evaluate_gate(request, verified_policy, observation_port, simulation_port)` and `evaluate_gate_json(...)`
- With feature `wasm`, `verify_policy_generation_wasm(...)` and `evaluate_gate_wasm(...)`

The JSON interfaces use closed Serde objects and deterministic RFC 8785 serialization. Policy digests exclude only the policy self-digest, ordered signature fields, and the emergency tombstone signature. Decision digests exclude only their own digest field.

## Verification status

Local Rust tooling is unavailable in this execute stage. Only structural checks are performed locally: owned-file closure, schema closure, source-boundary text checks, WebAssembly export presence, injected trait presence, forbidden-facility absence, and continuous-integration command presence. Cargo compilation, formatting, linting, tests, and WebAssembly checking are explicitly unverified locally.

The first executable Rust verifier is the dedicated continuous-integration job, which runs:

- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-features`
- `rustup target add wasm32-unknown-unknown`
- `cargo check --target wasm32-unknown-unknown --features wasm`
