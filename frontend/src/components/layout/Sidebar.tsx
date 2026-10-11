import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  DashboardSpeed,
  HalfMoon,
  Language,
  LogOut,
  Menu,
  Settings,
  SidebarCollapse,
  Sofa,
  SunLight,
  SwitchOff,
  WarningCircle,
  Xmark,
} from "iconoir-react";
import { useUiPreferencesStore } from "../../store/uiPreferencesStore";
import { api } from "../../services/api";
import { SettingsModal } from "../settings/SettingsModal";
// @ts-ignore
import deFlagUrl from "round-flag-icons/flags/de.svg?url";
// @ts-ignore
import gbFlagUrl from "round-flag-icons/flags/gb.svg?url";

const FlagIcon: React.FC<{ lang: "de" | "en"; size?: number }> = ({ lang, size = 13 }) => (
  <img
    src={lang === "de" ? deFlagUrl : gbFlagUrl}
    width={size}
    height={size}
    style={{ borderRadius: "50%", display: "block", flexShrink: 0, objectFit: "cover" }}
    alt={lang}
  />
);

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
};

type UserAccountMenuProps = {
  userName: string;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
};

const UserAccountMenu: React.FC<UserAccountMenuProps> = ({ userName, anchorRef, onClose, onLogout, onOpenSettings }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(event.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose, anchorRef]);

  const rect = anchorRef.current?.getBoundingClientRect();
  const top = (rect?.top ?? 0) - 8;
  const left = (rect?.right ?? 0) + 10;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left,
        top,
        transform: "translateY(-100%)",
        width: 240,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-modal)",
        zIndex: 9999,
        overflow: "hidden",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div style={{ padding: "12px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <div className="rail-avatar" style={{ width: 34, height: 34, fontSize: "var(--fs-sm)" }}>
          {userName.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userName}
          </div>
          <div style={{ fontSize: "var(--fs-2xs)", color: "var(--fg-3)", marginTop: 0 }}>{t("user.account")}</div>
        </div>
      </div>

      <div style={{ padding: 4 }}>
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "8px 8px", borderRadius: 7,
            border: "none", background: "transparent", cursor: "pointer",
            fontFamily: "inherit", textAlign: "left",
            transition: "background 0.1s", color: "var(--fg-2)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Settings width={14} height={14} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>{t("user.settings")}</span>
        </button>

        {!confirmSwitch ? (
          <button
            type="button"
            onClick={() => {
              setConfirmLogout(false);
              setConfirmSwitch(true);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 8px", borderRadius: 7,
              border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "inherit", textAlign: "left",
              transition: "background 0.1s", color: "var(--fg-2)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <SwitchOff width={14} height={14} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>{t("user.switchUser")}</span>
          </button>
        ) : (
          <div style={{
            borderRadius: 8,
            background: "var(--accent-08)",
            border: "1px solid var(--accent-20)",
            margin: "4px 0",
            padding: "8px 8px 8px",
          }}>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--fg-2)", lineHeight: 1.4, marginBottom: 8 }}>
              {t("user.confirmSwitch")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 6,
                  border: "none", background: "var(--accent)", color: "#fff",
                  cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-xs)", fontWeight: 600,
                }}
              >
                {t("user.switchConfirmBtn")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmSwitch(false)}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--fg-2)", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-xs)", fontWeight: 500,
                }}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        )}

        {!confirmLogout ? (
          <button
            type="button"
            onClick={() => {
              setConfirmSwitch(false);
              setConfirmLogout(true);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 8px", borderRadius: 7,
              border: "none", background: "transparent", cursor: "pointer",
              fontFamily: "inherit", textAlign: "left",
              transition: "background 0.1s", color: "var(--fg-2)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut width={14} height={14} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>{t("user.logout")}</span>
          </button>
        ) : (
          <div style={{
            padding: "8px 8px 8px",
            borderRadius: 8,
            background: "rgba(248, 113, 113, 0.07)",
            border: "1px solid rgba(248, 113, 113, 0.2)",
            margin: "4px 0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <WarningCircle width={13} height={13} style={{ color: "#f87171", flexShrink: 0 }} />
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--fg-2)", lineHeight: 1.4 }}>{t("user.confirmLogoutBody")}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 6,
                  border: "none", background: "#ef4444", color: "#fff",
                  cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-xs)", fontWeight: 600,
                }}
              >
                {t("user.confirmLogoutYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--fg-2)", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--fs-xs)", fontWeight: 500,
                }}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

const RAIL_EXPANDED = 220;
const RAIL_COLLAPSED = 52;

type SidebarItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  section?: string;
  children?: SidebarItem[];
};

