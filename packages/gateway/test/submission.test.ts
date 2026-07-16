import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InMemorySubmissionRepository,
  SubmissionService,
  computeSubmissionRequestDigest,
  type ExactUpstreamResultV1,
  type ReconciliationOutcomeV1,
  type SignedOrderSubmissionRequestV1,
  type SubmissionAttemptOutcomeV1,
  type SubmissionRepository,
  type SubmissionUpstreamAdapter,
} from "../src/index.js";

class TestClock {
  public value = 100;

  public nowMs(): number {
    return this.value;
  }
}

function upstreamResult(
  statusCode: string,
  body: string,
): ExactUpstreamResultV1 {
  const bytes = Buffer.from(body);
  return {
    schemaVersion: "cork.submission-upstream-result/v1",
    statusCode,
    mediaType: "application/json",
    decodedPayloadBase64: bytes.toString("base64"),
    decodedPayloadLength: String(bytes.byteLength),
    decodedPayloadDigest: `sha256:${createHash("sha256")
      .update(bytes)
      .digest("hex")}`,
  };
}

function request(input?: {
  readonly clientRequestId?: string;
  readonly makingAmount?: string;
}): SignedOrderSubmissionRequestV1 {
  const withoutDigest = {
    schemaVersion: "cork.limit-order-submission/v1" as const,
    principalId: "principal-a",
    upstreamProfileId: "phoenix-limit-orders-v1",
    clientRequestId: input?.clientRequestId ?? "request-a",
    chainId: "1",
    signedOrder: {
      orderHash: `0x${"11".repeat(32)}`,
      makingAmount: input?.makingAmount ?? "10",
      signature: "0x1234",
    },
  };
  return {
    ...withoutDigest,
    submissionRequestDigest: computeSubmissionRequestDigest(withoutDigest),
  };
}

function service(input: {
  readonly repository: SubmissionRepository;
  readonly adapter: SubmissionUpstreamAdapter;
  readonly clock: TestClock;
  readonly ownerId?: string;
}): SubmissionService {
  return SubmissionService.createLocalTestSubstitute({
    repository: input.repository,
    adapter: input.adapter,
    clock: input.clock,
    ownerId: input.ownerId ?? "owner-a",
    dispatchLeaseDurationMs: 50,
    reconcileLeaseDurationMs: 50,
  });
}

function adapter(input?: {
  readonly submit?: () => Promise<SubmissionAttemptOutcomeV1>;
  readonly reconcile?: () => Promise<ReconciliationOutcomeV1>;
}): SubmissionUpstreamAdapter {
  return {
    submit:
      input?.submit ??
      (async () => ({
        kind: "accepted",
        upstreamResult: upstreamResult("201", '{"accepted":true}'),
        upstreamOrderIdentifier: "order-a",
      })),
    reconcile:
      input?.reconcile ??
      (async () => ({
        kind: "absence-unproved",
        evidenceIdentity: { search: "incomplete" },
      })),
  };
}

describe("durable submission ownership", () => {
  it("persists started before network and permits only one owner under concurrency", async () => {
    const repository = new InMemorySubmissionRepository();
    const clock = new TestClock();
    let releaseNetwork: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseNetwork = resolve;
    });
    let submitCalls = 0;
    let observedStarted = false;
    const upstream = adapter({
      submit: async () => {
        submitCalls += 1;
        const stored = await repository.read({
          principalId: "principal-a",
          upstreamProfileId: "phoenix-limit-orders-v1",
          clientRequestId: "request-a",
        });
        observedStarted =
          stored?.state === "pending" &&
          stored.dispatchPhase === "started" &&
          stored.attemptCount === 1;
        await gate;
        return {
          kind: "accepted",
          upstreamResult: upstreamResult("201", '{"accepted":true}'),
        };
      },
    });
    const ownerA = service({
      repository,
      adapter: upstream,
      clock,
      ownerId: "owner-a",
    });
    const ownerB = service({
      repository,
      adapter: upstream,
      clock,
      ownerId: "owner-b",
    });
    const first = ownerA.submit(request());
    await Promise.resolve();
    await Promise.resolve();
    const second = await ownerB.submit(request());
    expect(second.status).toBe("error");
    if (second.status === "error") {
      expect(second.code).toBe("SUBMISSION_IN_PROGRESS");
      expect(second.retryAfter).toBe(150);
    }
    releaseNetwork?.();
    const accepted = await first;
    expect(accepted.status).toBe("accepted");
    expect(observedStarted).toBe(true);
    expect(submitCalls).toBe(1);
  });

  it("returns digest conflict without upstream and replays accepted or rejected exact bytes", async () => {
    const acceptedRepository = new InMemorySubmissionRepository();
    const clock = new TestClock();
    let calls = 0;
    const acceptedService = service({
      repository: acceptedRepository,
      clock,
      adapter: adapter({
        submit: async () => {
          calls += 1;
          return {
            kind: "accepted",
            upstreamResult: upstreamResult("201", '{"accepted":true,"n":1}'),
          };
        },
      }),
    });
    const first = await acceptedService.submit(request());
    const replay = await acceptedService.submit(request());
    const conflict = await acceptedService.submit(
      request({ makingAmount: "11" }),
    );
    expect(first.status).toBe("accepted");
    expect(replay.status).toBe("accepted");
    if (first.status === "accepted" && replay.status === "accepted") {
      expect(replay.replayed).toBe(true);
      expect(replay.upstreamResult).toEqual(first.upstreamResult);
      expect(replay.acceptanceStatus).toBe("accepted-not-filled");
    }
    expect(conflict).toMatchObject({
      status: "error",
      code: "IDEMPOTENCY_KEY_CONFLICT",
    });
    expect(calls).toBe(1);

    const rejectedService = service({
      repository: new InMemorySubmissionRepository(),
      clock,
      adapter: adapter({
        submit: async () => ({
          kind: "rejected",
          upstreamResult: upstreamResult("400", '{"rejected":true}'),
        }),
      }),
    });
    const rejected = await rejectedService.submit(
      request({ clientRequestId: "request-rejected" }),
    );
    const rejectedReplay = await rejectedService.submit(
      request({ clientRequestId: "request-rejected" }),
    );
    expect(rejected.status).toBe("rejected");
    expect(rejectedReplay).toMatchObject({
      status: "rejected",
      replayed: true,
    });
  });
});

