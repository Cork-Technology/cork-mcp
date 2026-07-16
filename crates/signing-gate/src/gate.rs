use crate::policy::{PolicyStatusV1, VerifiedPolicyGenerationV1};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use sha3::Keccak256;
use std::collections::BTreeSet;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateBuildV1 {
    pub package_version: String,
    pub source_commit: String,
    pub build_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateRequestV1 {
    pub gate_build: GateBuildV1,
    pub policy_generation: u64,
    pub policy_digest: String,
    pub account_component_id: String,
    pub deployment_id: String,
    pub intent_digest: String,
    pub execution_digest: String,
    pub payload_digest: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_simulation_digest: Option<String>,
    pub manifest_generation: u64,
    pub manifest_digest: String,
    pub runtime_evidence_digest: String,
    pub proxy_evidence_digest: String,
    pub finalized_bytes_base64: String,
    pub core_provider_ids: Vec<String>,
    pub decision_time_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawGateObservationV1 {
    pub provider_id: String,
    pub administration_id: String,
    pub block_number: u64,
    pub block_hash: String,
    pub parent_hash: String,
    pub head_number: u64,
    pub observed_at_ms: u64,
    pub manifest_generation: u64,
    pub manifest_digest: String,
    pub deployment_id: String,
    pub runtime_evidence_digest: String,
    pub proxy_evidence_digest: String,
    pub execution_digest: String,
    pub payload_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SimulationStatusV1 {
    Success,
    Revert,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RawGateSimulationV1 {
    pub provider_id: String,
    pub administration_id: String,
    pub block_number: u64,
    pub block_hash: String,
    pub execution_digest: String,
    pub payload_digest: String,
    pub status: SimulationStatusV1,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

pub trait IndependentObservationPort {
    fn configured_provider_ids(&self) -> &[String];
    fn read_raw_observations(
        &self,
        request: &GateRequestV1,
    ) -> Result<Vec<RawGateObservationV1>, GatePortErrorV1>;
}

pub trait IndependentSimulationPort {
    fn configured_provider_ids(&self) -> &[String];
    fn simulate_exact_bytes(
        &self,
        request: &GateRequestV1,
        finalized_bytes: &[u8],
        canonical_block_number: u64,
        canonical_block_hash: &str,
    ) -> Result<Vec<RawGateSimulationV1>, GatePortErrorV1>;
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GatePortErrorV1 {
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateCheckV1 {
    pub check: String,
    pub status: String,
    pub detail: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateFreshnessV1 {
    pub canonical_block_number: u64,
    pub canonical_block_hash: String,
    pub parent_hash: String,
    pub observed_at_ms: u64,
    pub head_number: u64,
    pub age_ms: u64,
    pub head_lag: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateSimulationEvidenceV1 {
    pub status: SimulationStatusV1,
    pub provider_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_number: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_digests: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GateDecisionKindV1 {
    Allow,
    Deny,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateDecisionV1 {
    pub gate_build: GateBuildV1,
    pub policy_generation: u64,
    pub policy_digest: String,
    pub intent_digest: String,
    pub execution_digest: String,
    pub payload_digest: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub core_simulation_digest: Option<String>,
    pub gate_simulation: GateSimulationEvidenceV1,
    pub manifest_generation: u64,
    pub manifest_digest: String,
    pub runtime_evidence_digest: String,
    pub proxy_evidence_digest: String,
    pub checks: Vec<GateCheckV1>,
    pub decision: GateDecisionKindV1,
    pub decided_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub freshness: Option<GateFreshnessV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation: Option<String>,
    pub decision_digest: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateValidationErrorV1 {
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GateEvaluationBundleV1 {
    pub configured_observation_provider_ids: Vec<String>,
    pub observations: Vec<RawGateObservationV1>,
    pub configured_simulation_provider_ids: Vec<String>,
    pub simulations: Vec<RawGateSimulationV1>,
}

pub struct StaticObservationPort {
    configured: Vec<String>,
    observations: Vec<RawGateObservationV1>,
}

impl StaticObservationPort {
    pub fn new(configured: Vec<String>, observations: Vec<RawGateObservationV1>) -> Self {
        Self {
            configured,
            observations,
        }
    }
}

impl IndependentObservationPort for StaticObservationPort {
    fn configured_provider_ids(&self) -> &[String] {
        &self.configured
    }

    fn read_raw_observations(
        &self,
        _request: &GateRequestV1,
    ) -> Result<Vec<RawGateObservationV1>, GatePortErrorV1> {
        Ok(self.observations.clone())
    }
}

pub struct StaticSimulationPort {
    configured: Vec<String>,
    simulations: Vec<RawGateSimulationV1>,
}

impl StaticSimulationPort {
    pub fn new(configured: Vec<String>, simulations: Vec<RawGateSimulationV1>) -> Self {
        Self {
            configured,
            simulations,
        }
    }
}

impl IndependentSimulationPort for StaticSimulationPort {
    fn configured_provider_ids(&self) -> &[String] {
        &self.configured
    }

    fn simulate_exact_bytes(
        &self,
        _request: &GateRequestV1,
        _finalized_bytes: &[u8],
        _canonical_block_number: u64,
        _canonical_block_hash: &str,
    ) -> Result<Vec<RawGateSimulationV1>, GatePortErrorV1> {
        Ok(self.simulations.clone())
    }
}

fn validation_error(code: &str, message: &str) -> GateValidationErrorV1 {
    GateValidationErrorV1 {
        code: code.to_owned(),
        message: message.to_owned(),
    }
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

fn keccak256_prefixed(bytes: &[u8]) -> String {
    format!("keccak256:{}", hex::encode(Keccak256::digest(bytes)))
}

fn decision_digest(
    decision: &GateDecisionV1,
) -> Result<String, GateValidationErrorV1> {
    let mut value = serde_json::to_value(decision)
        .map_err(|_| validation_error("GATE_SERIALIZATION_FAILED", "gate decision could not be serialized"))?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| validation_error("GATE_SERIALIZATION_FAILED", "gate decision must serialize as an object"))?;
    object.remove("decisionDigest");
    let bytes = serde_jcs::to_vec(&value)
        .map_err(|_| validation_error("GATE_CANONICALIZATION_FAILED", "gate decision could not be canonicalized"))?;
    Ok(sha256_prefixed(&bytes))
}

fn check(name: &str, passed: bool, detail: &str) -> GateCheckV1 {
    GateCheckV1 {
        check: name.to_owned(),
        status: if passed { "passed" } else { "failed" }.to_owned(),
        detail: detail.to_owned(),
    }
}

fn unavailable_simulation(reason: &str) -> GateSimulationEvidenceV1 {
    GateSimulationEvidenceV1 {
        status: SimulationStatusV1::Unavailable,
        provider_ids: Vec::new(),
        block_number: None,
        block_hash: None,
        trace_digests: None,
        reason: Some(reason.to_owned()),
    }
}

struct DecisionBindings<'a> {
    request: &'a GateRequestV1,
    checks: Vec<GateCheckV1>,
}

impl DecisionBindings<'_> {
    fn deny(
        self,
        gate_simulation: GateSimulationEvidenceV1,
        reason: &str,
        remediation: &str,
    ) -> Result<GateDecisionV1, GateValidationErrorV1> {
        let mut decision = GateDecisionV1 {
            gate_build: self.request.gate_build.clone(),
            policy_generation: self.request.policy_generation,
            policy_digest: self.request.policy_digest.clone(),
            intent_digest: self.request.intent_digest.clone(),
            execution_digest: self.request.execution_digest.clone(),
            payload_digest: self.request.payload_digest.clone(),
            core_simulation_digest: self.request.core_simulation_digest.clone(),
            gate_simulation,
            manifest_generation: self.request.manifest_generation,
            manifest_digest: self.request.manifest_digest.clone(),
            runtime_evidence_digest: self.request.runtime_evidence_digest.clone(),
            proxy_evidence_digest: self.request.proxy_evidence_digest.clone(),
            checks: self.checks,
            decision: GateDecisionKindV1::Deny,
            decided_at: self.request.decision_time_ms,
            freshness: None,
            reason: Some(reason.to_owned()),
            remediation: Some(remediation.to_owned()),
            decision_digest: String::new(),
        };
        decision.decision_digest = decision_digest(&decision)?;
        Ok(decision)
    }
}

fn provider_set_is_independent(
    configured: &[String],
    core_provider_ids: &[String],
    observed_provider_ids: &[String],
) -> bool {
    let configured: BTreeSet<_> = configured.iter().collect();
    let observed: BTreeSet<_> = observed_provider_ids.iter().collect();
    observed.len() == observed_provider_ids.len()
        && observed.len() >= 2
        && observed.iter().all(|provider| configured.contains(*provider))
        && observed
            .iter()
            .any(|provider| !core_provider_ids.contains(provider))
}

pub fn evaluate_gate(
    request: &GateRequestV1,
    policy: &VerifiedPolicyGenerationV1,
    observations: &dyn IndependentObservationPort,
    simulations: &dyn IndependentSimulationPort,
) -> Result<GateDecisionV1, GateValidationErrorV1> {
    let mut bindings = DecisionBindings {
        request,
        checks: Vec::new(),
    };
    let policy_active = policy.status == PolicyStatusV1::Active;
    bindings
        .checks
        .push(check("policy-active", policy_active, "policy must be active"));
    if !policy_active {
        return bindings.deny(
            unavailable_simulation("policy is not active"),
            "POLICY_NOT_ACTIVE",
            "Use a verified active higher policy generation.",
        );
    }
    let policy_identity = request.policy_generation == policy.generation
        && request.policy_digest == policy.policy_digest
        && request.gate_build.build_digest == policy.allowed_gate_build_digest
        && policy.allowed_deployment_ids.contains(&request.deployment_id)
        && policy
            .approved_account_components
            .contains(&request.account_component_id);
    bindings.checks.push(check(
        "policy-identity",
        policy_identity,
        "policy, build, deployment, and refusing account component must match",
    ));
    if !policy_identity {
        return bindings.deny(
            unavailable_simulation("policy identity mismatch"),
            "POLICY_IDENTITY_MISMATCH",
            "Present the exact policy-bound build, deployment, and account component.",
        );
    }
    let finalized_bytes = BASE64.decode(&request.finalized_bytes_base64).map_err(|_| {
        validation_error(
            "FINALIZED_BYTES_INVALID",
            "finalized bytes must be padded standard base64",
        )
    })?;
    let payload_matches = sha256_prefixed(&finalized_bytes) == request.payload_digest;
    bindings.checks.push(check(
        "payload-digest",
        payload_matches,
        "SHA-256 payload digest must match exact finalized bytes",
    ));
    if !payload_matches {
        return bindings.deny(
            unavailable_simulation("payload digest mismatch"),
            "FINALIZED_BYTES_CHANGED",
            "Re-present the unchanged finalized bytes.",
        );
    }
    let execution_matches = keccak256_prefixed(&finalized_bytes) == request.execution_digest;
    bindings.checks.push(check(
        "execution-digest",
        execution_matches,
        "Keccak execution digest must match exact finalized bytes",
    ));
    if !execution_matches {
        return bindings.deny(
            unavailable_simulation("execution digest mismatch"),
            "FINALIZED_BYTES_CHANGED",
            "Re-present the unchanged finalized execution bytes.",
        );
    }
    let raw_observations = match observations.read_raw_observations(request) {
        Ok(value) => value,
        Err(error) => {
            return bindings.deny(
                unavailable_simulation(&error.code),
                "GATE_OBSERVATION_UNAVAILABLE",
                "Restore the independently controlled gate observation providers.",
            )
        }
    };
    let provider_ids: Vec<_> = raw_observations
        .iter()
        .map(|observation| observation.provider_id.clone())
        .collect();
    let independent = provider_set_is_independent(
        observations.configured_provider_ids(),
        &request.core_provider_ids,
        &provider_ids,
    );
    bindings.checks.push(check(
        "independent-provider-set",
        independent,
        "gate providers must be controlled by the gate and include an endpoint outside core configuration",
    ));
    if !independent {
        return bindings.deny(
            unavailable_simulation("independent endpoint is missing"),
            "GATE_PROVIDER_SET_NOT_INDEPENDENT",
            "Configure at least two gate providers with one endpoint outside the core set.",
        );
    }
    let first = raw_observations.first().ok_or_else(|| {
        validation_error(
            "GATE_OBSERVATION_EMPTY",
            "independent observation set is empty",
        )
    })?;
    let distinct_administrations: BTreeSet<_> = raw_observations
        .iter()
        .map(|observation| observation.administration_id.as_str())
        .collect();
    let agreement = distinct_administrations.len() >= 2
        && raw_observations.iter().all(|observation| {
            observation.block_number == first.block_number
                && observation.block_hash == first.block_hash
                && observation.parent_hash == first.parent_hash
                && observation.manifest_generation == request.manifest_generation
                && observation.manifest_digest == request.manifest_digest
                && observation.deployment_id == request.deployment_id
                && observation.runtime_evidence_digest == request.runtime_evidence_digest
                && observation.proxy_evidence_digest == request.proxy_evidence_digest
                && observation.execution_digest == request.execution_digest
                && observation.payload_digest == request.payload_digest
        });
    bindings.checks.push(check(
        "current-state-agreement",
        agreement,
        "independent administrations must agree on the exact block and all bindings",
    ));
    if !agreement {
        return bindings.deny(
            unavailable_simulation("current-state providers disagree"),
            "GATE_OBSERVATION_DISAGREEMENT",
            "Obtain a fresh identical independently administered observation set.",
        );
    }
    let age_ms = request
        .decision_time_ms
        .checked_sub(first.observed_at_ms)
        .unwrap_or(u64::MAX);
    let head_lag = first
        .head_number
        .checked_sub(first.block_number)
        .unwrap_or(u64::MAX);
    let freshness_ok = age_ms <= policy.maximum_observation_age_ms.min(60_000)
        && head_lag <= policy.maximum_head_lag.min(2);
    bindings.checks.push(check(
        "current-state-freshness",
        freshness_ok,
        "observation must satisfy the policy and RFC maximum age and head lag",
    ));
    if !freshness_ok {
        return bindings.deny(
            unavailable_simulation("current-state observation is stale"),
            "GATE_OBSERVATION_STALE",
            "Refresh the independent observations at a recent canonical block.",
        );
    }
    let raw_simulations = match simulations.simulate_exact_bytes(
        request,
        &finalized_bytes,
        first.block_number,
        &first.block_hash,
    ) {
        Ok(value) => value,
        Err(error) => {
            return bindings.deny(
                unavailable_simulation(&error.code),
                "GATE_SIMULATION_UNAVAILABLE",
                "Restore independent exact-byte simulation.",
            )
        }
    };
    let simulation_provider_ids: Vec<_> = raw_simulations
        .iter()
        .map(|simulation| simulation.provider_id.clone())
        .collect();
    let simulation_independent = provider_set_is_independent(
        simulations.configured_provider_ids(),
        &request.core_provider_ids,
        &simulation_provider_ids,
    );
    let simulation_administrations: BTreeSet<_> = raw_simulations
        .iter()
        .map(|simulation| simulation.administration_id.as_str())
        .collect();
    let simulation_success = policy.require_independent_simulation
        && simulation_independent
        && simulation_administrations.len() >= 2
        && !raw_simulations.is_empty()
        && raw_simulations.iter().all(|simulation| {
            simulation.status == SimulationStatusV1::Success
                && simulation.block_number == first.block_number
                && simulation.block_hash == first.block_hash
                && simulation.execution_digest == request.execution_digest
                && simulation.payload_digest == request.payload_digest
                && simulation.trace_digest.is_some()
        });
    bindings.checks.push(check(
        "exact-byte-simulation",
        simulation_success,
        "independent gate simulation must succeed for unchanged bytes at the canonical block",
    ));
    let gate_simulation = if simulation_success {
        GateSimulationEvidenceV1 {
            status: SimulationStatusV1::Success,
            provider_ids: simulation_provider_ids,
            block_number: Some(first.block_number),
            block_hash: Some(first.block_hash.clone()),
            trace_digests: Some(
                raw_simulations
                    .iter()
                    .filter_map(|simulation| simulation.trace_digest.clone())
                    .collect(),
            ),
            reason: None,
        }
    } else {
        let status = if raw_simulations
            .iter()
            .any(|simulation| simulation.status == SimulationStatusV1::Revert)
        {
            SimulationStatusV1::Revert
        } else {
            SimulationStatusV1::Unavailable
        };
        GateSimulationEvidenceV1 {
            status,
            provider_ids: simulation_provider_ids,
            block_number: Some(first.block_number),
            block_hash: Some(first.block_hash.clone()),
            trace_digests: None,
            reason: Some("simulation did not produce independent success".to_owned()),
        }
    };
    if !simulation_success {
        return bindings.deny(
            gate_simulation,
            "GATE_SIMULATION_FAILED",
            "Obtain successful independent exact-byte simulation at the canonical block.",
        );
    }
    let freshness = GateFreshnessV1 {
        canonical_block_number: first.block_number,
        canonical_block_hash: first.block_hash.clone(),
        parent_hash: first.parent_hash.clone(),
        observed_at_ms: first.observed_at_ms,
        head_number: first.head_number,
        age_ms,
        head_lag,
    };
    let mut decision = GateDecisionV1 {
        gate_build: request.gate_build.clone(),
        policy_generation: request.policy_generation,
        policy_digest: request.policy_digest.clone(),
        intent_digest: request.intent_digest.clone(),
        execution_digest: request.execution_digest.clone(),
        payload_digest: request.payload_digest.clone(),
        core_simulation_digest: request.core_simulation_digest.clone(),
        gate_simulation,
        manifest_generation: request.manifest_generation,
        manifest_digest: request.manifest_digest.clone(),
        runtime_evidence_digest: request.runtime_evidence_digest.clone(),
        proxy_evidence_digest: request.proxy_evidence_digest.clone(),
        checks: bindings.checks,
        decision: GateDecisionKindV1::Allow,
        decided_at: request.decision_time_ms,
        freshness: Some(freshness),
        reason: None,
        remediation: None,
        decision_digest: String::new(),
    };
    decision.decision_digest = decision_digest(&decision)?;
    Ok(decision)
}
