const ENV_API_BASE =
  ((import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env?.VITE_API_BASE_URL as string | undefined)?.trim() || "";

const API_BASE_CANDIDATES = (
  ENV_API_BASE
    ? [ENV_API_BASE]
    : ["http://localhost:8000", "http://localhost:8001", "http://localhost:8002"]
).filter(Boolean);

let activeApiBase = API_BASE_CANDIDATES[0] || "http://localhost:8000";

export class ApiError extends Error {
  validationStatus?: "passed" | "warning" | "error";
  issues?: Array<Record<string, unknown>>;
}

let authSession: { userId: number; token: string } | null = null;

export function setAuthSession(
  session: { userId: number; token: string } | null,
) {
  authSession = session;
}

function getApiBasePriority(): string[] {
  const unique = new Set<string>([activeApiBase, ...API_BASE_CANDIDATES]);
  return Array.from(unique);
}

function backendUnavailableError() {
  return new Error(
    "Backend nicht erreichbar. Bitte API starten (Port 8000/8001/8002) oder VITE_API_BASE_URL setzen.",
  );
}

async function fetchWithFallback(path: string, init: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (const base of getApiBasePriority()) {
    try {
      const response = await fetch(`${base}${path}`, init);
      activeApiBase = base;
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`[API] Network error on ${base}${path}:`, error);
    }
  }
  console.error("[API] All base URL attempts failed:", lastError);
  throw backendUnavailableError();
}

export async function checkApiHealth(): Promise<boolean> {
  for (const base of getApiBasePriority()) {
    try {
      const res = await fetch(`${base}/health`, { method: "GET" });
      if (res.ok) {
        activeApiBase = base;
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}

function authHeaders(): Record<string, string> {
  if (!authSession) return {};
  return {
    "X-User-Id": String(authSession.userId),
    "X-Session-Token": authSession.token,
  };
}

async function putJson(path: string, body: unknown) {
  return requestJson("PUT", path, body);
}

async function postJson(path: string, body: unknown) {
  return requestJson("POST", path, body);
}

async function requestJson(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) {
  const res = await fetchWithFallback(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    // 204 No Content (z. B. Passkey entfernt) hat keinen Body
    payload = res.status === 204 ? null : await res.json();
  } catch (error) {
    console.error(`[API] JSON parsing error on ${method} ${path}:`, error);
    // Wenn JSON-Parsing fehlschlägt, aber Response OK ist, loggen aber nicht abbrechen
    if (!res.ok) {
      throw new Error(`Invalid JSON response from server: ${res.status}`);
    }
    payload = null;
  }

  if (!res.ok) {
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (detail && typeof detail === "object") {
        const apiError = new ApiError(
          String(
            (detail as { message?: string }).message || "Validation error",
          ),
        );
        const validationStatus = (
          detail as { validation_status?: "passed" | "warning" | "error" }
        ).validation_status;
        if (validationStatus) {
          apiError.validationStatus = validationStatus;
        }
        const issues = (detail as { issues?: Array<Record<string, unknown>> })
          .issues;
        if (Array.isArray(issues)) {
          apiError.issues = issues;
        }
        console.error(`[API] Error on ${method} ${path}:`, apiError);
        throw apiError;
      }
      console.error(`[API] Error detail on ${method} ${path}:`, detail);
      throw new Error(String(detail));
    }
    console.error(`[API] HTTP ${res.status} on ${method} ${path}`);
    throw new Error(`API error ${res.status}`);
  }

  console.debug(`[API] ${method} ${path} successful`);
  return payload;
}

async function uploadDocument(
  path: string,
  file: File,
  cardId: string,
  targetFieldId?: string,
  batchMappings?: Array<{ source_field_id: string; target_field_id: string }>,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("card_id", cardId);
  if (targetFieldId) {
    formData.append("target_field_id", targetFieldId);
  }
  if (batchMappings && batchMappings.length > 0) {
    formData.append("batch_mappings", JSON.stringify(batchMappings));
  }

  const res = await fetchWithFallback(path, {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
    body: formData,
  });

  // A proxy in front of the API (e.g. nginx 413/502/504) answers with an HTML page, not JSON
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 413) throw new Error("Datei zu gross für den Upload.");
    if (res.status === 502 || res.status === 504) {
      throw new Error("Der Server hat nicht rechtzeitig geantwortet. Bitte später nochmals versuchen.");
    }
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (detail && typeof detail === "object" && "message" in detail) {
        throw new Error(String((detail as { message: string }).message));
      }
      throw new Error(String(detail));
    }
    throw new Error(`API error ${res.status}`);
  }
  if (payload === null) throw new Error("Unerwartete Antwort vom Server.");
  return payload;
}

