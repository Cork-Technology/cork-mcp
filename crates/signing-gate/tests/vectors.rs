use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use cork_signing_gate::gate::{
    evaluate_gate, GateBuildV1, GateDecisionKindV1, GateRequestV1, RawGateObservationV1,
    RawGateSimulationV1, SimulationStatusV1, StaticObservationPort, StaticSimulationPort,
};
use cork_signing_gate::policy::{
    compute_policy_digest, verify_policy_generation, PolicyGenerationV1, PolicyPayloadV1,
    PolicySignatureV1, PolicyStatusV1, PolicyTrustRootV1, PolicyVerificationContextV1,
    PublisherV1, RepositoryReleaseV1, ReviewPromotionV1, TransparencyRecordV1,
    VerificationKeyV1, POLICY_REPOSITORY, POLICY_SCHEMA_VERSION, POLICY_TRUST_DOMAIN,
};
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest as _, Sha256};
use sha3::Keccak256;

const SHA_A: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B: &str = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn keys() -> (SigningKey, SigningKey) {
    (
        SigningKey::from_bytes(&[7_u8; 32]),
        SigningKey::from_bytes(&[9_u8; 32]),
    )
}

fn context(first: &SigningKey, second: &SigningKey) -> PolicyVerificationContextV1 {
    PolicyVerificationContextV1 {
        expected_trust_root_id: "security-root-v1".to_owned(),
        approved_security_keys: vec![
            VerificationKeyV1 {
                key_id: "security-key-a".to_owned(),
                public_key_base64: BASE64.encode(first.verifying_key().to_bytes()),
            },
            VerificationKeyV1 {
                key_id: "security-key-b".to_owned(),
                public_key_base64: BASE64.encode(second.verifying_key().to_bytes()),
            },
        ],
        deployment_signature_key_ids: vec!["deployment-key-a".to_owned()],
        minimum_generation: 1,
    }
}

fn unsigned_policy() -> PolicyGenerationV1 {
    PolicyGenerationV1 {
        schema_version: POLICY_SCHEMA_VERSION.to_owned(),
        repository: POLICY_REPOSITORY.to_owned(),
        immutable_path: "policy-generations/default/1/".to_owned(),
        policy_id: "default".to_owned(),
        generation: 1,
        status: PolicyStatusV1::Active,
        canonical_payload: PolicyPayloadV1 {
            policy_id: "default".to_owned(),
            generation: 1,
            allowed_gate_build_digest: SHA_A.to_owned(),
            allowed_deployment_ids: vec!["deployment-a".to_owned()],
            approved_account_components: vec!["controlled-signer-a".to_owned()],
            require_independent_simulation: true,
            maximum_observation_age_ms: 60_000,
            maximum_head_lag: 2,
        },
        policy_digest: String::new(),
        trust_root: PolicyTrustRootV1 {
            trust_domain: POLICY_TRUST_DOMAIN.to_owned(),
            trust_root_id: "security-root-v1".to_owned(),
            owner: "Security Engineering".to_owned(),
            offline: true,
            approved_key_ids: vec![
                "security-key-a".to_owned(),
                "security-key-b".to_owned(),
            ],
            threshold: 2,
        },
        signatures: Vec::new(),
        review_promotion: ReviewPromotionV1 {
            reviewed_by: vec!["reviewer-a".to_owned(), "reviewer-b".to_owned()],
            review_digest: SHA_A.to_owned(),
            promoted_by: "security-promoter".to_owned(),
            promoted_at: 100,
            promotion_digest: SHA_B.to_owned(),
        },
        publisher: PublisherV1 {
            publisher_id: "security-publisher".to_owned(),
            published_at: 110,
        },
        repository_release: RepositoryReleaseV1 {
            repository_commit: "0123456789abcdef0123456789abcdef01234567".to_owned(),
            release_tag: "policy-v1".to_owned(),
            release_digest: SHA_A.to_owned(),
        },
        transparency_record: TransparencyRecordV1 {
            log_id: "security-policy-log".to_owned(),
            entry_id: "entry-1".to_owned(),
            entry_digest: SHA_B.to_owned(),
            recorded_at: 120,
        },
        successor: None,
        tombstone: None,
    }
}

