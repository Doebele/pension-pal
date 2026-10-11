import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication } from "@simplewebauthn/browser";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Analysis } from "./pages/Analysis";
import { MonteCarlo } from "./pages/MonteCarlo";
import { AUTH_LINK_PATHS, Login } from "./pages/Login";
import { Knowledge } from "./pages/Knowledge.tsx";
import { ImportExport } from "./pages/ImportExport";
import { appIcons } from "./components/icons/iconMap";
import { api, checkApiHealth, setAuthSession } from "./services/api";
import { NavTransitionOverlay } from "./components/layout/NavTransitionOverlay";
import { useNavigationLock } from "./context/NavigationLockContext";
import { useUiPreferencesStore, type UiLanguage, type UiTheme, type UiDensity } from "./store/uiPreferencesStore";
import type { CardId } from "./components/dashboard/CardLayout";

const NAV_SELECTION_STORAGE_KEY = "spc_nav_selection";
const DASHBOARD_TILE_QUERY_KEY = "tile";
type ActiveView = "dashboard" | "analysis" | "cockpit" | "montecarlo" | "documents" | "knowledge" | "importExport";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  section?: string;
  children?: NavItem[];
};

const useNavItems = (): NavItem[] => {
  const { t } = useTranslation();
  return React.useMemo<NavItem[]>(
    () => [
      { id: "personal", label: t("nav.personal"), icon: appIcons.personal, section: t("nav.dataEntrySection") },
      { id: "ahv", label: t("nav.ahv"), icon: appIcons.ahv, section: t("nav.dataEntrySection") },
      { id: "bvg", label: t("nav.bvg"), icon: appIcons.pension, section: t("nav.dataEntrySection") },
      { id: "pillar3", label: t("nav.pillar3"), icon: appIcons.pillar3a, section: t("nav.dataEntrySection") },
      { id: "lifeInsurance", label: t("nav.lifeInsurance"), icon: appIcons.lifeInsurance, section: t("nav.dataEntrySection") },
      { id: "severance", label: t("nav.severance"), icon: appIcons.severance, section: t("nav.dataEntrySection") },
      { id: "assets", label: t("nav.assets"), icon: appIcons.investments, section: t("nav.dataEntrySection") },
      { id: "analysis", label: t("nav.analysis"), icon: appIcons.analysis, section: t("nav.analysisSection") },
      { id: "cockpit", label: t("nav.cockpit"), icon: appIcons.cockpit, section: t("nav.analysisSection") },
      { id: "montecarlo", label: t("nav.montecarlo"), icon: appIcons.montecarlo, section: t("nav.analysisSection") },
      // "documents" bewusst ausgeblendet: die View ist noch ein Platzhalter
      // (siehe unten). ID-Resolve und Platzhalter bleiben erhalten, damit
      // gespeicherte/deep-linked Selektionen nicht brechen.
      { id: "knowledge", label: t("nav.knowledge"), icon: appIcons.knowledge, section: t("nav.analysisSection") },
      {
        id: "importExport",
        label: t("nav.importExport"),
        icon: appIcons.importExport,
        section: t("nav.analysisSection"),
        children: [
          { id: "importExport/export", label: t("nav.csvExport"), icon: appIcons.csvExport },
          { id: "importExport/import", label: t("nav.csvImport"), icon: appIcons.csvImport },
        ],
      },
    ],
    [t],
  );
};

const NAV_IDS = [
  "personal",
  "ahv",
  "bvg",
  "pillar3",
  "lifeInsurance",
  "severance",
  "assets",
  "analysis",
  "cockpit",
  "montecarlo",
  "documents",
  "knowledge",
  "importExport",
  "importExport/export",
  "importExport/import",
];

const resolveViewFromNavId = (id: string): ActiveView => {
  if (id === "analysis") return "analysis";
  if (id === "cockpit") return "cockpit";
  if (id === "montecarlo") return "montecarlo";
  if (id === "documents") return "documents";
  if (id === "knowledge") return "knowledge";
  if (id === "importExport" || id.startsWith("importExport/")) return "importExport";
  return "dashboard";
};

const mapLegacyNavId = (id: string): string => {
  if (id === "cashAssets" || id === "investmentAssets") return "assets";
  if (id === "property") return "personal";
  if (id === "motionEttlin") return "pillar3";
  return id;
};

const resolveHashToNavId = (hashRaw: string): string => {
  const normalized = mapLegacyNavId(hashRaw.trim());
  if (normalized.startsWith("wissen/")) return "knowledge";
  if (normalized.startsWith("importExport/")) return normalized;
  return normalized;
};

