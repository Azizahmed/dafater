use llm_adapter::{
  capability::{
    AttachmentKind, AttachmentSource, DeclaredModelCapability, ModelFeature, ModelInput, ModelOutput,
    provider_default_capability_upper_bound,
  },
  target::BackendEndpoint,
};
use sqlx::{FromRow, PgPool, Row};

use super::super::{LocalLeasePayload, RuntimeError, RuntimeResult, token_hash};
use crate::{
  llm::{
    CopilotAccessProjection,
    byok::{ByokEndpoint, ByokModelDeclaration, ByokPolicy, ByokProfileDefinition, local_aad, server_aad},
    route::{self, AuthorizedProviderProfile, CatalogSlot, CredentialRef, ProfileSource, RouteOperation},
  },
  runtime::{BackendRuntimeConfig, CopilotManagedProfileConfig, CopilotRuntimeConfig, Deployment},
};

#[derive(FromRow)]
struct ServerProfileRow {
  id: String,
  workspace_id: String,
  provider: String,
  encrypted_api_key: String,
  definition: serde_json::Value,
  sort_order: i32,
}

pub(super) struct ProfileLoadInput<'a> {
  pub(super) slot: &'a CatalogSlot,
  pub(super) built_in_route_id: Option<&'a str>,
  pub(super) workspace_id: Option<&'a str>,
  pub(super) user_id: Option<&'a str>,
  pub(super) local_lease_id: Option<&'a str>,
  pub(super) access: &'a CopilotAccessProjection,
  pub(super) managed_target_id: Option<&'a str>,
}

pub(super) async fn load_profiles(
  pool: &PgPool,
  config: &BackendRuntimeConfig,
  input: ProfileLoadInput<'_>,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let mut profiles = Vec::new();
  let policy = config.byok_policy();
  if let Some(workspace_id) = input.workspace_id
    && input.access.server_byok
  {
    profiles.extend(load_server_profiles(pool, workspace_id, &policy).await?);
  }
  if let (Some(workspace_id), Some(user_id), Some(lease_id)) = (input.workspace_id, input.user_id, input.local_lease_id)
    && input.access.local_byok
  {
    profiles.extend(load_local_profiles(pool, workspace_id, user_id, lease_id, &policy).await?);
  }
  profiles.extend(load_managed_profiles(
    &config.copilot,
    config.deployment,
    input.slot,
    input.built_in_route_id,
    input.access.managed_tier,
    input.managed_target_id,
  )?);
  Ok(profiles)
}