async function uploadCsvProfile(
  path: string,
  file: File,
  missingFieldMode: "error" | "skip",
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("missing_field_mode", missingFieldMode);

  const res = await fetchWithFallback(path, {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
    body: formData,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail: unknown }).detail;
      if (typeof detail === "string") {
        throw new Error(detail);
      }
      if (detail && typeof detail === "object" && "message" in detail) {
        throw new Error(String((detail as { message: unknown }).message));
      }
      throw new Error("CSV-Import Validierung fehlgeschlagen.");
    }
    throw new Error(`API error ${res.status}`);
  }
  return payload;
}

export type Invite = {
  code: string;
  created_at: string | null;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  status: "open" | "used" | "expired";
};
export type PasskeyCredential = { id: number; device_name: string | null; created_at: string | null; last_used_at: string | null };

export type AuthProfile = { user_id: number; display_name: string; email: string | null; created_at: string | null };

export type AiConfig = { provider: string; endpoint: string; model: string; key: string };
export type AiProfile = { endpoint?: string; model?: string; key?: string; ok?: boolean };
// Top-level fields = active config (the only part the backend reads); profiles = per-provider memory
export type AiSettings = AiConfig & { profiles: Record<string, AiProfile> };

export const api = {
  register: (payload: { display_name: string; pin: string; email: string; invite?: string }) =>
    postJson("/api/auth/register", payload),
  // display_name nimmt auch die E-Mail entgegen (Anmeldung mit Name oder E-Mail)
  login: (payload: { display_name: string; pin: string }) =>
    postJson("/api/auth/login", payload),
  logout: () => postJson("/api/auth/logout", {}),
  me: () => requestJson("GET", "/api/auth/me") as Promise<AuthProfile>,
  updateMe: (payload: { display_name?: string; email?: string; current_password?: string }) =>
    putJson("/api/auth/me", payload) as Promise<AuthProfile>,
  changePassword: (current_password: string, new_password: string, lang?: string) =>
    postJson("/api/auth/password/change", { current_password, new_password, lang }),
  forgotPassword: (email: string, lang?: string) => postJson("/api/auth/password/forgot", { email, lang }),
  resetPassword: (token: string, new_password: string, lang?: string) =>
    postJson("/api/auth/password/reset", { token, new_password, lang }),
  // Einladungen (wie Fintools)
  invites: () => requestJson("GET", "/api/auth/invites") as Promise<Invite[]>,
  createInvite: () => postJson("/api/auth/invites", {}) as Promise<Invite>,
  revokeInvite: (code: string) => requestJson("DELETE", `/api/auth/invites/${encodeURIComponent(code)}`),
  // Passkeys (wie Budget-Pal). Die Options kommen als JSON-String, so wie die WebAuthn-Spec sie beschreibt.
  passkeyRegisterOptions: (password: string) =>
    postJson("/api/auth/webauthn/register/options", { password }) as Promise<string>,
  passkeyRegisterVerify: (credential: unknown, device_name?: string) =>
    postJson("/api/auth/webauthn/register/verify", { credential, device_name }) as Promise<PasskeyCredential>,
  passkeyLoginOptions: () => postJson("/api/auth/webauthn/login/options", {}) as Promise<string>,
  passkeyLoginVerify: (credential: unknown) => postJson("/api/auth/webauthn/login/verify", { credential }),
  passkeys: () => requestJson("GET", "/api/auth/webauthn/credentials") as Promise<PasskeyCredential[]>,
  removePasskey: (id: number) => requestJson("DELETE", `/api/auth/webauthn/credentials/${id}`),
  fetchProfileState: () => requestJson("GET", "/api/profile-state"),
  updatePreferences: (payload: {
    ui_theme?: "dark" | "light";
    ui_language?: "de" | "en";
    ui_density?: "comfort" | "pro";
  }) => putJson("/api/preferences", payload),
  fetchAiSettings: () => requestJson("GET", "/api/ai-settings") as Promise<{ ai: AiSettings }>,
  saveAiSettings: (ai: AiSettings) => putJson("/api/ai-settings", ai) as Promise<{ ai: AiSettings }>,
  testAi: (config: AiConfig) =>
    postJson("/api/ai/test", config) as Promise<{
      ok: boolean;
      models: string[] | null;
      model?: string;
      reply?: string;
      latencyMs?: number;
    }>,
  fetchThreeAMarkings: () =>
    requestJson("GET", "/api/profile/three-a-markings"),
  saveThreeAMarkings: (payload: {
    markings: Array<{
      year: number;
      status: "completed" | "open";
      source: "auto" | "manual";
      manual_override: boolean;
      updated_at?: string;
    }>;
  }) => putJson("/api/profile/three-a-markings", payload),
  fetchProfile: () => requestJson("GET", "/api/profile"),
  savePersonal: (payload: {
    date_of_birth: string | null;
    gender?: "male" | "female" | "other" | null;
    marital_status?:
      | "single"
      | "married"
      | "divorced"
      | "widowed"
      | "concubinage"
      | null;
    marital_status_year?: number | null;
    has_property?: boolean | null;
    property_details?: Record<string, unknown> | null;
  }) => putJson("/api/personal", payload),
  saveProperty: (payload: Record<string, unknown>) =>
    putJson("/api/property", payload),
  savePensionFund: (payload: Record<string, unknown>) =>
    putJson("/api/pension-fund", payload),
  saveThirdPillar: (payload: Record<string, unknown>) =>
    putJson("/api/third-pillar", payload),
  saveUserAssets: (payload: {
    cash_assets?: Array<{
      account_name: string;
      account_type: string;
      amount: number;
      currency: string;
      amount_chf: number;
      source?: "manual" | "import";
    }>;
    investment_assets?: {
      etf_chf: number;
      stocks_chf: number;
      savings_plan_chf: number;
      real_estate_etf_chf: number;
      source?: "manual" | "import";
    };
  }) => putJson("/api/user/assets", payload),
  fetchUserAssets: () => requestJson("GET", "/api/user/assets"),
  saveAhv: (payload: Record<string, unknown>) => putJson("/api/ahv", payload),
  saveAhvContributions: (payload: { rows: Array<Record<string, unknown>> }) =>
    putJson("/api/ahv/contributions", payload),
  importAhvContributions: (file: File) =>
    uploadDocument("/api/ahv/import", file, "ahv"),
  importLifeInsurancePolicy: (file: File) =>
    uploadDocument("/api/life-insurance/import", file, "lifeInsurance"),
  saveLifeInsurance: (payload: Record<string, unknown>) =>
    putJson("/api/life-insurance", payload),
  saveSeverance: (payload: Record<string, unknown>) =>
    putJson("/api/severance", payload),
  saveBvgRepaymentScenario: (payload: {
    scenario_name: string;
    bvg_mortgage_repayment_amount_per_year: number | null;
    bvg_mortgage_repayment_total_amount: number | null;
    analysis_state?: Record<string, unknown> | null;
  }) => putJson("/api/scenario/bvg-mortgage-repayment", payload),
  saveScenarioAnalysisUpdate: (payload: {
    amount?: number;
    tax_rate_percent?: number;
    start_calculation_month?: number | null;
    start_calculation_year?: number | null;
    allocation_bvg_buyin?: number;
    allocation_pillar3a?: number;
    allocation_private_3b?: number;
    estimated_return_percent?: number;
    plan_duration_years?: number;
  }) => putJson("/api/severance", payload),
  calculatePension: (payload: {
    retirement_age: number;
    max_age: number;
    tax_rate_percent: number;
    inflation_rate_percent: number;
    bvg_mortgage_repayment_amount_per_year: number;
  }) => postJson("/api/calc/pension", payload),
  calculateComprehensivePension: (payload: {
    annual_gross_salary_chf: number;
    retirement_age: number;
    reference_retirement_age?: number;
    ahv_annual_contributions_chf: number[];
    ahv_rentenquote?: number;
    bvg_capital_at_retirement_chf: number;
    bvg_conversion_rate_percent?: number;
    pillar3a_contribution_chf?: number;
    pillar3a_expected_return_percent?: number;
    pillar3a_tax_deduction_cap_chf?: number;
    private_products_annual_chf?: number;
    start_capital_chf?: number;
    annual_spending_chf?: number;
    nominal_return_percent?: number;
    inflation_rate_percent?: number;
    projection_years?: number;
  }) => postJson("/api/calc/pension/comprehensive", payload),
  importDocument: (
    file: File,
    cardId: string,
    targetFieldId?: string,
    batchMappings?: Array<{ source_field_id: string; target_field_id: string }>,
  ) =>
    uploadDocument(
      "/api/import/document",
      file,
      cardId,
      targetFieldId,
      batchMappings,
    ),
  validateProfileCsvImport: (
    file: File,
    missingFieldMode: "error" | "skip",
  ) => uploadCsvProfile("/api/import/csv-profile/validate", file, missingFieldMode),
  applyProfileCsvImport: (
    file: File,
    missingFieldMode: "error" | "skip",
  ) => uploadCsvProfile("/api/import/csv-profile/apply", file, missingFieldMode),
};
