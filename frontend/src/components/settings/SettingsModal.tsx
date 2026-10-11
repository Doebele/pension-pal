import React from "react";
import { useTranslation } from "react-i18next";
import { api, type AiProfile, type AiSettings } from "../../services/api";
import { AccountSettings } from "./AccountSettings";
import { SecuritySettings } from "./SecuritySettings";
import { inputClass, labelClass } from "./formClasses";
import { WarningTriangle } from "iconoir-react";

// Same list as Fintools (Doebele/fintools, AI_PROVIDERS in App.jsx), roughly following the model
// creators leading artificialanalysis.ai. keyUrl = where to create an API key; no keyUrl = local,
// no key needed. Only "anthropic", "openai" and the local ids have special handling in the backend
// (backend_python/app/services/ai.py) — adding an OpenAI-compatible provider needs only a new entry.
type AiProvider = { id: string; label: string; url: string; ph?: string; keyUrl?: string; note?: string };
const AI_PROVIDERS: AiProvider[] = [
  { id: "lmstudio", label: "LM Studio", url: "http://localhost:1234" },
  { id: "ollama", label: "Ollama", url: "http://localhost:11434" },
  { id: "anthropic", label: "Anthropic (Claude)", url: "https://api.anthropic.com/v1", ph: "sk-ant-...", keyUrl: "https://platform.claude.com/settings/keys" },
  { id: "openai", label: "OpenAI (GPT)", url: "https://api.openai.com/v1", ph: "sk-...", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google (Gemini)", url: "https://generativelanguage.googleapis.com/v1beta/openai", ph: "AIza...", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "xai", label: "xAI (Grok)", url: "https://api.x.ai/v1", ph: "xai-...", keyUrl: "https://console.x.ai/" },
  { id: "meta", label: "Meta (Muse)", url: "https://api.meta.ai/v1", keyUrl: "https://ai.developer.meta.com/" },
  { id: "mistral", label: "Mistral", url: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys" },
  { id: "deepseek", label: "DeepSeek", url: "https://api.deepseek.com/v1", ph: "sk-...", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "qwen", label: "Alibaba (Qwen)", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", ph: "sk-...", keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key" },
  { id: "moonshot", label: "Kimi Platform (API)", url: "https://api.moonshot.ai/v1", ph: "sk-...", keyUrl: "https://platform.kimi.ai/console/api-keys" },
  { id: "kimi-code", label: "Kimi Code (Coding Plan)", url: "https://api.kimi.ai/coding/v1", ph: "sk-kimi-...", keyUrl: "https://www.kimi.ai/code/console", note: "settings.kimiCodeNote" },
  { id: "zai", label: "Z.AI (GLM) — Global", url: "https://api.z.ai/api/paas/v4", keyUrl: "https://z.ai/manage-apikey/apikey-list" },
  { id: "zai-cn", label: "BigModel (GLM) — China", url: "https://open.bigmodel.cn/api/paas/v4", keyUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys" },
  { id: "minimax", label: "MiniMax", url: "https://api.minimax.io/v1", keyUrl: "https://platform.minimax.io/console/access" },
  { id: "mimo", label: "Xiaomi (MiMo)", url: "https://api.xiaomimimo.com/v1", keyUrl: "https://platform.xiaomimimo.com/" },
  { id: "stepfun", label: "StepFun (Step)", url: "https://api.stepfun.ai/v1", keyUrl: "https://platform.stepfun.ai/" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", ph: "sk-or-...", keyUrl: "https://openrouter.ai/settings/keys" },
];

type TestState = null | "testing" | { ok: true; model?: string; latencyMs?: number; count?: number } | { ok: false; err: string };


export const SettingsModal: React.FC<{ onClose: () => void; onProfileRenamed?: (displayName: string) => void }> = ({
  onClose,
  onProfileRenamed,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<"profile" | "security" | "ai">("profile");
  const [loaded, setLoaded] = React.useState(false);
  const [provider, setProvider] = React.useState("disabled");
  const [endpoint, setEndpoint] = React.useState("");
  const [model, setModel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [profiles, setProfiles] = React.useState<Record<string, AiProfile>>({});
  const [models, setModels] = React.useState<string[]>([]);
  const [testState, setTestState] = React.useState<TestState>(null);
  const [saveState, setSaveState] = React.useState<null | "saving" | { ok: boolean; text: string }>(null);
  const providerRef = React.useRef(provider);
  providerRef.current = provider;
  const prov = AI_PROVIDERS.find((p) => p.id === provider);

  // Silent model-list fetch; ignores the answer if the user switched provider meanwhile
  const loadModels = (id: string, url: string, key: string) =>
    api
      .testAi({ provider: id, endpoint: url, model: "", key })
      .then((r) => {
        if (providerRef.current === id) setModels(r.models || []);
      })
      .catch(() => undefined);

  React.useEffect(() => {
    api
      .fetchAiSettings()
      .then(({ ai }) => {
        setProvider(ai.provider || "disabled");
        setEndpoint(ai.endpoint || "");
        setModel(ai.model || "");
        setApiKey(ai.key || "");
        setProfiles(ai.profiles || {});
        providerRef.current = ai.provider || "disabled";
        // Pre-load the model list for an already configured provider
        if (ai.provider && ai.provider !== "disabled" && ai.endpoint) void loadModels(ai.provider, ai.endpoint, ai.key || "");
      })
      .catch((e: Error) => setSaveState({ ok: false, text: e.message }))
      .finally(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patchProfile = (id: string, patch: AiProfile) =>
    setProfiles((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // Dropdown tag: ✓ = connection tested OK, 🔑 = key stored but not (successfully) tested
  const mark = (id: string) => {
    const key = id === provider ? apiKey : profiles[id]?.key;
    return profiles[id]?.ok ? "  ✓" : key ? "  🔑" : "";
  };

  const switchProvider = (next: string) => {
    const p = AI_PROVIDERS.find((x) => x.id === next);
    const saved = profiles[next] ?? {};
    // Stash the current provider's config, restore the next one's (keys are never carried across)
    if (provider !== "disabled") patchProfile(provider, { endpoint, model, key: apiKey });
    setProvider(next);
    providerRef.current = next;
    setEndpoint(saved.endpoint || p?.url || "");
    setModel(saved.model || "");
    setApiKey(saved.key || "");
    setModels([]);
    setTestState(null);
    if (p && (!p.keyUrl || saved.key)) void loadModels(next, saved.endpoint || p.url, saved.key || "");
  };

  // Editing endpoint/key invalidates a previous successful test
  const invalidateTest = () => {
    if (profiles[provider]?.ok) patchProfile(provider, { ok: false });
  };

  const handleTest = async () => {
    if (!endpoint) return;
    setTestState("testing");
    try {
      const r = await api.testAi({ provider, endpoint, model, key: apiKey });
      if (r.models) setModels(r.models);
      setTestState({ ok: true, model: r.model, latencyMs: r.latencyMs, count: r.models?.length });
      patchProfile(provider, { endpoint, model, key: apiKey, ok: true });
    } catch (e) {
      setTestState({ ok: false, err: (e as Error).message });
      patchProfile(provider, { ok: false });
    }
  };

  const handleSave = async () => {
    setSaveState("saving");
    const payload: AiSettings = {
      provider,
      endpoint,
      model,
      key: apiKey,
      profiles: provider === "disabled" ? profiles : { ...profiles, [provider]: { ...profiles[provider], endpoint, model, key: apiKey } },
    };
    try {
      await api.saveAiSettings(payload);
      setProfiles(payload.profiles);
      setSaveState({ ok: true, text: t("settings.saved") });
    } catch (e) {
      setSaveState({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-surface p-section shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="settings-title" className="text-base font-semibold text-slate-100">{t("settings.title")}</h2>
          <button type="button" aria-label={t("settings.close")} onClick={onClose}
            className="rounded px-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">✕</button>
        </div>

        <div className="seg-row mt-3">
          <button type="button" className={`seg-btn${tab === "profile" ? " active" : ""}`} onClick={() => setTab("profile")}>
            {t("profile.title")}
          </button>
          <button type="button" className={`seg-btn${tab === "security" ? " active" : ""}`} onClick={() => setTab("security")}>
            {t("settings.securityTab")}
          </button>
          <button type="button" className={`seg-btn${tab === "ai" ? " active" : ""}`} onClick={() => setTab("ai")}>
            {t("settings.aiTab")}
          </button>
        </div>

        {tab === "profile" && <AccountSettings onRenamed={onProfileRenamed} />}
        {tab === "security" && <SecuritySettings />}

        {tab === "ai" && (<>
        <h3 className="mt-3 text-sm font-semibold text-slate-200">{t("settings.aiSection")}</h3>
        <p className="mt-1 text-xs text-slate-400">{t("settings.aiHint")}</p>

        <fieldset disabled={!loaded} className="mt-3 space-y-3">
          <div>
            <label className={labelClass} htmlFor="ai-provider">{t("settings.aiProvider")}</label>
            <select id="ai-provider" className={inputClass} value={provider} onChange={(e) => switchProvider(e.target.value)}>
              <optgroup label={t("settings.aiLocal")}>
                {AI_PROVIDERS.filter((p) => !p.keyUrl).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}{mark(p.id)}</option>
                ))}
              </optgroup>
              <optgroup label={t("settings.aiCloud")}>
                {AI_PROVIDERS.filter((p) => p.keyUrl).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}{mark(p.id)}</option>
                ))}
              </optgroup>
              <option value="disabled">{t("settings.disabled")}</option>
            </select>
            <p className="mt-1 text-2xs text-slate-500">{t("settings.aiLegend")}</p>
          </div>

          {provider !== "disabled" && (
            <>
              <div>
                <label className={labelClass} htmlFor="ai-endpoint" title={t("settings.endpointTip")}>{t("settings.endpointUrl")}</label>
                <input id="ai-endpoint" className={inputClass} value={endpoint} placeholder="http://localhost:1234"
                  onChange={(e) => { setEndpoint(e.target.value); invalidateTest(); }} />
              </div>

              {prov?.keyUrl && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <label className={labelClass} htmlFor="ai-key">{t("settings.apiKey")}</label>
                    <a href={prov.keyUrl} target="_blank" rel="noopener noreferrer"
                      className="text-2xs font-semibold text-blue-400 hover:underline">{t("settings.getKey")} ↗</a>
                  </div>
                  <input id="ai-key" type="password" autoComplete="off" className={inputClass} value={apiKey}
                    placeholder={prov.ph || "API key"} onChange={(e) => { setApiKey(e.target.value); invalidateTest(); }} />
                  {prov.note && <p className="mt-1 flex gap-1 text-xs leading-snug text-amber-300"><WarningTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>{t(prov.note)}</span></p>}
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="ai-model" title={t("settings.modelTip")}>{t("settings.modelName")}</label>
                {models.length ? (
                  <select id="ai-model" className={inputClass} value={model} onChange={(e) => setModel(e.target.value)}>
                    {!models.includes(model) && <option value={model}>{model || t("settings.chooseModel")}</option>}
                    {models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input id="ai-model" className={inputClass} value={model} placeholder={t("settings.modelHint")}
                    onChange={(e) => setModel(e.target.value)} />
                )}
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void handleTest()} disabled={testState === "testing" || !endpoint}
                  className="shrink-0 rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  {testState === "testing" ? `⟳ ${t("settings.testing")}` : `⚡ ${t("settings.testConn")}`}
                </button>
                {testState && testState !== "testing" && (
                  testState.ok ? (
                    <span className="text-xs text-green-400">
                      ✓ {t("settings.connOk")}
                      {testState.count != null && <> — {t("settings.modelsFound", { count: testState.count })}</>}
                      {testState.model && <> — {testState.latencyMs}ms <span className="text-slate-500">({testState.model})</span></>}
                    </span>
                  ) : (
                    <span className="flex-1 break-words text-xs text-red-400" title={testState.err}>
                      ✗ {testState.err.slice(0, 120)}{testState.err.length > 120 ? "…" : ""}
                    </span>
                  )
                )}
              </div>
            </>
          )}
        </fieldset>

        {saveState && saveState !== "saving" && (
          <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${saveState.ok
            ? "border-green-500/40 bg-green-900/25 text-green-200"
            : "border-red-500/40 bg-red-900/30 text-red-200"}`}>
            {saveState.ok ? "✓" : "✗"} {saveState.text}
          </p>
        )}
        </>)}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800">
            {t("settings.close")}
          </button>
          {tab === "ai" && (
            <button type="button" onClick={() => void handleSave()} disabled={!loaded || saveState === "saving"}
              className="rounded-md border border-blue-500/60 bg-blue-600/20 px-3 py-1 text-sm font-medium text-blue-100 hover:bg-blue-600/35 disabled:cursor-progress disabled:opacity-70">
              {t("settings.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