fn signed_policy() -> (PolicyGenerationV1, PolicyVerificationContextV1) {
    let (first, second) = keys();
    let mut policy = unsigned_policy();
    policy.policy_digest = compute_policy_digest(&policy).expect("digest");
    policy.signatures = vec![
        PolicySignatureV1 {
            key_id: "security-key-a".to_owned(),
            algorithm: "ed25519".to_owned(),
            policy_digest: policy.policy_digest.clone(),
            signature_base64: BASE64.encode(first.sign(policy.policy_digest.as_bytes()).to_bytes()),
        },
        PolicySignatureV1 {
            key_id: "security-key-b".to_owned(),
            algorithm: "ed25519".to_owned(),
            policy_digest: policy.policy_digest.clone(),
            signature_base64: BASE64.encode(second.sign(policy.policy_digest.as_bytes()).to_bytes()),
        },
    ];
    (policy, context(&first, &second))
}

fn request(bytes: &[u8], policy_digest: &str) -> GateRequestV1 {
    GateRequestV1 {
        gate_build: GateBuildV1 {
            package_version: "0.1.0".to_owned(),
            source_commit: "0123456789abcdef0123456789abcdef01234567".to_owned(),
            build_digest: SHA_A.to_owned(),
        },
        policy_generation: 1,
        policy_digest: policy_digest.to_owned(),
        account_component_id: "controlled-signer-a".to_owned(),
        deployment_id: "deployment-a".to_owned(),
        intent_digest: SHA_B.to_owned(),
        execution_digest: format!("keccak256:{}", hex::encode(Keccak256::digest(bytes))),
        payload_digest: format!("sha256:{}", hex::encode(Sha256::digest(bytes))),
        core_simulation_digest: Some(SHA_A.to_owned()),
        manifest_generation: 7,
        manifest_digest: SHA_B.to_owned(),
        runtime_evidence_digest: SHA_A.to_owned(),
        proxy_evidence_digest: SHA_B.to_owned(),
        finalized_bytes_base64: BASE64.encode(bytes),
        core_provider_ids: vec!["core-provider-a".to_owned(), "core-provider-b".to_owned()],
        decision_time_ms: 10_000,
    }
}

fn observations(request: &GateRequestV1) -> Vec<RawGateObservationV1> {
    ["gate-provider-a", "gate-provider-b"]
        .iter()
        .enumerate()
        .map(|(index, provider)| RawGateObservationV1 {
            provider_id: (*provider).to_owned(),
            administration_id: format!("gate-admin-{index}"),
            block_number: 100,
            block_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_owned(),
            parent_hash:
                "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                    .to_owned(),
            head_number: 101,
            observed_at_ms: 9_990,
            manifest_generation: request.manifest_generation,
            manifest_digest: request.manifest_digest.clone(),
            deployment_id: request.deployment_id.clone(),
            runtime_evidence_digest: request.runtime_evidence_digest.clone(),
            proxy_evidence_digest: request.proxy_evidence_digest.clone(),
            execution_digest: request.execution_digest.clone(),
            payload_digest: request.payload_digest.clone(),
        })
        .collect()
}

fn simulations(request: &GateRequestV1) -> Vec<RawGateSimulationV1> {
    ["gate-provider-a", "gate-provider-b"]
        .iter()
        .enumerate()
        .map(|(index, provider)| RawGateSimulationV1 {
            provider_id: (*provider).to_owned(),
            administration_id: format!("gate-admin-{index}"),
            block_number: 100,
            block_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                .to_owned(),
            execution_digest: request.execution_digest.clone(),
            payload_digest: request.payload_digest.clone(),
            status: SimulationStatusV1::Success,
            trace_digest: Some(SHA_A.to_owned()),
            reason: None,
        })
        .collect()
}

#[test]
fn allow_and_deterministic_output_vector() {
    let (policy, context) = signed_policy();
    let verified = verify_policy_generation(&policy, &context).expect("verified policy");
    let request = request(b"exact finalized bytes", &policy.policy_digest);
    let observation_port = StaticObservationPort::new(
        vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
        observations(&request),
    );
    let simulation_port = StaticSimulationPort::new(
        vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
        simulations(&request),
    );
    let first =
        evaluate_gate(&request, &verified, &observation_port, &simulation_port).expect("allow");
    let second =
        evaluate_gate(&request, &verified, &observation_port, &simulation_port).expect("allow");
    assert_eq!(first.decision, GateDecisionKindV1::Allow);
    assert_eq!(first, second);
    assert!(first.freshness.is_some());
}