describe("ambiguity recovery", () => {
  it("reconciles a found result without another submission", async () => {
    const repository = new InMemorySubmissionRepository();
    const clock = new TestClock();
    let submits = 0;
    let reconciles = 0;
    const submission = service({
      repository,
      clock,
      adapter: adapter({
        submit: async () => {
          submits += 1;
          return {
            kind: "uncertain",
            evidenceIdentity: { timeout: true },
          };
        },
        reconcile: async () => {
          reconciles += 1;
          return {
            kind: "found-accepted",
            upstreamResult: upstreamResult(
              "200",
              '{"accepted":true,"reconciled":true}',
            ),
            upstreamOrderIdentifier: "order-found",
            evidenceIdentity: { orderHash: "found" },
          };
        },
      }),
    });
    const ambiguous = await submission.submit(request());
    expect(ambiguous.status).toBe("ambiguous");
    const found = await submission.reconcile(request());
    expect(found.status).toBe("accepted");
    expect(submits).toBe(1);
    expect(reconciles).toBe(1);
  });

  it("authorizes one explicit retry only after proved absence and never schedules it automatically", async () => {
    const repository = new InMemorySubmissionRepository();
    const clock = new TestClock();
    let submits = 0;
    let reconciles = 0;
    const submission = service({
      repository,
      clock,
      adapter: adapter({
        submit: async () => {
          submits += 1;
          return submits === 1
            ? {
                kind: "uncertain",
                evidenceIdentity: { disconnect: true },
              }
            : {
                kind: "accepted",
                upstreamResult: upstreamResult(
                  "201",
                  '{"accepted":true,"attempt":2}',
                ),
              };
        },
        reconcile: async () => {
          reconciles += 1;
          return {
            kind: "absence-proved",
            evidenceIdentity: {
              consistencyWindow: "complete",
              orderHash: "absent",
            },
          };
        },
      }),
    });
    expect((await submission.submit(request())).status).toBe("ambiguous");
    const authorized = await submission.reconcile(request());
    expect(authorized).toMatchObject({
      status: "retry-authorized",
      code: "SUBMISSION_RETRY_AUTHORIZED",
      attemptCount: 1,
    });
    expect(submits).toBe(1);
    const accepted = await submission.submit(request());
    expect(accepted.status).toBe("accepted");
    expect(submits).toBe(2);
    expect(reconciles).toBe(1);
  });

  it("keeps decoding and compare-and-set uncertainty ambiguous and enforces the two-attempt ceiling", async () => {
    const clock = new TestClock();
    let submits = 0;
    const repository = new InMemorySubmissionRepository();
    const submission = service({
      repository,
      clock,
      adapter: adapter({
        submit: async () => {
          submits += 1;
          return {
            kind: "content-decoding-failed",
            evidenceIdentity: { response: "undecodable" },
          };
        },
        reconcile: async () => ({
          kind: "absence-proved",
          evidenceIdentity: { absent: true },
        }),
      }),
    });
    expect((await submission.submit(request())).status).toBe("ambiguous");
    expect((await submission.reconcile(request())).status).toBe(
      "retry-authorized",
    );
    expect((await submission.submit(request())).status).toBe("ambiguous");
    const ceiling = await submission.reconcile(request());
    expect(ceiling).toMatchObject({
      status: "ambiguous",
      code: "SUBMISSION_OUTCOME_UNKNOWN",
      attemptCount: 2,
    });
    expect(submits).toBe(2);
    expect((await submission.submit(request())).status).toBe("ambiguous");
    expect(submits).toBe(2);

    const base = new InMemorySubmissionRepository();
    let terminalCas = 0;
    const casFailing: SubmissionRepository = {
      repositoryKind: "cas-failure-test",
      testSubstitute: true,
      productionCompatible: false,
      createIfAbsent: (key, record) => base.createIfAbsent(key, record),
      read: (key) => base.read(key),
      compareAndSet: async (input) => {
        if (input.next.state === "accepted") {
          terminalCas += 1;
          return { updated: false, current: await base.read(input.key) };
        }
        return base.compareAndSet(input);
      },
    };
    const casService = service({
      repository: casFailing,
      clock,
      adapter: adapter(),
    });
    const uncertain = await casService.submit(
      request({ clientRequestId: "cas-failure" }),
    );
    expect(uncertain.status).toBe("ambiguous");
    expect(terminalCas).toBe(1);
  });
});