const isKnownNavId = (id: string) => NAV_IDS.includes(id);

const resolveInitialNavSelection = () => {
  const queryTileRaw = new URLSearchParams(window.location.search).get(DASHBOARD_TILE_QUERY_KEY) || "";
  const queryTile = mapLegacyNavId(queryTileRaw.trim());
  if (queryTile && isKnownNavId(queryTile)) {
    return queryTile;
  }
  const hashValueRaw = window.location.hash.replace(/^#/, "").trim();
  const hashValue = resolveHashToNavId(hashValueRaw);
  if (hashValue && isKnownNavId(hashValue)) {
    if (hashValue !== hashValueRaw && !hashValueRaw.startsWith("wissen/")) {
      window.history.replaceState(null, "", `#${hashValue}`);
    }
    return hashValue;
  }
  const storedRaw = localStorage.getItem(NAV_SELECTION_STORAGE_KEY) || "";
  const stored = mapLegacyNavId(storedRaw);
  if (stored && isKnownNavId(stored)) return stored;
  return "personal";
};

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const navItems = useNavItems();
  const { isLocked, lockFor } = useNavigationLock();
  const initialNavSelection = React.useRef(resolveInitialNavSelection());
  const [navSelection, setNavSelection] = React.useState(initialNavSelection.current);
  const [activeView, setActiveView] = React.useState<ActiveView>(
    resolveViewFromNavId(initialNavSelection.current),
  );
  const { theme, density, setTheme, setDensity, setUiLanguage } = useUiPreferencesStore();
  const [auth, setAuth] = React.useState<{ userId: number; displayName: string; token: string } | null>(null);
  const [authLink, setAuthLink] = React.useState(() => AUTH_LINK_PATHS.includes(window.location.pathname));
  const [backendOnline, setBackendOnline] = React.useState<boolean | null>(null);
  const DASHBOARD_CARD_IDS = React.useMemo<CardId[]>(
    () => [
      "personal",
      "ahv",
      "bvg",
      "pillar3",
      "lifeInsurance",
      "severance",
      "assets",
    ],
    [],
  );

  React.useEffect(() => {
    const raw = localStorage.getItem("spc_auth");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { userId: number; displayName: string; token: string };
      setAuth(parsed);
      setAuthSession({ userId: parsed.userId, token: parsed.token });
    } catch {
      localStorage.removeItem("spc_auth");
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-density", density === "pro" ? "pro" : "comfort");
  }, [density]);

  // <html lang> den Screenreadern mitliefern: folgt jeder Sprachumschaltung
  // (Sidebar-Toggle, Server-Präferenz, Backup-Restore) zentral.
  React.useEffect(() => {
    const syncLang = (lng: string) => {
      document.documentElement.lang = lng;
    };
    syncLang(i18n.language);
    i18n.on("languageChanged", syncLang);
    return () => {
      i18n.off("languageChanged", syncLang);
    };
  }, []);

  React.useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    (async () => {
      try {
        const res = (await api.fetchProfileState()) as Record<string, unknown>;
        const prefs = (res.preferences as Record<string, unknown> | undefined) || {};
        if (cancelled) return;
        const serverTheme = prefs.uiTheme as UiTheme | undefined;
        const serverLanguage = prefs.uiLanguage as UiLanguage | undefined;
        const serverDensity = prefs.uiDensity as UiDensity | undefined;
        if (serverTheme === "dark" || serverTheme === "light") setTheme(serverTheme);
        if (serverDensity === "comfort" || serverDensity === "pro") setDensity(serverDensity);
        if (serverLanguage === "de" || serverLanguage === "en") {
          setUiLanguage(serverLanguage);
          await i18n.changeLanguage(serverLanguage);
        }
      } catch {
        /* keep local defaults if profile-state is unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, i18n, setDensity, setTheme, setUiLanguage]);

  React.useEffect(() => {
    let mounted = true;
    let intervalId: number | null = null;
    const runHealthCheck = async () => {
      const ok = await checkApiHealth();
      if (mounted) setBackendOnline(ok);
    };
    void runHealthCheck();
    intervalId = window.setInterval(() => {
      void runHealthCheck();
    }, 15000);
    const onFocus = () => {
      void runHealthCheck();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  React.useEffect(() => {
    localStorage.setItem(NAV_SELECTION_STORAGE_KEY, navSelection);
    const currentUrl = new URL(window.location.href);
    if (DASHBOARD_CARD_IDS.includes(navSelection as CardId)) {
      currentUrl.searchParams.set(DASHBOARD_TILE_QUERY_KEY, navSelection);
    } else {
      currentUrl.searchParams.delete(DASHBOARD_TILE_QUERY_KEY);
    }
    currentUrl.hash = `#${navSelection}`;
    window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }, [DASHBOARD_CARD_IDS, navSelection]);

  React.useEffect(() => {
    const onHashChange = () => {
      const nextRaw = window.location.hash.replace(/^#/, "").trim();
      const next = resolveHashToNavId(nextRaw);
      if (!next || !isKnownNavId(next)) return;
      if (next !== nextRaw && !nextRaw.startsWith("wissen/")) {
        window.history.replaceState(null, "", `#${next}`);
      }
      setNavSelection(next);
      setActiveView(resolveViewFromNavId(next));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const applyNavSelection = React.useCallback((id: string) => {
    setNavSelection(id);
    setActiveView(resolveViewFromNavId(id));
  }, []);

  const handleNavSelect = async (id: string) => {
    if (isLocked) return;
    await lockFor(600);
    applyNavSelection(id);
  };

  const handleDashboardCardChange = React.useCallback((cardId: CardId) => {
    applyNavSelection(cardId);
  }, [applyNavSelection]);

  const startSession = (res: Record<string, unknown>) => {
    const nextAuth = {
      userId: res.user_id as number,
      displayName: res.display_name as string,
      token: res.session_token as string,
    };
    setAuth(nextAuth);
    setAuthSession({ userId: nextAuth.userId, token: nextAuth.token });
    localStorage.setItem("spc_auth", JSON.stringify(nextAuth));
    setAuthLink(false);
  };

  // identifier: Name oder E-Mail
  const handleLogin = async (identifier: string, pin: string) => {
    startSession((await api.login({ display_name: identifier, pin })) as Record<string, unknown>);
  };

  const handleRegister = async (displayName: string, pin: string, email: string, invite: string) => {
    startSession((await api.register({ display_name: displayName, pin, email, invite })) as Record<string, unknown>);
  };

  // Passkey (wie Budget-Pal): der Browser wählt den passenden Passkey und führt die Ceremony
  const handlePasskeyLogin = async () => {
    const options = JSON.parse(await api.passkeyLoginOptions());
    const credential = await startAuthentication({ optionsJSON: options });
    startSession((await api.passkeyLoginVerify(credential)) as Record<string, unknown>);
  };

  // Name im Profil geändert → Kontomenü und gespeicherte Sitzung nachziehen
  const handleProfileRenamed = (displayName: string) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, displayName };
      localStorage.setItem("spc_auth", JSON.stringify(next));
      return next;
    });
  };

  const handleLogout = async () => {
    await api.logout().catch(() => undefined);
    setAuth(null);
    setAuthSession(null);
    localStorage.removeItem("spc_auth");
    await queryClient.clear();
  };

  // Links aus Mails (Passwort zurücksetzen) auch zeigen, wenn auf diesem Gerät noch jemand angemeldet ist
  if (!auth || authLink) {
    return <Login onLogin={handleLogin} onRegister={handleRegister} onPasskey={handlePasskeyLogin} />;
  }

  return (
    <div className={`app-shell flex h-screen bg-bg text-fg-1 ${density === "pro" ? "density-pro" : "density-comfort"}`}>
      <Sidebar
        items={navItems}
        activeId={navSelection}
        onSelect={handleNavSelect}
        userName={auth.displayName}
        onLogout={() => void handleLogout()}
        onProfileRenamed={handleProfileRenamed}
        disabled={isLocked}
        backendOnline={backendOnline}
      />
      <main className={`relative flex-1 overflow-auto bg-bg p-4 ${isLocked ? "pointer-events-none cursor-progress" : ""}`}>
        <NavTransitionOverlay active={isLocked} />
        {activeView === "dashboard" && (
          <Dashboard
            selectedCardId={
              DASHBOARD_CARD_IDS.includes(navSelection as CardId)
                ? (navSelection as CardId)
                : "personal"
            }
            onSelectedCardChange={handleDashboardCardChange}
          />
        )}
        {activeView === "analysis" && <Analysis />}
        {activeView === "cockpit" && <Analysis layout="cockpit" />}
        {activeView === "montecarlo" && <MonteCarlo />}
        {activeView === "documents" && (
          <div className="text-sm text-slate-400">{t("documents.placeholder")}</div>
        )}
        {activeView === "knowledge" && <Knowledge />}
        {activeView === "importExport" && (
          <ImportExport
            userName={auth.displayName}
            preferredAction={
              navSelection === "importExport/import"
                ? "import"
                : navSelection === "importExport/export"
                ? "export"
                : undefined
            }
          />
        )}
      </main>
    </div>
  );
};
