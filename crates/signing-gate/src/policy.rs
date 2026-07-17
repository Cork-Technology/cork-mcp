use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const POLICY_REPOSITORY: &str = "Cork-Technology/cork-signing-gate";
pub const POLICY_SCHEMA_VERSION: &str = "cork.signing-policy-generation/v1";
pub const POLICY_TRUST_DOMAIN: &str = "security-engineering-signing-policy";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicyStatusV1 {
    Staged,
    Active,
    Retired,
    EmergencyDisabled,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyPayloadV1 {
    pub policy_id: String,
    pub generation: u64,
    pub allowed_gate_build_digest: String,
    pub allowed_deployment_ids: Vec<String>,
    pub approved_account_components: Vec<String>,
    pub require_independent_simulation: bool,
    pub maximum_observation_age_ms: u64,
    pub maximum_head_lag: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyTrustRootV1 {
    pub trust_domain: String,
    pub trust_root_id: String,
    pub owner: String,
    pub offline: bool,
    pub approved_key_ids: Vec<String>,
    pub threshold: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicySignatureV1 {
    pub key_id: String,
    pub algorithm: String,
    pub policy_digest: String,
    pub signature_base64: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewPromotionV1 {
    pub reviewed_by: Vec<String>,
    pub review_digest: String,
    pub promoted_by: String,
    pub promoted_at: u64,
    pub promotion_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublisherV1 {
    pub publisher_id: String,
    pub published_at: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryReleaseV1 {
    pub repository_commit: String,
    pub release_tag: String,
    pub release_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransparencyRecordV1 {
    pub log_id: String,
    pub entry_id: String,
    pub entry_digest: String,
    pub recorded_at: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicySuccessorV1 {
    pub policy_id: String,
    pub generation: u64,
    pub policy_digest: String,
    pub repository: String,
    pub immutable_path: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyTombstoneV1 {
    pub previous_status: PolicyStatusV1,
    pub new_status: PolicyStatusV1,
    pub policy_digest: String,
    pub key_id: String,
    pub algorithm: String,
    pub reason: String,
    pub issued_at: u64,
    pub signature_base64: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyGenerationV1 {
    pub schema_version: String,
    pub repository: String,
    pub immutable_path: String,
    pub policy_id: String,
    pub generation: u64,
    pub status: PolicyStatusV1,
    pub canonical_payload: PolicyPayloadV1,
    pub policy_digest: String,
    pub trust_root: PolicyTrustRootV1,
    pub signatures: Vec<PolicySignatureV1>,
    pub review_promotion: ReviewPromotionV1,
    pub publisher: PublisherV1,
    pub repository_release: RepositoryReleaseV1,
    pub transparency_record: TransparencyRecordV1,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub successor: Option<PolicySuccessorV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tombstone: Option<PolicyTombstoneV1>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerificationKeyV1 {
    pub key_id: String,
    pub public_key_base64: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyVerificationContextV1 {
    pub expected_trust_root_id: String,
    pub approved_security_keys: Vec<VerificationKeyV1>,
    pub deployment_signature_key_ids: Vec<String>,
    pub minimum_generation: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VerifiedPolicyGenerationV1 {
    pub schema_version: String,
    pub repository: String,
    pub immutable_path: String,
    pub policy_id: String,
    pub generation: u64,
    pub status: PolicyStatusV1,
    pub policy_digest: String,
    pub allowed_gate_build_digest: String,
    pub allowed_deployment_ids: Vec<String>,
    pub approved_account_components: Vec<String>,
    pub require_independent_simulation: bool,
    pub maximum_observation_age_ms: u64,
    pub maximum_head_lag: u64,
    pub trust_root_id: String,
    pub signature_key_ids: Vec<String>,
    pub transparency_entry_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyValidationErrorV1 {
    pub code: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PolicyDigestProjection<'a> {
    schema_version: &'a str,
    repository: &'a str,
    immutable_path: &'a str,
    policy_id: &'a str,
    generation: u64,
    status: &'a PolicyStatusV1,
    canonical_payload: &'a PolicyPayloadV1,
    trust_root: &'a PolicyTrustRootV1,
    review_promotion: &'a ReviewPromotionV1,
    publisher: &'a PublisherV1,
    repository_release: &'a RepositoryReleaseV1,
    transparency_record: &'a TransparencyRecordV1,
    successor: &'a Option<PolicySuccessorV1>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TombstoneDigestProjection<'a> {
    policy_id: &'a str,
    generation: u64,
    previous_status: &'a PolicyStatusV1,
    new_status: &'a PolicyStatusV1,
    policy_digest: &'a str,
    key_id: &'a str,
    algorithm: &'a str,
    reason: &'a str,
    issued_at: u64,
}

fn validation_error(code: &str, message: &str) -> PolicyValidationErrorV1 {
    PolicyValidationErrorV1 {
        code: code.to_owned(),
        message: message.to_owned(),
    }
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

fn canonical_digest<T: Serialize>(value: &T) -> Result<String, PolicyValidationErrorV1> {
    let bytes = serde_jcs::to_vec(value).map_err(|_| {
        validation_error(
            "POLICY_CANONICALIZATION_FAILED",
            "policy projection could not be canonicalized",
        )
    })?;
    Ok(sha256_prefixed(&bytes))
}

pub fn compute_policy_digest(
    policy: &PolicyGenerationV1,
) -> Result<String, PolicyValidationErrorV1> {
    let normalized_status = if policy.status == PolicyStatusV1::EmergencyDisabled {
        PolicyStatusV1::Active
    } else {
        policy.status.clone()
    };
    canonical_digest(&PolicyDigestProjection {
        schema_version: &policy.schema_version,
        repository: &policy.repository,
        immutable_path: &policy.immutable_path,
        policy_id: &policy.policy_id,
        generation: policy.generation,
        status: &normalized_status,
        canonical_payload: &policy.canonical_payload,
        trust_root: &policy.trust_root,
        review_promotion: &policy.review_promotion,
        publisher: &policy.publisher,
        repository_release: &policy.repository_release,
        transparency_record: &policy.transparency_record,
        successor: &policy.successor,
    })
}

fn decode_verifying_key(encoded: &str) -> Result<VerifyingKey, PolicyValidationErrorV1> {
    let bytes = BASE64.decode(encoded).map_err(|_| {
        validation_error("POLICY_KEY_INVALID", "verification key is not valid base64")
    })?;
    let array: [u8; 32] = bytes
        .try_into()
        .map_err(|_| validation_error("POLICY_KEY_INVALID", "verification key must be 32 bytes"))?;
    VerifyingKey::from_bytes(&array)
        .map_err(|_| validation_error("POLICY_KEY_INVALID", "verification key is invalid"))
}

fn verify_signature(
    key: &VerifyingKey,
    signature_base64: &str,
    message: &[u8],
) -> Result<(), PolicyValidationErrorV1> {
    let bytes = BASE64.decode(signature_base64).map_err(|_| {
        validation_error("POLICY_SIGNATURE_INVALID", "signature is not valid base64")
    })?;
    let signature = Signature::from_slice(&bytes)
        .map_err(|_| validation_error("POLICY_SIGNATURE_INVALID", "signature must be 64 bytes"))?;
    key.verify(message, &signature).map_err(|_| {
        validation_error(
            "POLICY_SIGNATURE_INVALID",
            "Ed25519 signature verification failed",
        )
    })
}

fn exact_policy_path(policy_id: &str, generation: u64) -> String {
    format!("policy-generations/{policy_id}/{generation}/")
}

fn validate_ordered_unique(values: &[String], code: &str) -> Result<(), PolicyValidationErrorV1> {
    if values.is_empty() || values.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(validation_error(
            code,
            "values must be unique and strictly ordered",
        ));
    }
    Ok(())
}

fn validate_tombstone(
    policy: &PolicyGenerationV1,
    context: &PolicyVerificationContextV1,
    keys: &BTreeMap<String, VerifyingKey>,
) -> Result<(), PolicyValidationErrorV1> {
    let tombstone = policy.tombstone.as_ref().ok_or_else(|| {
        validation_error(
            "POLICY_TOMBSTONE_REQUIRED",
            "emergency-disabled policy requires a tombstone",
        )
    })?;
    if tombstone.previous_status != PolicyStatusV1::Active
        || tombstone.new_status != PolicyStatusV1::EmergencyDisabled
        || tombstone.policy_digest != policy.policy_digest
        || tombstone.algorithm != "ed25519"
        || policy.successor.is_some()
    {
        return Err(validation_error(
            "POLICY_TOMBSTONE_INVALID",
            "one-key tombstone may only disable the unchanged active policy",
        ));
    }
    if context
        .deployment_signature_key_ids
        .contains(&tombstone.key_id)
    {
        return Err(validation_error(
            "POLICY_ROOT_KEY_REUSE",
            "deployment key cannot sign a Security Engineering tombstone",
        ));
    }
    let key = keys.get(&tombstone.key_id).ok_or_else(|| {
        validation_error(
            "POLICY_TOMBSTONE_KEY_UNAPPROVED",
            "tombstone key is not approved",
        )
    })?;
    let projection = TombstoneDigestProjection {
        policy_id: &policy.policy_id,
        generation: policy.generation,
        previous_status: &tombstone.previous_status,
        new_status: &tombstone.new_status,
        policy_digest: &tombstone.policy_digest,
        key_id: &tombstone.key_id,
        algorithm: &tombstone.algorithm,
        reason: &tombstone.reason,
        issued_at: tombstone.issued_at,
    };
    let digest = canonical_digest(&projection)?;
    verify_signature(key, &tombstone.signature_base64, digest.as_bytes())
}

pub fn verify_policy_generation(
    policy: &PolicyGenerationV1,
    context: &PolicyVerificationContextV1,
) -> Result<VerifiedPolicyGenerationV1, PolicyValidationErrorV1> {
    if policy.schema_version != POLICY_SCHEMA_VERSION {
        return Err(validation_error(
            "POLICY_SCHEMA_MISMATCH",
            "policy schema version is not supported",
        ));
    }
    if policy.repository != POLICY_REPOSITORY
        || policy.immutable_path != exact_policy_path(&policy.policy_id, policy.generation)
        || policy.immutable_path.contains("..")
        || policy.generation == 0
    {
        return Err(validation_error(
            "POLICY_ROOT_INVALID",
            "policy must use the exact immutable Security Engineering repository path",
        ));
    }
    if policy.canonical_payload.policy_id != policy.policy_id
        || policy.canonical_payload.generation != policy.generation
        || policy.generation < context.minimum_generation
    {
        return Err(validation_error(
            "POLICY_IDENTITY_INVALID",
            "policy identity or monotonic generation is invalid",
        ));
    }
    if policy.trust_root.trust_domain != POLICY_TRUST_DOMAIN
        || policy.trust_root.trust_root_id != context.expected_trust_root_id
        || policy.trust_root.owner != "Security Engineering"
        || !policy.trust_root.offline
        || policy.trust_root.threshold != 2
    {
        return Err(validation_error(
            "POLICY_TRUST_ROOT_INVALID",
            "policy trust root is not the approved offline Security Engineering root",
        ));
    }
    validate_ordered_unique(
        &policy.trust_root.approved_key_ids,
        "POLICY_KEYRING_ORDER_INVALID",
    )?;
    let deployment_keys: BTreeSet<_> = context
        .deployment_signature_key_ids
        .iter()
        .cloned()
        .collect();
    if policy
        .trust_root
        .approved_key_ids
        .iter()
        .any(|key_id| deployment_keys.contains(key_id))
    {
        return Err(validation_error(
            "POLICY_ROOT_KEY_REUSE",
            "Security Engineering and deployment keyrings must be disjoint",
        ));
    }
    let mut keys = BTreeMap::new();
    for key in &context.approved_security_keys {
        if deployment_keys.contains(&key.key_id) {
            return Err(validation_error(
                "POLICY_ROOT_KEY_REUSE",
                "a Security Engineering key is accepted by the deployment keyring",
            ));
        }
        if keys
            .insert(
                key.key_id.clone(),
                decode_verifying_key(&key.public_key_base64)?,
            )
            .is_some()
        {
            return Err(validation_error(
                "POLICY_KEYRING_DUPLICATE",
                "approved Security Engineering keys must be distinct",
            ));
        }
    }
    if keys.keys().cloned().collect::<Vec<_>>() != policy.trust_root.approved_key_ids {
        return Err(validation_error(
            "POLICY_KEYRING_MISMATCH",
            "policy keyring does not match the approved offline context",
        ));
    }
    if policy.publisher.published_at < policy.review_promotion.promoted_at
        || policy.transparency_record.recorded_at < policy.publisher.published_at
        || policy.repository_release.repository_commit.len() != 40
        || !policy
            .repository_release
            .repository_commit
            .chars()
            .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase())
    {
        return Err(validation_error(
            "POLICY_PUBLICATION_INVALID",
            "promotion, publication, release, and transparency ordering is invalid",
        ));
    }
    if let Some(successor) = &policy.successor {
        if successor.policy_id != policy.policy_id
            || successor.generation <= policy.generation
            || successor.repository != POLICY_REPOSITORY
            || successor.immutable_path
                != exact_policy_path(&successor.policy_id, successor.generation)
        {
            return Err(validation_error(
                "POLICY_SUCCESSOR_INVALID",
                "successor must be immutable and strictly monotonic",
            ));
        }
    }
    let digest = compute_policy_digest(policy)?;
    if digest != policy.policy_digest {
        return Err(validation_error(
            "POLICY_DIGEST_MISMATCH",
            "policy digest does not match the RFC 8785 projection",
        ));
    }
    let signature_key_ids: Vec<_> = policy
        .signatures
        .iter()
        .map(|signature| signature.key_id.clone())
        .collect();
    match policy.status {
        PolicyStatusV1::Active | PolicyStatusV1::Retired => {
            if policy.signatures.len() != 2 || policy.tombstone.is_some() {
                return Err(validation_error(
                    "POLICY_SIGNATURE_THRESHOLD",
                    "activation and retirement require exactly two signatures",
                ));
            }
        }
        PolicyStatusV1::EmergencyDisabled => {
            if policy.signatures.len() != 2 {
                return Err(validation_error(
                    "POLICY_SIGNATURE_THRESHOLD",
                    "emergency-disabled policy retains its two activation signatures",
                ));
            }
            validate_tombstone(policy, context, &keys)?;
        }
        PolicyStatusV1::Staged => {
            if !policy.signatures.is_empty() || policy.tombstone.is_some() {
                return Err(validation_error(
                    "POLICY_STAGED_SIGNATURE_FORBIDDEN",
                    "staged policy must not carry activation or tombstone signatures",
                ));
            }
        }
    }
    if !signature_key_ids.is_empty() {
        validate_ordered_unique(&signature_key_ids, "POLICY_SIGNATURE_ORDER_INVALID")?;
    }
    for signature in &policy.signatures {
        if signature.algorithm != "ed25519"
            || signature.policy_digest != policy.policy_digest
            || deployment_keys.contains(&signature.key_id)
        {
            return Err(validation_error(
                "POLICY_SIGNATURE_IDENTITY_INVALID",
                "signature algorithm, digest, or root identity is invalid",
            ));
        }
        let key = keys.get(&signature.key_id).ok_or_else(|| {
            validation_error(
                "POLICY_SIGNATURE_KEY_UNAPPROVED",
                "signature key is not approved",
            )
        })?;
        verify_signature(
            key,
            &signature.signature_base64,
            policy.policy_digest.as_bytes(),
        )?;
    }
    Ok(VerifiedPolicyGenerationV1 {
        schema_version: POLICY_SCHEMA_VERSION.to_owned(),
        repository: policy.repository.clone(),
        immutable_path: policy.immutable_path.clone(),
        policy_id: policy.policy_id.clone(),
        generation: policy.generation,
        status: policy.status.clone(),
        policy_digest: policy.policy_digest.clone(),
        allowed_gate_build_digest: policy.canonical_payload.allowed_gate_build_digest.clone(),
        allowed_deployment_ids: policy.canonical_payload.allowed_deployment_ids.clone(),
        approved_account_components: policy.canonical_payload.approved_account_components.clone(),
        require_independent_simulation: policy.canonical_payload.require_independent_simulation,
        maximum_observation_age_ms: policy.canonical_payload.maximum_observation_age_ms,
        maximum_head_lag: policy.canonical_payload.maximum_head_lag,
        trust_root_id: policy.trust_root.trust_root_id.clone(),
        signature_key_ids,
        transparency_entry_digest: policy.transparency_record.entry_digest.clone(),
    })
}
