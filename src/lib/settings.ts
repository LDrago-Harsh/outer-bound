import { settingsRepo, type AppSettings } from "./db";

export const SETTINGS_ID = "app";

export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const;

export function defaultSettings(): AppSettings {
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // keep UTC
  }
  return {
    id: SETTINGS_ID,
    appName: "Outerbound",
    timezone,
    dateFormat: "YYYY-MM-DD",
    defaultSmtpId: "",
    batchSize: 50,
    defaultDelaySeconds: 5,
    stopOnFirstError: false,
    defaultSource: "",
    rememberMapping: true,
    skipDuplicateDetection: false,
    theme: "system",
    density: "comfortable",
    updatedAt: new Date().toISOString(),
  };
}

// Cached copy so synchronous helpers (formatDate) can use preferences.
let cachedSettings: AppSettings | null = null;

export const SETTINGS_CHANGED_EVENT = "outerbound:settings-changed";

export function notifySettingsChanged(): void {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const all = await settingsRepo.getAll();
    const stored = all.find((s) => s.id === SETTINGS_ID);
    cachedSettings = stored ? { ...defaultSettings(), ...stored } : defaultSettings();
  } catch {
    cachedSettings = defaultSettings();
  }
  return cachedSettings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  cachedSettings = { ...settings, id: SETTINGS_ID, updatedAt: new Date().toISOString() };
  await settingsRepo.put(cachedSettings);
  notifySettingsChanged();
}

// Formats a date-only value using the configured date format.
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  switch (cachedSettings?.dateFormat) {
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    default:
      return `${yyyy}-${mm}-${dd}`;
  }
}
