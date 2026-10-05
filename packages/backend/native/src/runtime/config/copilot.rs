use llm_adapter::capability::provider_default_capability_upper_bound;
use serde::Deserialize;
use serde_json::Map;

use super::{RuntimeError, RuntimeResult};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfig {
  pub(crate) enabled: bool,
  pub(crate) byok: CopilotByokRuntimeConfig,
  pub(crate) providers: CopilotProvidersRuntimeConfig,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotByokRuntimeConfig {
  pub(crate) enabled: bool,
  #[serde(default = "default_allowed_providers")]
  pub(crate) allowed_providers: Vec<String>,
  pub(crate) allow_custom_endpoint: bool,
  pub(crate) allow_private_endpoint: bool,
}

impl Default for CopilotByokRuntimeConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      allowed_providers: default_allowed_providers(),
      allow_custom_endpoint: false,
      allow_private_endpoint: false,
    }
  }
}

pub(in crate::runtime) const SUPPORTED_BYOK_PROVIDERS: [&str; 4] = ["openai", "anthropic", "gemini", "fal"];

pub(super) const MANAGED_PROFILE_REQUIREMENTS: [(&str, &[&str]); 7] = [
  ("openai", &["apiKey"]),
  ("anthropic", &["apiKey"]),
  ("gemini", &["apiKey"]),
  ("fal", &["apiKey"]),
  ("cloudflareWorkersAi", &["apiToken", "accountId"]),
  ("geminiVertex", &["project", "location"]),
  ("anthropicVertex", &["project", "location"]),
];

