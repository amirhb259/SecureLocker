export type QuickAction = "add-password" | "search-vault" | "lock-vault" | "open-security" | "open-activity" | "check-updates" | "manage-sessions" | "export-data";

export type SettingsPreferences = {
  activityRetentionDays: string;
  autoLockMinutes: string;
  checkForUpdatesOnStartup: boolean;
  clipboardClearSeconds: string;
  compactVault: boolean;
  defaultCategory: string;
  exportFormat: string;
  hideSensitiveInformation: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  passwordLength: string;
  quickActions: QuickAction[];
  requirePasswordConfirmation: boolean;
  startWithWindows: boolean;
  themeMode: string;
};

export const settingsPreferencesStorageKey = "securelocker.settings.preferences.v1";

export const defaultSettingsPreferences: SettingsPreferences = {
  activityRetentionDays: "90",
  autoLockMinutes: "15",
  checkForUpdatesOnStartup: true,
  clipboardClearSeconds: "30",
  compactVault: false,
  defaultCategory: "Social",
  exportFormat: "encrypted-json",
  hideSensitiveInformation: false,
  includeNumbers: true,
  includeSymbols: true,
  passwordLength: "18",
  quickActions: ["add-password", "search-vault", "open-security"],
  requirePasswordConfirmation: true,
  startWithWindows: false,
  themeMode: "system",
};

export function normalizeSettingsPreferences(value: Partial<SettingsPreferences> | null | undefined): SettingsPreferences {
  const stored = value ?? {};
  return {
    activityRetentionDays:
      typeof stored.activityRetentionDays === "string" ? stored.activityRetentionDays : defaultSettingsPreferences.activityRetentionDays,
    autoLockMinutes: typeof stored.autoLockMinutes === "string" ? stored.autoLockMinutes : defaultSettingsPreferences.autoLockMinutes,
    checkForUpdatesOnStartup:
      typeof stored.checkForUpdatesOnStartup === "boolean"
        ? stored.checkForUpdatesOnStartup
        : defaultSettingsPreferences.checkForUpdatesOnStartup,
    clipboardClearSeconds:
      typeof stored.clipboardClearSeconds === "string" ? stored.clipboardClearSeconds : defaultSettingsPreferences.clipboardClearSeconds,
    compactVault: typeof stored.compactVault === "boolean" ? stored.compactVault : defaultSettingsPreferences.compactVault,
    defaultCategory: typeof stored.defaultCategory === "string" ? stored.defaultCategory : defaultSettingsPreferences.defaultCategory,
    exportFormat: typeof stored.exportFormat === "string" ? stored.exportFormat : defaultSettingsPreferences.exportFormat,
    hideSensitiveInformation:
      typeof stored.hideSensitiveInformation === "boolean"
        ? stored.hideSensitiveInformation
        : defaultSettingsPreferences.hideSensitiveInformation,
    includeNumbers: typeof stored.includeNumbers === "boolean" ? stored.includeNumbers : defaultSettingsPreferences.includeNumbers,
    includeSymbols: typeof stored.includeSymbols === "boolean" ? stored.includeSymbols : defaultSettingsPreferences.includeSymbols,
    passwordLength: typeof stored.passwordLength === "string" ? stored.passwordLength : defaultSettingsPreferences.passwordLength,
    quickActions: Array.isArray(stored.quickActions) && stored.quickActions.length <= 3
      ? stored.quickActions.filter((action) =>
          ["add-password", "search-vault", "lock-vault", "open-security", "open-activity", "check-updates", "manage-sessions", "export-data"].includes(action),
        )
      : defaultSettingsPreferences.quickActions,
    requirePasswordConfirmation:
      typeof stored.requirePasswordConfirmation === "boolean"
        ? stored.requirePasswordConfirmation
        : defaultSettingsPreferences.requirePasswordConfirmation,
    startWithWindows: typeof stored.startWithWindows === "boolean" ? stored.startWithWindows : defaultSettingsPreferences.startWithWindows,
    themeMode: typeof stored.themeMode === "string" ? stored.themeMode : defaultSettingsPreferences.themeMode,
  };
}

export function readStoredSettingsPreferences() {
  try {
    const raw = window.localStorage.getItem(settingsPreferencesStorageKey);
    return raw ? normalizeSettingsPreferences(JSON.parse(raw) as Partial<SettingsPreferences>) : defaultSettingsPreferences;
  } catch {
    return defaultSettingsPreferences;
  }
}

export function persistSettingsPreferences(preferences: SettingsPreferences) {
  window.localStorage.setItem(settingsPreferencesStorageKey, JSON.stringify(preferences));
}