#[test]
fn policy_mutation_vectors() {
    let (policy, context) = signed_policy();
    let mut unknown = serde_json::to_value(&policy).expect("json");
    unknown
        .as_object_mut()
        .expect("object")
        .insert("unknown".to_owned(), serde_json::Value::Bool(true));
    assert!(serde_json::from_value::<PolicyGenerationV1>(unknown).is_err());

    let mut digest = policy.clone();
    digest.canonical_payload.maximum_head_lag = 1;
    assert!(verify_policy_generation(&digest, &context).is_err());

    let mut unordered = policy.clone();
    unordered.signatures.reverse();
    assert!(verify_policy_generation(&unordered, &context).is_err());

    let mut duplicate = policy.clone();
    duplicate.signatures[1] = duplicate.signatures[0].clone();
    assert!(verify_policy_generation(&duplicate, &context).is_err());

    let mut reused_context = context.clone();
    reused_context
        .deployment_signature_key_ids
        .push("security-key-a".to_owned());
    assert!(verify_policy_generation(&policy, &reused_context).is_err());

    let mut publication = policy.clone();
    publication.publisher.published_at = 99;
    publication.policy_digest = compute_policy_digest(&publication).expect("digest");
    assert!(verify_policy_generation(&publication, &context).is_err());

    let mut successor = policy.clone();
    successor.successor = Some(cork_signing_gate::policy::PolicySuccessorV1 {
        policy_id: "default".to_owned(),
        generation: 1,
        policy_digest: SHA_A.to_owned(),
        repository: POLICY_REPOSITORY.to_owned(),
        immutable_path: "policy-generations/default/1/".to_owned(),
    });
    successor.policy_digest = compute_policy_digest(&successor).expect("digest");
    assert!(verify_policy_generation(&successor, &context).is_err());
}

#[test]
fn deny_mutation_vectors() {
    let (policy, context) = signed_policy();
    let verified = verify_policy_generation(&policy, &context).expect("verified policy");
    let base = request(b"exact finalized bytes", &policy.policy_digest);

    let missing_external = StaticObservationPort::new(
        vec!["core-provider-a".to_owned(), "core-provider-b".to_owned()],
        observations(&base)
            .into_iter()
            .enumerate()
            .map(|(index, mut value)| {
                value.provider_id = format!("core-provider-{}", if index == 0 { "a" } else { "b" });
                value
            })
            .collect(),
    );
    let simulations = StaticSimulationPort::new(
        vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
        simulations(&base),
    );
    assert_eq!(
        evaluate_gate(&base, &verified, &missing_external, &simulations)
            .expect("deny")
            .decision,
        GateDecisionKindV1::Deny
    );

    let mut stale_values = observations(&base);
    stale_values.iter_mut().for_each(|value| value.observed_at_ms = 0);
    let stale = StaticObservationPort::new(
        vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
        stale_values,
    );
    assert_eq!(
        evaluate_gate(&base, &verified, &stale, &simulations)
            .expect("deny")
            .decision,
        GateDecisionKindV1::Deny
    );

    let mut disagree_values = observations(&base);
    disagree_values[1].block_number = 99;
    let disagree = StaticObservationPort::new(
        vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
        disagree_values,
    );
    assert_eq!(
        evaluate_gate(&base, &verified, &disagree, &simulations)
            .expect("deny")
            .decision,
        GateDecisionKindV1::Deny
    );

    let mut bytes_changed = base.clone();
    bytes_changed.finalized_bytes_base64 = BASE64.encode(b"mutated");
    let good_observations = StaticObservationPort::new(
        vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
        observations(&base),
    );
    assert_eq!(
        evaluate_gate(&bytes_changed, &verified, &good_observations, &simulations)
            .expect("deny")
            .decision,
        GateDecisionKindV1::Deny
    );

    for status in [SimulationStatusV1::Unavailable, SimulationStatusV1::Revert] {
        let mut values = simulations(&base);
        values
            .iter_mut()
            .for_each(|value| value.status = status.clone());
        let port = StaticSimulationPort::new(
            vec!["gate-provider-a".to_owned(), "gate-provider-b".to_owned()],
            values,
        );
        assert_eq!(
            evaluate_gate(&base, &verified, &good_observations, &port)
                .expect("deny")
                .decision,
            GateDecisionKindV1::Deny
        );
    }
}