fn default_allowed_providers() -> Vec<String> {
  SUPPORTED_BYOK_PROVIDERS.into_iter().map(str::to_string).collect()
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotProvidersRuntimeConfig {
  pub(crate) profiles: Vec<CopilotManagedProfileConfig>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopilotManagedProfileConfig {
  pub(crate) id: String,
  #[serde(rename = "type")]
  pub(crate) provider: String,
  #[serde(default = "enabled_by_default")]
  pub(crate) enabled: bool,
  #[serde(default)]
  pub(crate) models: Vec<String>,
  pub(crate) config: serde_json::Value,
}

fn enabled_by_default() -> bool {
  true
}

/// Dafater: config keys of an OpenAI-compatible managed profile, i.e. an
/// `openai` profile with a custom `baseURL` (OpenRouter, Ollama, LM Studio,
/// vLLM, ...). The server administrator configures it from the app settings.
pub(crate) const OPENAI_COMPATIBLE_DIALECTS: [&str; 2] = ["responses", "chat_completions"];

impl CopilotManagedProfileConfig {
  fn config_text(&self, field: &str) -> Option<&str> {
    self
      .config
      .get(field)
      .and_then(serde_json::Value::as_str)
      .map(str::trim)
      .filter(|value| !value.is_empty())
  }

  /// An `openai` profile pointing at a custom `baseURL`.
  pub(crate) fn is_openai_compatible(&self) -> bool {
    self.provider == "openai" && self.config_text("baseURL").is_some()
  }

  fn config_flag(&self, field: &str) -> bool {
    self
      .config
      .get(field)
      .and_then(serde_json::Value::as_bool)
      .unwrap_or(false)
  }

  /// Whether the model behind an OpenAI-compatible profile accepts images.
  pub(crate) fn vision(&self) -> bool {
    self.config_flag("vision")
  }

  /// `config.dialect` for OpenAI profiles; defaults to Chat Completions for
  /// custom endpoints (the widest-supported OpenAI-compatible API) and to the
  /// Responses API for api.openai.com.
  pub(crate) fn openai_dialect(&self) -> Option<llm_adapter::target::OpenAiDialect> {
    use llm_adapter::target::OpenAiDialect;
    if self.provider != "openai" {
      return None;
    }
    Some(match self.config_text("dialect") {
      Some("responses") => OpenAiDialect::Responses,
      Some("chat_completions") => OpenAiDialect::ChatCompletions,
      _ if self.is_openai_compatible() => OpenAiDialect::ChatCompletions,
      _ => OpenAiDialect::Responses,
    })
  }

  /// `config.allowPrivateNetwork` lets the administrator point the profile at
  /// a provider on the local network (e.g. Ollama on localhost).
  pub(crate) fn egress_policy(&self) -> llm_adapter::target::EgressPolicy {
    if self.config_flag("allowPrivateNetwork") {
      llm_adapter::target::EgressPolicy::AllowPrivate
    } else {
      llm_adapter::target::EgressPolicy::PublicOnly
    }
  }

  /// The model sent upstream when this profile serves a built-in route:
  /// `config.modelMap[builtIn] ?? config.defaultModel ?? models[0]`.
  pub(crate) fn upstream_model(&self, built_in_model_id: Option<&str>) -> Option<&str> {
    built_in_model_id
      .and_then(|model_id| self.config.get("modelMap")?.get(model_id)?.as_str())
      .map(str::trim)
      .filter(|value| !value.is_empty())
      .or_else(|| self.config_text("defaultModel"))
      .or_else(|| {
        self
          .models
          .first()
          .map(|model| model.trim())
          .filter(|value| !value.is_empty())
      })
  }
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct CopilotRuntimeConfigFile {
  pub(in crate::runtime) enabled: bool,
  pub(in crate::runtime) byok: CopilotByokRuntimeConfig,
  pub(in crate::runtime) providers: CopilotProvidersRuntimeConfigFile,
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(in crate::runtime) struct CopilotProvidersRuntimeConfigFile {
  pub(in crate::runtime) profiles: Vec<CopilotManagedProfileConfigFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopilotManagedProfileConfigFile {
  id: String,
  #[serde(rename = "type")]
  provider: CopilotManagedProvider,
  display_name: Option<String>,
  priority: Option<f64>,
  #[serde(default = "enabled_by_default")]
  enabled: bool,
  models: Vec<String>,
  middleware: Option<CopilotProviderMiddlewareConfigFile>,
  config: CopilotManagedProviderSettingsFile,
}

#[derive(Clone, Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CopilotManagedProviderSettingsFile {
  #[serde(skip_serializing_if = "Option::is_none")]
  api_key: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  api_token: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  account_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  project: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  location: Option<String>,
  #[serde(rename = "baseURL", skip_serializing_if = "Option::is_none")]
  base_url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  google_auth_options: Option<CopilotGoogleAuthOptionsFile>,
  /// OpenAI API style used with a custom `baseURL`.
  #[serde(skip_serializing_if = "Option::is_none")]
  dialect: Option<CopilotOpenAiDialectFile>,
  /// Upstream model per built-in model id (OpenAI-compatible profiles).
  #[serde(skip_serializing_if = "Option::is_none")]
  model_map: Option<std::collections::BTreeMap<String, String>>,
  /// Upstream model used for every built-in route (OpenAI-compatible profiles).
  #[serde(skip_serializing_if = "Option::is_none")]
  default_model: Option<String>,
  /// Allow `baseURL` to resolve to a private/loopback address (Ollama, LM Studio).
  #[serde(skip_serializing_if = "Option::is_none")]
  allow_private_network: Option<bool>,
  /// The upstream model accepts image input.
  #[serde(skip_serializing_if = "Option::is_none")]
  vision: Option<bool>,
  #[serde(flatten)]
  additional: Map<String, serde_json::Value>,
}

#[derive(Clone, Copy, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotOpenAiDialectFile {
  Responses,
  ChatCompletions,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CopilotGoogleAuthOptionsFile {
  #[serde(skip_serializing_if = "Option::is_none")]
  credentials: Option<CopilotGoogleCredentialsFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotGoogleCredentialsFile {
  client_email: String,
  private_key: String,
  #[serde(flatten)]
  additional: Map<String, serde_json::Value>,
}

#[derive(Clone, Copy, Deserialize, serde::Serialize, schemars::JsonSchema)]
enum CopilotManagedProvider {
  #[serde(rename = "anthropic")]
  Anthropic,
  #[serde(rename = "anthropicVertex")]
  AnthropicVertex,
  #[serde(rename = "cloudflareWorkersAi")]
  CloudflareWorkersAi,
  #[serde(rename = "fal")]
  Fal,
  #[serde(rename = "gemini")]
  Gemini,
  #[serde(rename = "geminiVertex")]
  GeminiVertex,
  #[serde(rename = "openai")]
  OpenAi,
}

impl CopilotManagedProvider {
  fn as_str(self) -> &'static str {
    match self {
      Self::Anthropic => "anthropic",
      Self::AnthropicVertex => "anthropicVertex",
      Self::CloudflareWorkersAi => "cloudflareWorkersAi",
      Self::Fal => "fal",
      Self::Gemini => "gemini",
      Self::GeminiVertex => "geminiVertex",
      Self::OpenAi => "openai",
    }
  }
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotProviderMiddlewareConfigFile {
  rust: Option<CopilotRustMiddlewareConfigFile>,
  node: Option<CopilotNodeMiddlewareConfigFile>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotRustMiddlewareConfigFile {
  request: Option<Vec<CopilotRustRequestMiddleware>>,
  stream: Option<Vec<CopilotRustStreamMiddleware>>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
struct CopilotNodeMiddlewareConfigFile {
  text: Option<Vec<CopilotNodeTextMiddleware>>,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotRustRequestMiddleware {
  NormalizeMessages,
  ClampMaxTokens,
  ToolSchemaRewrite,
  OpenaiRequestCompat,
  OmitToolChoice,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotRustStreamMiddleware {
  StreamEventNormalize,
  CitationIndexing,
}

#[derive(Clone, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum CopilotNodeTextMiddleware {
  CitationFootnote,
  Callout,
  ThinkingFormat,
}

impl TryFrom<CopilotRuntimeConfigFile> for CopilotRuntimeConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotRuntimeConfigFile) -> Result<Self, Self::Error> {
    Ok(Self {
      enabled: value.enabled,
      byok: value.byok,
      providers: CopilotProvidersRuntimeConfig {
        profiles: value
          .providers
          .profiles
          .into_iter()
          .map(TryInto::try_into)
          .collect::<RuntimeResult<_>>()?,
      },
    })
  }
}

impl TryFrom<CopilotManagedProfileConfigFile> for CopilotManagedProfileConfig {
  type Error = RuntimeError;

  fn try_from(value: CopilotManagedProfileConfigFile) -> Result<Self, Self::Error> {
    if value.id.is_empty()
      || !value
        .id
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile id must contain only letters, numbers, hyphens, and underscores",
      ));
    }
    Ok(Self {
      id: value.id,
      provider: value.provider.as_str().to_string(),
      enabled: value.enabled,
      models: value.models,
      config: serde_json::to_value(value.config)
        .map_err(|error| RuntimeError::json("serialize managed copilot config failed", error))?,
    })
  }
}

pub(in crate::runtime) fn validate_copilot_config(config: &CopilotRuntimeConfig) -> RuntimeResult<()> {
  let mut allowed_providers = std::collections::HashSet::new();
  for provider in &config.byok.allowed_providers {
    if !SUPPORTED_BYOK_PROVIDERS.contains(&provider.as_str()) || !allowed_providers.insert(provider.as_str()) {
      return Err(RuntimeError::invalid_state(
        "copilot BYOK allowed providers must be supported and unique",
      ));
    }
  }
  let mut profile_ids = std::collections::HashSet::new();
  let mut managed_models = std::collections::HashMap::new();
  for profile in &config.providers.profiles {
    if profile.id.trim().is_empty() || !profile_ids.insert(profile.id.as_str()) {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile ids must be non-empty and unique",
      ));
    }
    if profile.provider.trim().is_empty() {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile provider is required",
      ));
    }
    if profile.models.is_empty() {
      return Err(RuntimeError::invalid_state(
        "managed copilot profile models must be non-empty",
      ));
    }
    validate_openai_compatible_config(profile)?;
    let openai_compatible = profile.is_openai_compatible();
    if profile.enabled {
      let required = MANAGED_PROFILE_REQUIREMENTS
        .iter()
        .find(|(provider, _)| *provider == profile.provider)
        .map(|(_, fields)| *fields)
        .ok_or_else(|| RuntimeError::invalid_state("unsupported managed copilot provider"))?;
      for field in required {
        // Dafater: local OpenAI-compatible servers (Ollama, LM Studio) need no key.
        if openai_compatible && *field == "apiKey" {
          continue;
        }
        if profile
          .config
          .get(*field)
          .and_then(serde_json::Value::as_str)
          .is_none_or(|value| value.trim().is_empty())
        {
          return Err(RuntimeError::invalid_state(format!(
            "managed copilot profile requires {field}"
          )));
        }
      }
      if let Some(base_url) = profile.config.get("baseURL").and_then(serde_json::Value::as_str) {
        llm_adapter::target::canonicalize_endpoint(base_url)
          .map_err(|error| RuntimeError::invalid_state(error.to_string()))?;
      }
      if let Some(credentials) = profile.config.pointer("/googleAuthOptions/credentials") {
        for field in ["client_email", "private_key"] {
          if credentials
            .get(field)
            .and_then(serde_json::Value::as_str)
            .is_none_or(|value| value.trim().is_empty())
          {
            return Err(RuntimeError::invalid_state(format!(
              "managed Vertex credentials require {field}"
            )));
          }
        }
      }
    }
    let mut models = std::collections::HashSet::new();
    for model in &profile.models {
      if model.trim().is_empty() || !models.insert(model.as_str()) {
        return Err(RuntimeError::invalid_state(
          "managed copilot profile models must be non-empty and unique",
        ));
      }
      // Dafater: OpenAI-compatible endpoints serve arbitrary model names, so
      // their capabilities are synthesized at route time instead.
      if !openai_compatible {
        provider_default_capability_upper_bound(&profile.provider, model)
          .ok_or_else(|| RuntimeError::invalid_state("managed copilot profile model is unsupported"))?;
      }
      if profile.enabled
        && let Some(existing_profile) = managed_models.insert(model.as_str(), profile.id.as_str())
      {
        return Err(RuntimeError::invalid_state(format!(
          "managed copilot model {model} is assigned to both {existing_profile} and {}",
          profile.id
        )));
      }
    }
  }
  Ok(())
}