async fn load_server_profiles(
  pool: &PgPool,
  workspace_id: &str,
  policy: &ByokPolicy,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let rows = sqlx::query_as::<_, ServerProfileRow>(
    r#"
    SELECT id, workspace_id, provider, encrypted_api_key, definition, sort_order
    FROM ai_workspace_byok_configs
    WHERE workspace_id = $1 AND enabled = TRUE
    ORDER BY sort_order ASC, created_at ASC
    "#,
  )
  .bind(workspace_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load authorized BYOK profiles failed", error))?;
  rows
    .into_iter()
    .map(|row| {
      let definition = serde_json::from_value::<ByokProfileDefinition>(row.definition)
        .map_err(|error| RuntimeError::json("invalid stored BYOK definition", error))?;
      if !policy.allows(&row.provider, &definition.endpoint) {
        return Ok(None);
      }
      let aad = server_aad(
        &row.workspace_id,
        &row.id,
        &row.provider,
        definition.endpoint_identity(),
      );
      Ok(Some(authorized_byok_profile(
        row.id,
        ProfileSource::Server,
        row.provider,
        definition,
        policy,
        row.sort_order,
        CredentialRef::Envelope {
          encrypted: row.encrypted_api_key,
          aad,
        },
      )))
    })
    .collect::<RuntimeResult<Vec<_>>>()
    .map(|profiles| profiles.into_iter().flatten().collect())
}

async fn load_local_profiles(
  pool: &PgPool,
  workspace_id: &str,
  user_id: &str,
  lease_id: &str,
  policy: &ByokPolicy,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let payload = sqlx::query(
    r#"
    SELECT payload
    FROM runtime_states
    WHERE purpose = 'copilot_byok_local_lease' AND token_hash = $1
      AND consumed_at IS NULL AND expires_at > clock_timestamp()
    "#,
  )
  .bind(token_hash(lease_id))
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load BYOK local lease failed", error))?
  .map(|row| row.get::<serde_json::Value, _>("payload"));
  let Some(payload) = payload else {
    return Ok(Vec::new());
  };
  let payload: LocalLeasePayload =
    serde_json::from_value(payload).map_err(|error| RuntimeError::json("invalid BYOK local lease", error))?;
  if payload.workspace_id != workspace_id || payload.user_id != user_id {
    return Ok(Vec::new());
  }
  Ok(
    payload
      .providers
      .into_iter()
      .enumerate()
      .filter(|(_, provider)| provider.enabled && policy.allows(&provider.provider, &provider.definition.endpoint))
      .map(|(index, provider)| {
        let aad = local_aad(
          workspace_id,
          user_id,
          lease_id,
          index,
          &provider.provider,
          provider.definition.endpoint_identity(),
        );
        authorized_byok_profile(
          format!("{lease_id}:{index}"),
          ProfileSource::Local,
          provider.provider,
          provider.definition,
          policy,
          index as i32,
          CredentialRef::Envelope {
            encrypted: provider.encrypted_credential,
            aad,
          },
        )
      })
      .collect(),
  )
}

fn load_managed_profiles(
  config: &CopilotRuntimeConfig,
  deployment: Deployment,
  slot: &CatalogSlot,
  built_in_route_id: Option<&str>,
  managed_tier: route::CopilotManagedTier,
  managed_target_id: Option<&str>,
) -> RuntimeResult<Vec<AuthorizedProviderProfile>> {
  let targets = match managed_target_id {
    Some(target_id) => match route::managed_selected_target(built_in_route_id, target_id, managed_tier) {
      Some(model_id) => Some(vec![model_id]),
      // Dafater: a self-hosted server serves its administrator-configured
      // model; an unknown built-in model choice falls back to the defaults.
      None if deployment == Deployment::SelfHosted => route::managed_targets(slot, built_in_route_id, managed_tier),
      None => return Err(RuntimeError::invalid_input("managed_target_unavailable")),
    },
    None => route::managed_targets(slot, built_in_route_id, managed_tier),
  };
  let mut profiles = Vec::new();
  for (index, model_id) in targets.iter().flatten().enumerate() {
    let matches = config
      .providers
      .profiles
      .iter()
      .filter(|profile| profile.enabled && profile.models.iter().any(|model| model == model_id))
      .collect::<Vec<_>>();
    let Some(profile) = matches.first() else {
      continue;
    };
    if matches.len() > 1 {
      return Err(RuntimeError::invalid_state(
        "built-in managed route model matches multiple profiles",
      ));
    }
    let capabilities = provider_default_capability_upper_bound(&profile.provider, model_id)
      .ok_or_else(|| RuntimeError::invalid_state("built-in managed route model is incompatible with its profile"))?;
    profiles.push(managed_authorized_profile(
      profile,
      model_id.clone(),
      capabilities,
      index as i32,
    )?);
  }
  // Dafater: no profile serves the built-in model (or the route has no
  // built-in model) → use the administrator's OpenAI-compatible profile for
  // text/structured generation. It never claims embedding, rerank, image or
  // audio slots; those degrade as "no compatible target".
  if profiles.is_empty()
    && matches!(slot.operation, RouteOperation::Chat | RouteOperation::Structured)
    && let Some(profile) = openai_compatible_profile(config)
  {
    let built_in_model_id = targets.as_ref().and_then(|targets| targets.first()).map(String::as_str);
    if let Some(model_id) = profile.upstream_model(built_in_model_id) {
      profiles.push(managed_authorized_profile(
        profile,
        model_id.to_string(),
        openai_compatible_capabilities(profile.vision()),
        0,
      )?);
    }
  }
  Ok(profiles)
}

fn managed_authorized_profile(
  profile: &CopilotManagedProfileConfig,
  model_id: String,
  capabilities: Vec<DeclaredModelCapability>,
  sort_order: i32,
) -> RuntimeResult<AuthorizedProviderProfile> {
  Ok(AuthorizedProviderProfile {
    profile_id: profile.id.clone(),
    source: ProfileSource::Managed,
    provider: profile.provider.clone(),
    endpoint: managed_endpoint(profile)?,
    openai_dialect: profile.openai_dialect(),
    egress_policy: profile.egress_policy(),
    models: vec![ByokModelDeclaration {
      model_id,
      enabled: true,
      capabilities,
    }],
    sort_order,
    credential_ref: CredentialRef::Managed {
      profile_id: profile.id.clone(),
    },
  })
}

/// The first enabled `openai` profile with a custom `baseURL`.
fn openai_compatible_profile(config: &CopilotRuntimeConfig) -> Option<&CopilotManagedProfileConfig> {
  config
    .providers
    .profiles
    .iter()
    .find(|profile| profile.enabled && profile.is_openai_compatible())
}

/// Capabilities assumed for an arbitrary model behind an OpenAI-compatible
/// endpoint: text (plus images when `config.vision`) in; text, JSON object and
/// structured output out; tool calling. Never embeddings, rerank, images or
/// audio.
fn openai_compatible_capabilities(vision: bool) -> Vec<DeclaredModelCapability> {
  let (input, attachment_kinds, attachment_sources) = if vision {
    (
      vec![ModelInput::Text, ModelInput::Image],
      vec![AttachmentKind::Image],
      vec![AttachmentSource::Url, AttachmentSource::Data, AttachmentSource::Bytes],
    )
  } else {
    (vec![ModelInput::Text], Vec::new(), Vec::new())
  };
  vec![DeclaredModelCapability {
    input,
    output: vec![ModelOutput::Text, ModelOutput::Object, ModelOutput::Structured],
    features: vec![ModelFeature::ToolCalling],
    attachment_kinds,
    attachment_sources,
  }]
}

fn managed_endpoint(profile: &CopilotManagedProfileConfig) -> RuntimeResult<BackendEndpoint> {
  if let Some(base_url) = profile.config.get("baseURL").and_then(serde_json::Value::as_str) {
    return llm_adapter::target::canonicalize_endpoint(base_url)
      .map(BackendEndpoint::Custom)
      .map_err(|error| RuntimeError::invalid_state(error.to_string()));
  }
  let endpoint = match profile.provider.as_str() {
    "geminiVertex" | "anthropicVertex" => {
      let location = required_config_text(profile, "location")?;
      let project = required_config_text(profile, "project")?;
      let publisher = if profile.provider == "geminiVertex" {
        "google"
      } else {
        "anthropic"
      };
      let host = if location == "global" {
        "aiplatform.googleapis.com".to_string()
      } else {
        format!("{location}-aiplatform.googleapis.com")
      };
      format!("https://{host}/v1/projects/{project}/locations/{location}/publishers/{publisher}")
    }
    "cloudflareWorkersAi" => format!(
      "https://api.cloudflare.com/client/v4/accounts/{}/ai",
      required_config_text(profile, "accountId")?
    ),
    _ => return Ok(BackendEndpoint::ProviderDefault),
  };
  Ok(BackendEndpoint::Custom(endpoint))
}

fn authorized_byok_profile(
  profile_id: String,
  source: ProfileSource,
  provider: String,
  definition: ByokProfileDefinition,
  policy: &ByokPolicy,
  sort_order: i32,
  credential_ref: CredentialRef,
) -> AuthorizedProviderProfile {
  let egress_policy = policy.egress_policy(&definition.endpoint);
  let (endpoint, openai_dialect) = match definition.endpoint {
    ByokEndpoint::ProviderDefault => (BackendEndpoint::ProviderDefault, None),
    ByokEndpoint::OpenAiCompatible { url, dialect } => (BackendEndpoint::Custom(url), Some(dialect)),
  };
  AuthorizedProviderProfile {
    profile_id,
    source,
    provider,
    endpoint,
    openai_dialect,
    egress_policy,
    models: definition.models,
    sort_order,
    credential_ref,
  }
}

pub(super) fn managed_profile<'a>(
  config: &'a CopilotRuntimeConfig,
  profile_id: &str,
) -> RuntimeResult<&'a CopilotManagedProfileConfig> {
  config
    .providers
    .profiles
    .iter()
    .find(|profile| profile.id == profile_id && profile.enabled)
    .ok_or_else(|| RuntimeError::invalid_state("managed copilot credential unavailable"))
}