type SidebarProps = {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  userName: string;
  onLogout: () => void;
  disabled?: boolean;
  backendOnline?: boolean | null;
  onProfileRenamed?: (displayName: string) => void;
};

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  activeId,
  onSelect,
  userName,
  onLogout,
  disabled = false,
  backendOnline = null,
  onProfileRenamed,
}) => {
  const { t, i18n } = useTranslation();
  const { railOpen, toggleRail, density, toggleDensity, theme, toggleTheme, uiLanguage, setUiLanguage } =
    useUiPreferencesStore();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const collapsed = isMobile ? false : !railOpen;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [tooltipVisibleId, setTooltipVisibleId] = useState<string | null>(null);
  const [tooltipLabel, setTooltipLabel] = useState("");
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const userBtnRef = useRef<HTMLDivElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current !== null) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!collapsed) {
      setTooltipVisibleId(null);
      setTooltipLabel("");
      setTooltipPosition(null);
    }
    setUserMenuOpen(false);
  }, [collapsed]);

  useEffect(() => {
    const parentMatch = items.find((item) => item.children?.some((child) => child.id === activeId));
    if (!parentMatch) return;
    setExpandedGroups((prev) => ({ ...prev, [parentMatch.id]: true }));
  }, [activeId, items]);

  const setTooltipFromElement = (id: string, label: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setTooltipPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
    setTooltipLabel(label);
    setTooltipVisibleId(id);
  };

  const showTooltipOnHover = (id: string, label: string, element: HTMLElement) => {
    if (!collapsed) return;
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
    }
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipFromElement(id, label, element);
    }, 180);
  };

  const hideTooltip = (id: string) => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
    }
    setTooltipPosition(null);
    setTooltipLabel("");
    setTooltipVisibleId((prev) => (prev === id ? null : prev));
  };

  const changeLanguage = async (lang: "de" | "en") => {
    setUiLanguage(lang);
    await i18n.changeLanguage(lang);
    try {
      await api.updatePreferences({ ui_language: lang });
    } catch {
      /* silent */
    }
  };

  const changeTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    toggleTheme();
    try {
      await api.updatePreferences({ ui_theme: next });
    } catch {
      /* silent */
    }
  };

  const changeDensity = async () => {
    const next = density === "comfort" ? "pro" : "comfort";
    toggleDensity();
    try {
      await api.updatePreferences({ ui_density: next });
    } catch {
      /* silent */
    }
  };

  const grouped = items.reduce<Record<string, SidebarItem[]>>((acc, item) => {
    const key = item.section || "Allgemein";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const isItemActive = (item: SidebarItem) =>
    activeId === item.id || Boolean(item.children?.some((child) => child.id === activeId));

  const renderItemButton = (item: SidebarItem, nested = false) => (
    <div key={item.id} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!collapsed && item.children && item.children.length > 0) {
            setExpandedGroups((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
          }
          onSelect(item.id);
          if (isMobile) setMobileOpen(false);
        }}
        onMouseEnter={(event) => showTooltipOnHover(item.id, item.label, event.currentTarget)}
        onMouseLeave={() => hideTooltip(item.id)}
        onFocus={(event) => showTooltipOnHover(item.id, item.label, event.currentTarget)}
        onBlur={() => hideTooltip(item.id)}
        className={`rail-btn${isItemActive(item) ? " active" : ""}${disabled ? " cursor-progress opacity-70" : ""}`}
        style={{
          justifyContent: collapsed ? "center" : "flex-start",
          paddingLeft: nested && !collapsed ? "calc(var(--sp-4) + 14px)" : undefined,
        }}
      >
        <span className="rail-icon">{item.icon}</span>
        {!collapsed && <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
        {!collapsed && item.children && item.children.length > 0 && (
          <span style={{ fontSize: "var(--fs-2xs)", color: "var(--fg-3)" }}>{expandedGroups[item.id] ? "▾" : "▸"}</span>
        )}
      </button>
      {!collapsed && item.children && item.children.length > 0 && expandedGroups[item.id] && (
        <div className="mt-1 space-y-1">{item.children.map((child) => renderItemButton(child, true))}</div>
      )}
    </div>
  );

  const backendStatusLabel =
    backendOnline === null ? t("backend.checking") : backendOnline ? t("backend.connected") : t("backend.offline");
  const backendDotClass = backendOnline === null ? "bg-amber-400" : backendOnline ? "bg-emerald-400" : "bg-rose-400";

  return (
    <aside
      className={`rail${isMobile ? " rail--mobile" : ""}`}
      style={isMobile ? undefined : { width: collapsed ? RAIL_COLLAPSED : RAIL_EXPANDED }}
    >
      {isMobile ? (
        <div className="rail-mobile-bar">
          <div className="rail-brand">
            <div className="rail-brand-mark">P</div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div className="rail-brand-name">{t("app.name")}</div>
            </div>
          </div>
          <button
            type="button"
            className="rail-mobile-menu-btn"
            onClick={() => setMobileOpen(true)}
            aria-label={t("rail.menu")}
            aria-expanded={mobileOpen}
          >
            <Menu width={18} height={18} />
          </button>
        </div>
      ) : (
      <div className="rail-header">
        {!collapsed && (
          <div className="rail-brand">
            <div className="rail-brand-mark">P</div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div className="rail-brand-name">{t("app.name")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-2xs)", color: "var(--fg-3)" }}>
                <span>{t("app.tagline")}</span>
                <span>🇨🇭</span>
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          aria-label={collapsed ? t("rail.expandSidebar") : t("rail.collapseSidebar")}
          className="rail-toggle-btn"
          onClick={toggleRail}
          style={{ transform: collapsed ? "scaleX(-1)" : "none" }}
        >
          <SidebarCollapse width={15} height={15} />
        </button>
      </div>
      )}

      {isMobile && mobileOpen && (
        <div className="rail-mobile-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <div
        className={`rail-content${isMobile && mobileOpen ? " open" : ""}`}
        aria-hidden={isMobile && !mobileOpen ? true : undefined}
      >
        {isMobile && (
          <div className="rail-mobile-drawer-head">
            <span className="rail-mobile-drawer-title">{t("app.name")}</span>
            <button
              type="button"
              className="rail-mobile-menu-btn"
              onClick={() => setMobileOpen(false)}
              aria-label={t("rail.closeMenu")}
            >
              <Xmark width={17} height={17} />
            </button>
          </div>
        )}
      {/* Nav */}
      <nav className="rail-body">
        {Object.entries(grouped).map(([section, sectionItems], index, allSections) => {
          if (collapsed) {
            return (
              <React.Fragment key={section}>
                {sectionItems.map((item) => renderItemButton(item))}
                {index < allSections.length - 1 && (
                  <div style={{ margin: "4px 8px", height: 1, background: "var(--border)" }} aria-hidden="true" />
                )}
              </React.Fragment>
            );
          }
          return (
            <div key={section} className="rail-section">
              <div className="rail-section-label">{section}</div>
              {sectionItems.map((item) => renderItemButton(item))}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="rail-footer-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "var(--fs-2xs)",
            color: "var(--fg-3)",
            padding: collapsed ? "2px 0" : "2px 4px",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          <span
            aria-label={`${t("backend.label")}: ${backendStatusLabel}`}
            className={`h-1.5 w-1.5 rounded-full ${backendDotClass}`}
          />
          {!collapsed && (
            <span>
              {t("backend.label")} {backendStatusLabel}
            </span>
          )}
        </div>

        {/* Density */}
        {!collapsed ? (
          <div className="rail-density-row">
            <button
              type="button"
              className={`rail-density-btn${density === "pro" ? " active" : ""}`}
              onClick={() => density !== "pro" && changeDensity()}
              disabled={disabled}
              title={t("rail.pro")}
            >
              <DashboardSpeed width={13} height={13} />
              <span>{t("rail.pro")}</span>
            </button>
            <button
              type="button"
              className={`rail-density-btn${density === "comfort" ? " active" : ""}`}
              onClick={() => density !== "comfort" && changeDensity()}
              disabled={disabled}
              title={t("rail.comfort")}
            >
              <Sofa width={13} height={13} />
              <span>{t("rail.comfort")}</span>
            </button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="rail-btn"
              style={{ justifyContent: "center" }}
              onClick={changeDensity}
              disabled={disabled}
              onMouseEnter={(event) =>
                showTooltipOnHover("__density", density === "comfort" ? t("rail.comfort") : t("rail.pro"), event.currentTarget)
              }
              onMouseLeave={() => hideTooltip("__density")}
            >
              <span className="rail-icon">
                {density === "comfort" ? <Sofa width={15} height={15} /> : <DashboardSpeed width={15} height={15} />}
              </span>
            </button>
          </div>
        )}

        {/* Language */}
        {!collapsed ? (
          <div className="rail-theme-row">
            <button
              type="button"
              className={`rail-density-btn${uiLanguage === "de" ? " active" : ""}`}
              onClick={() => changeLanguage("de")}
              disabled={disabled}
              title="Deutsch"
            >
              <FlagIcon lang="de" />
              <span>DE</span>
            </button>
            <button
              type="button"
              className={`rail-density-btn${uiLanguage === "en" ? " active" : ""}`}
              onClick={() => changeLanguage("en")}
              disabled={disabled}
              title="English"
            >
              <FlagIcon lang="en" />
              <span>EN</span>
            </button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="rail-btn"
              style={{ justifyContent: "center" }}
              onClick={() => changeLanguage(uiLanguage === "de" ? "en" : "de")}
              disabled={disabled}
              onMouseEnter={(event) => showTooltipOnHover("__language", uiLanguage.toUpperCase(), event.currentTarget)}
              onMouseLeave={() => hideTooltip("__language")}
            >
              <span className="rail-icon">
                <Language width={15} height={15} />
              </span>
            </button>
          </div>
        )}

        {/* Theme */}
        {!collapsed ? (
          <div className="rail-theme-row">
            <button
              type="button"
              className={`rail-density-btn${theme === "light" ? " active" : ""}`}
              onClick={() => theme !== "light" && changeTheme()}
              disabled={disabled}
              title={t("rail.lightMode")}
            >
              <SunLight width={13} height={13} />
              <span>{t("rail.lightMode")}</span>
            </button>
            <button
              type="button"
              className={`rail-density-btn${theme === "dark" ? " active" : ""}`}
              onClick={() => theme !== "dark" && changeTheme()}
              disabled={disabled}
              title={t("rail.darkMode")}
            >
              <HalfMoon width={13} height={13} />
              <span>{t("rail.darkMode")}</span>
            </button>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="rail-btn"
              style={{ justifyContent: "center" }}
              onClick={changeTheme}
              disabled={disabled}
              onMouseEnter={(event) =>
                showTooltipOnHover("__theme", theme === "dark" ? t("rail.darkMode") : t("rail.lightMode"), event.currentTarget)
              }
              onMouseLeave={() => hideTooltip("__theme")}
            >
              <span className="rail-icon">
                {theme === "dark" ? <HalfMoon width={15} height={15} /> : <SunLight width={15} height={15} />}
              </span>
            </button>
          </div>
        )}

        {/* User / Account menu */}
        <div
          ref={userBtnRef}
          className={`rail-user${collapsed ? " rail-user-collapsed" : ""}`}
          style={{
            marginTop: 4,
            cursor: disabled ? "default" : "pointer",
            border: userMenuOpen ? "1px solid var(--border)" : "1px solid transparent",
            background: userMenuOpen ? "var(--surface-2)" : "transparent",
            transition: "background 0.12s, border-color 0.12s",
          }}
          onClick={() => !disabled && setUserMenuOpen((open) => !open)}
          onMouseEnter={(event) => {
            if (!userMenuOpen) event.currentTarget.style.background = "var(--surface-2)";
            showTooltipOnHover("__user", userName, event.currentTarget);
          }}
          onMouseLeave={(event) => {
            if (!userMenuOpen) event.currentTarget.style.background = "transparent";
            hideTooltip("__user");
          }}
        >
          <div className="rail-avatar">{userName.slice(0, 2).toUpperCase()}</div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--fg-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {userName}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {userMenuOpen && (
        <UserAccountMenu
          userName={userName}
          anchorRef={userBtnRef}
          onClose={() => setUserMenuOpen(false)}
          onLogout={() => {
            setUserMenuOpen(false);
            onLogout();
          }}
          onOpenSettings={() => {
            setUserMenuOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}

      {settingsOpen && createPortal(
          <SettingsModal onClose={() => setSettingsOpen(false)} onProfileRenamed={onProfileRenamed} />,
          document.body,
        )}

      {/* Tooltip (collapsed only) */}
      {collapsed && (
        <div
          className={`popover-smooth pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-xs ${
            tooltipVisibleId ? "popover-open translate-x-0" : "popover-closed translate-x-1"
          }`}
          style={{
            top: tooltipPosition?.top ?? -9999,
            left: tooltipPosition?.left ?? -9999,
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--fg-1)",
            boxShadow: "var(--shadow-card)",
          }}
          aria-hidden={tooltipVisibleId ? "false" : "true"}
        >
          {tooltipLabel}
        </div>
      )}
    </aside>
  );
};