/// Dafater: type checks for the OpenAI-compatible profile keys. The JSON
/// schema covers the file/admin path; this also covers config that reached the
/// runtime through other paths (e.g. `config.json`).
fn validate_openai_compatible_config(profile: &CopilotManagedProfileConfig) -> RuntimeResult<()> {
  let config = &profile.config;
  if let Some(dialect) = config.get("dialect")
    && !dialect
      .as_str()
      .is_some_and(|dialect| OPENAI_COMPATIBLE_DIALECTS.contains(&dialect))
  {
    return Err(RuntimeError::invalid_state(
      "managed copilot profile dialect must be \"responses\" or \"chat_completions\"",
    ));
  }
  if let Some(model_map) = config.get("modelMap")
    && !model_map.as_object().is_some_and(|model_map| {
      model_map
        .values()
        .all(|model| model.as_str().is_some_and(|model| !model.trim().is_empty()))
    })
  {
    return Err(RuntimeError::invalid_state(
      "managed copilot profile modelMap must map model ids to non-empty model names",
    ));
  }
  if let Some(default_model) = config.get("defaultModel")
    && !default_model.as_str().is_some_and(|model| !model.trim().is_empty())
  {
    return Err(RuntimeError::invalid_state(
      "managed copilot profile defaultModel must be a non-empty string",
    ));
  }
  for field in ["allowPrivateNetwork", "vision"] {
    if config.get(field).is_some_and(|value| !value.is_boolean()) {
      return Err(RuntimeError::invalid_state(format!(
        "managed copilot profile {field} must be a boolean"
      )));
    }
  }
  Ok(())
}