pub(super) fn required_config_text<'a>(
  profile: &'a CopilotManagedProfileConfig,
  field: &'static str,
) -> RuntimeResult<&'a str> {
  profile
    .config
    .get(field)
    .and_then(serde_json::Value::as_str)
    .filter(|value| !value.trim().is_empty())
    .ok_or_else(|| RuntimeError::invalid_state(format!("managed copilot profile requires {field}")))
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use llm_adapter::{
    capability::{ModelFeature, ModelInput, ModelOutput},
    target::{EgressPolicy, OpenAiDialect},
  };

  use super::{
    BackendEndpoint, CopilotManagedProfileConfig, CopilotRuntimeConfig, Deployment, load_managed_profiles,
    managed_endpoint,
  };
  use crate::llm::route::{self, CopilotManagedTier, RouteDecision, RoutePolicyInput};

  fn openai_compatible_config(profile_config: serde_json::Value) -> CopilotRuntimeConfig {
    let mut config = CopilotRuntimeConfig::default();
    config.enabled = true;
    config.byok.enabled = false;
    config.providers.profiles = vec![CopilotManagedProfileConfig {
      id: "dafater-openai-compatible".to_string(),
      provider: "openai".to_string(),
      enabled: true,
      models: vec!["my-model".to_string()],
      config: profile_config,
    }];
    config
  }

  fn managed(
    config: &CopilotRuntimeConfig,
    slot: &str,
    built_in_route_id: Option<&str>,
    managed_target_id: Option<&str>,
  ) -> Vec<route::AuthorizedProviderProfile> {
    load_managed_profiles(
      config,
      Deployment::SelfHosted,
      &route::slot(slot).unwrap(),
      built_in_route_id,
      CopilotManagedTier::Standard,
      managed_target_id,
    )
    .unwrap()
  }

  #[test]
  fn openai_compatible_profile_serves_built_in_chat_routes() {
    let config = openai_compatible_config(json!({
      "apiKey": "sk-test",
      "baseURL": "http://localhost:11434/v1/",
      "defaultModel": "llama3.1",
      "allowPrivateNetwork": true
    }));
    let profiles = managed(&config, "prompt.text", Some("Chat With AFFiNE AI"), None);
    assert_eq!(profiles.len(), 1);
    let profile = &profiles[0];
    assert_eq!(profile.profile_id, "dafater-openai-compatible");
    assert_eq!(
      profile.endpoint,
      BackendEndpoint::Custom("http://localhost:11434/v1".to_string())
    );
    assert_eq!(profile.openai_dialect, Some(OpenAiDialect::ChatCompletions));
    assert_eq!(profile.egress_policy, EgressPolicy::AllowPrivate);
    assert_eq!(profile.models[0].model_id, "llama3.1");
    let capability = &profile.models[0].capabilities[0];
    assert_eq!(capability.input, [ModelInput::Text]);
    assert!(capability.output.contains(&ModelOutput::Structured));
    assert!(!capability.output.contains(&ModelOutput::Embedding));
    assert!(!capability.output.contains(&ModelOutput::Image));
    assert_eq!(capability.features, [ModelFeature::ToolCalling]);

    // custom prompts and routes without a built-in model use it as well
    let profiles = managed(&config, "chat.default", None, None);
    assert_eq!(profiles[0].models[0].model_id, "llama3.1");
    let profiles = managed(&config, "chat.structured", Some("workflow:presentation"), None);
    assert_eq!(profiles[0].models[0].model_id, "llama3.1");

    // an unknown built-in model choice is ignored on self-hosted servers
    let profiles = managed(&config, "prompt.text", Some("Chat With AFFiNE AI"), Some("missing"));
    assert_eq!(profiles[0].models[0].model_id, "llama3.1");

    // and the route policy accepts it with BYOK disabled
    let slot = route::with_request_requirements(route::slot("prompt.text").unwrap(), true, vec![], vec![]);
    let profiles = managed(&config, "prompt.text", Some("Chat With AFFiNE AI"), None);
    assert!(matches!(
      route::decide(RoutePolicyInput {
        slot: &slot,
        deployment: Deployment::SelfHosted,
        byok_enabled: false,
        access_available: true,
        profiles: &profiles,
        target_override: None,
        target_override_managed: false,
      }),
      RouteDecision::Ready(_)
    ));
  }

  #[test]
  fn openai_compatible_profile_aliases_built_in_models() {
    let config = openai_compatible_config(json!({
      "baseURL": "https://openrouter.ai/api/v1",
      "dialect": "responses",
      "modelMap": { "gpt-5.6-luna": "openai/gpt-4o-mini" },
      "vision": true
    }));
    let profiles = managed(&config, "prompt.text", Some("Chat With AFFiNE AI"), None);
    assert_eq!(profiles[0].models[0].model_id, "openai/gpt-4o-mini");
    assert_eq!(profiles[0].openai_dialect, Some(OpenAiDialect::Responses));
    assert_eq!(profiles[0].egress_policy, EgressPolicy::PublicOnly);
    assert!(profiles[0].models[0].capabilities[0].input.contains(&ModelInput::Image));

    // not in the map, no defaultModel → profile.models[0]
    let profiles = managed(&config, "chat.default", None, None);
    assert_eq!(profiles[0].models[0].model_id, "my-model");
  }

  #[test]
  fn openai_compatible_profile_never_claims_embedding_rerank_image_or_audio() {
    let config = openai_compatible_config(json!({
      "apiKey": "sk-test",
      "baseURL": "https://api.example.test/v1",
      "defaultModel": "custom"
    }));
    for slot in ["index.embedding", "search.rerank", "image.generate", "transcript.audio"] {
      assert!(managed(&config, slot, None, None).is_empty(), "{slot}");
    }
    assert!(
      managed(&config, "prompt.text", Some("Transcript audio structured"), None)
        .iter()
        .all(|profile| !profile.models[0].capabilities[0].input.contains(&ModelInput::Audio))
    );

    // a profile without baseURL is not treated as OpenAI-compatible
    let mut config = config;
    config.providers.profiles[0].config = json!({ "apiKey": "sk-test" });
    assert!(managed(&config, "chat.default", None, None).is_empty());
  }

  fn vertex_profile(location: &str) -> CopilotManagedProfileConfig {
    CopilotManagedProfileConfig {
      id: "vertex".to_string(),
      provider: "geminiVertex".to_string(),
      enabled: true,
      models: vec!["gemini-3.7-flash".to_string()],
      config: json!({ "project": "affine-us", "location": location }),
    }
  }

  #[test]
  fn managed_vertex_endpoint_uses_global_host() {
    assert_eq!(
      managed_endpoint(&vertex_profile("global")).unwrap(),
      BackendEndpoint::Custom(
        "https://aiplatform.googleapis.com/v1/projects/affine-us/locations/global/publishers/google".to_string()
      )
    );
  }

  #[test]
  fn managed_vertex_endpoint_uses_regional_host() {
    assert_eq!(
      managed_endpoint(&vertex_profile("us-central1")).unwrap(),
      BackendEndpoint::Custom(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/affine-us/locations/us-central1/publishers/google"
          .to_string()
      )
    );
  }
}
