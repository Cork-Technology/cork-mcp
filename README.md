# Cork Protocol Model Context Protocol

This repository is the implementation workspace for RFC-010: a typed Model Context Protocol gateway over one canonical Cork operation core. The browser-safe core, Node-only observation adapters, stable hosted router, durable limit-order submission logic, release controller, and independent Rust signing-gate source are present. The Node.js workspace passes its recorded local baseline; this is implementation evidence, not a production release or activation.

There is no production hosted endpoint, credential, deployment, capability-current package candidate, signed production generation, or owner acceptance record in this repository. The release-candidate Model Context Protocol adapter is deliberately unavailable because the exact required `2.0.0-beta.4` package is unpublished; the stable package is not substituted for it.

The repository uses npm workspaces, ECMAScript modules, TypeScript 5, and Node.js 22. The runtime policy is intentionally `>=22 <23`; a newer local Node.js installation is not accepted as equivalent.

## Quick start

Prerequisites:

- Node.js 22.x; the recorded full local baseline used 22.23.1.
- npm 10.9.x; the repository records npm 10.9.8 as its package-manager version.

From the repository root:

1. Run `npm run check:runtime`.
2. Run `npm ci` against the committed lockfile.
3. Run `npm run ci`.

The latest recorded Node.js baseline passed formatting, linting, typechecking, builds, unit and boundary tests, audits, and the root continuous-integration command. Rust formatting, linting, native tests, and WebAssembly verification were not executed in that local baseline.

## Workspace map

| Path                        | Responsibility                                                                       | Runtime boundary | Current status                                       |
| --------------------------- | ------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------- |
| `packages/operations/`      | `@corkprotocol/operations`, the canonical core, closed schemas, and public types     | Browser-safe     | Implemented and covered by local unit/boundary tests |
| `packages/operations-node/` | `@corkprotocol/operations-node`, typed provider and upstream observation adapters    | Node-only        | Implemented and covered by local unit tests          |
| `packages/gateway/`         | `@corkprotocol/gateway`, stable hosted routing, controls, submission, and activation | Node-only        | Stable lane implemented; release candidate blocked   |
| `packages/conformance/`     | Public-artifact and hosted/direct conformance                                        | Test-only        | In progress; not production release evidence         |
| `crates/signing-gate/`      | Independent native and WebAssembly-oriented signing policy gate                      | Rust             | Source and vectors present; local Rust gates skipped |

The detailed dependency and release contracts are in [ARCHITECTURE.md](./ARCHITECTURE.md). Integration, security, operator, and readiness guidance is in [docs/integration.md](./docs/integration.md), [docs/security.md](./docs/security.md), [docs/operators.md](./docs/operators.md), and [docs/traceability-and-readiness.md](./docs/traceability-and-readiness.md).

## Security and custody boundaries

- The gateway and operation core must never hold signing keys, sign orders or transactions, confirm Safe transactions, broadcast, or schedule caller retries.
- Canonical encoding, reconstruction, deterministic verdicts, and operation identity belong only to the browser-safe operation core.
- Node-only readers may access providers, services, credentials, filesystem, and process facilities, but may return only typed raw observations and failures. They do not decide quorum or deployment truth.
- Caller-held artifacts and unkeyed digests are untrusted whenever they are presented again.
- Deployment evidence and Security Engineering signing-gate policy remain separate immutable roots with separate owners and keys.
- Environment files are ignored. Credentials must be supplied at runtime and must never be copied into container layers.
- The example client in [examples/client.ts](./examples/client.ts) exposes caller-owned signing, Safe confirmation, broadcast, receipt persistence, and retry ports without invoking them.

## Quality commands

| Command                   | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `npm run clean`           | Run workspace cleanup hooks and remove root build/test output.  |
| `npm run build`           | Run every workspace build script that exists.                   |
| `npm run typecheck`       | Run every workspace TypeScript check that exists.               |
| `npm run lint`            | Run every workspace lint script that exists.                    |
| `npm run format:check`    | Check repository formatting with the pinned formatter.          |
| `npm run test:unit`       | Run workspace unit-test scripts.                                |
| `npm run test:boundaries` | Run browser/Node and package-dependency boundary suites.        |
| `npm run test`            | Run unit and boundary suites.                                   |
| `npm run ci`              | Enforce runtime, formatting, lint, type, build, and test gates. |

Workspace delegation uses npm's `--if-present` behavior so packages can be added incrementally without weakening packages that declare a gate.

## Container foundation

The multi-stage `Dockerfile` uses a digest-pinned Node.js 22 image, separates development and production dependency installation, and runs as the unprivileged `node` user in its runtime stage. It copies only declared workspace paths, not the repository wholesale.

Its default command prints the Node.js version. A reviewed deployable package must provide the real entry point, runtime configuration, health behavior, and deployment manifest. Building this foundation is not evidence that any capability is activated or production-ready.

## Production blockers

The following must be resolved before any production claim:

- Publish exact capability-current package candidates and complete public-artifact, hosted/direct, and protocol-era conformance. The release-candidate lane remains fail-closed while exact `2.0.0-beta.4` is unpublished.
- Approve Safe singleton and handler addresses and code hashes, production providers and quorum membership, token onboarding/profile values, and complete maker-service assumptions.
- Approve a production database decision for durable signed-order submission.
- Publish immutable deployment and separate signing-policy generations with accountable keys, publishers, review/promotion records, and transparency mirrors.
- Release the immutable merged RFC 007 authority with all seven producer schema digests and bind exact production deployment generations.
- Record health, rollback, deactivation, emergency-disable, and higher-generation activation drills against the exact release identities.
- Obtain named accountable owner acceptance. No production endpoint, credential, deployment target, or activation record is supplied here.

## Project status

RFC-010 and its Build Spec are the normative design inputs. The repository now contains substantial deterministic implementation and local test evidence, but production readiness depends on immutable package and evidence releases, independently owned publication roots, production configuration decisions, operational drills, and explicit owner acceptance. See the final verdict in [docs/traceability-and-readiness.md](./docs/traceability-and-readiness.md).
