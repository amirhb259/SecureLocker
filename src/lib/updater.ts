import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export type UpdateAnnouncement = {
  notes: string[];
  version: string;
};

type PendingUpdatePayload = UpdateAnnouncement & {
  capturedAt: string;
};

type StructuredReleaseNotes = {
  bugFixes?: unknown;
  newFeatures?: unknown;
  newSettings?: unknown;
  securityImprovements?: unknown;
};

type UpdateMetadataLike = {
  body?: string;
  rawJson: Record<string, unknown>;
  version: string;
};

const pendingUpdateStorageKey = "securelocker.update.pending";
const lastShownVersionStorageKey = "securelocker.update.last-shown-version";

export class AppUpdaterError extends Error {
  readonly originalError: unknown;
  readonly stage: "check" | "install";

  constructor(stage: "check" | "install", originalError?: unknown) {
    super(stage === "check" ? "Update check failed." : "Update installation failed.");
    this.name = "AppUpdaterError";
    this.originalError = originalError;
    this.stage = stage;
  }
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function resolveAppVersion(fallbackVersion: string) {
  if (!isTauriRuntime()) return fallbackVersion;

  try {
    return await getVersion();
  } catch {
    return fallbackVersion;
  }
}

export async function runUpdateFlow() {
  if (!isTauriRuntime()) {
    throw new AppUpdaterError("check");
  }

  let update;
  try {
    update = await check({ timeout: 15000 });
  } catch (error) {
    throw new AppUpdaterError("check", error);
  }

  if (!update) {
    return "up-to-date" as const;
  }

  const announcement = buildAnnouncement(update);
  persistPendingAnnouncement(announcement);

  try {
    await update.downloadAndInstall();
  } catch (error) {
    clearPendingAnnouncement(announcement.version);
    throw new AppUpdaterError("install", error);
  }

  try {
    await relaunch();
  } catch {
    // On some platforms the updater exits before relaunch resolves.
  }

  return "installed" as const;
}

export function consumeUpdateAnnouncement(currentVersion: string) {
  const pending = readPendingAnnouncement();
  if (!pending || pending.version !== currentVersion) {
    return null;
  }

  const lastShownVersion = window.localStorage.getItem(lastShownVersionStorageKey);
  if (lastShownVersion === currentVersion) {
    return null;
  }

  return {
    notes: pending.notes,
    version: pending.version,
  } satisfies UpdateAnnouncement;
}

export function dismissUpdateAnnouncement(version: string) {
  window.localStorage.setItem(lastShownVersionStorageKey, version);
  clearPendingAnnouncement(version);
}

function buildAnnouncement(update: UpdateMetadataLike): UpdateAnnouncement {
  const notes = flattenStructuredReleaseNotes(update.rawJson.releaseNotes);
  const normalizedNotes = notes.length > 0 ? notes : splitBulletNotes(update.body);

  return {
    notes: normalizedNotes,
    version: update.version.replace(/^v/i, ""),
  };
}

function flattenStructuredReleaseNotes(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const releaseNotes = value as StructuredReleaseNotes;
  return [
    ...coerceStringArray(releaseNotes.newFeatures),
    ...coerceStringArray(releaseNotes.newSettings),
    ...coerceStringArray(releaseNotes.securityImprovements),
    ...coerceStringArray(releaseNotes.bugFixes),
  ];
}

function splitBulletNotes(value: string | undefined) {
  if (!value) return [];

  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function persistPendingAnnouncement(announcement: UpdateAnnouncement) {
  const payload: PendingUpdatePayload = {
    ...announcement,
    capturedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(pendingUpdateStorageKey, JSON.stringify(payload));
}

function readPendingAnnouncement() {
  try {
    const raw = window.localStorage.getItem(pendingUpdateStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingUpdatePayload>;
    if (typeof parsed.version !== "string" || !Array.isArray(parsed.notes)) {
      return null;
    }

    return {
      capturedAt: typeof parsed.capturedAt === "string" ? parsed.capturedAt : new Date().toISOString(),
      notes: parsed.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0),
      version: parsed.version,
    } satisfies PendingUpdatePayload;
  } catch {
    return null;
  }
}

function clearPendingAnnouncement(version: string) {
  const pending = readPendingAnnouncement();
  if (!pending || pending.version !== version) {
    return;
  }

  window.localStorage.removeItem(pendingUpdateStorageKey);
}
