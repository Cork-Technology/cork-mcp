pub mod gate;
pub mod policy;

use gate::{
    evaluate_gate, GateEvaluationBundleV1, GateRequestV1, StaticObservationPort,
    StaticSimulationPort,
};
use policy::{
    verify_policy_generation, PolicyGenerationV1, PolicyVerificationContextV1,
    VerifiedPolicyGenerationV1,
};
use serde::Serialize;

fn deterministic_json<T: Serialize>(value: &T) -> Result<String, String> {
    let bytes = serde_jcs::to_vec(value).map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

pub fn verify_policy_generation_json(
    policy_json: &str,
    context_json: &str,
) -> Result<String, String> {
    let policy: PolicyGenerationV1 =
        serde_json::from_str(policy_json).map_err(|error| error.to_string())?;
    let context: PolicyVerificationContextV1 =
        serde_json::from_str(context_json).map_err(|error| error.to_string())?;
    let verified = verify_policy_generation(&policy, &context)
        .map_err(|error| deterministic_json(&error).unwrap_or_else(|_| error.code.clone()))?;
    deterministic_json(&verified)
}

pub fn evaluate_gate_json(
    request_json: &str,
    verified_policy_json: &str,
    injected_evidence_json: &str,
) -> Result<String, String> {
    let request: GateRequestV1 =
        serde_json::from_str(request_json).map_err(|error| error.to_string())?;
    let policy: VerifiedPolicyGenerationV1 =
        serde_json::from_str(verified_policy_json).map_err(|error| error.to_string())?;
    let bundle: GateEvaluationBundleV1 =
        serde_json::from_str(injected_evidence_json).map_err(|error| error.to_string())?;
    let observations = StaticObservationPort::new(
        bundle.configured_observation_provider_ids,
        bundle.observations,
    );
    let simulations = StaticSimulationPort::new(
        bundle.configured_simulation_provider_ids,
        bundle.simulations,
    );
    let decision = evaluate_gate(&request, &policy, &observations, &simulations)
        .map_err(|error| deterministic_json(&error).unwrap_or_else(|_| error.code.clone()))?;
    deterministic_json(&decision)
}

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn verify_policy_generation_wasm(
    policy_json: &str,
    context_json: &str,
) -> Result<String, JsValue> {
    verify_policy_generation_json(policy_json, context_json)
        .map_err(|error| JsValue::from_str(&error))
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn evaluate_gate_wasm(
    request_json: &str,
    verified_policy_json: &str,
    injected_evidence_json: &str,
) -> Result<String, JsValue> {
    evaluate_gate_json(request_json, verified_policy_json, injected_evidence_json)
        .map_err(|error| JsValue::from_str(&error))
}
