import { useEffect, useMemo, useState, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  CheckCircle2,
  Clipboard,
  Copy,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MonitorSmartphone,
  Plus,
  RotateCcwKey,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import secureLockerLogo from "../../assets/new-securelocker-logo.png";
import { Button } from "../../components/ui/Button";
import { PasswordField } from "../../components/ui/PasswordField";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/authApi";
import {
  dashboardApi,
  type DashboardActivity,
  type DashboardOverview,
  type MeResponse,
  type SessionDevice,
  type VaultEnvelope,
} from "../../lib/dashboardApi";
import {
  analyzeCredentials,
  createVaultEnvelope,
  decryptCredential,
  emptyCredentialPayload,
  encryptCredential,
  recoverVaultWithKey,
  unlockVaultWithPassword,
  type CredentialPayload,
  type DecryptedCredential,
  type VaultSecret,
} from "../../lib/vaultCrypto";
import "../../styles/dashboard.css";

type DashboardPageProps = {
  initialMe: MeResponse;
  onSignOut: () => void;
};

type SectionId = "overview" | "vault" | "security" | "activity" | "sessions" | "settings";

type Notice = {
  message: string;
  tone: "error" | "success";
};

type CopyTarget = "email" | "password" | "username" | "website";
type SettingsConfirmAction = "clear-logs" | "delete-account" | "delete-vault" | "export-data";

type SettingsPreferences = {
  activityRetentionDays: string;
  autoLockMinutes: string;
  clipboardClearSeconds: string;
  compactVault: boolean;
  defaultCategory: string;
  exportFormat: string;
  hideSensitiveInformation: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  passwordLength: string;
  requirePasswordConfirmation: boolean;
  themeMode: string;
};

const sections: Array<{ icon: typeof LayoutDashboard; id: SectionId; label: string }> = [
  { icon: LayoutDashboard, id: "overview", label: "Overview" },
  { icon: KeyRound, id: "vault", label: "Password Vault" },
  { icon: ShieldCheck, id: "security", label: "Security Center" },
  { icon: Activity, id: "activity", label: "Activity Logs" },
  { icon: MonitorSmartphone, id: "sessions", label: "Sessions & Devices" },
  { icon: Settings, id: "settings", label: "Recovery & Settings" },
];

const categories = ["Social", "Banking", "Gaming", "Work", "Shopping", "Personal", "Custom"];

const defaultSettingsPreferences: SettingsPreferences = {
  activityRetentionDays: "90",
  autoLockMinutes: "15",
  clipboardClearSeconds: "30",
  compactVault: false,
  defaultCategory: "Social",
  exportFormat: "encrypted-json",
  hideSensitiveInformation: false,
  includeNumbers: true,
  includeSymbols: true,
  passwordLength: "18",
  requirePasswordConfirmation: true,
  themeMode: "system",
};

const settingsPreferencesStorageKey = "securelocker.settings.preferences.v1";

function normalizeSettingsPreferences(value: Partial<SettingsPreferences> | null | undefined): SettingsPreferences {
  const stored = value ?? {};
  return {
    activityRetentionDays:
      typeof stored.activityRetentionDays === "string" ? stored.activityRetentionDays : defaultSettingsPreferences.activityRetentionDays,
    autoLockMinutes: typeof stored.autoLockMinutes === "string" ? stored.autoLockMinutes : defaultSettingsPreferences.autoLockMinutes,
    clipboardClearSeconds:
      typeof stored.clipboardClearSeconds === "string" ? stored.clipboardClearSeconds : defaultSettingsPreferences.clipboardClearSeconds,
    compactVault: typeof stored.compactVault === "boolean" ? stored.compactVault : defaultSettingsPreferences.compactVault,
    defaultCategory: typeof stored.defaultCategory === "string" ? stored.defaultCategory : defaultSettingsPreferences.defaultCategory,
    exportFormat: typeof stored.exportFormat === "string" ? stored.exportFormat : defaultSettingsPreferences.exportFormat,
    includeNumbers: typeof stored.includeNumbers === "boolean" ? stored.includeNumbers : defaultSettingsPreferences.includeNumbers,
    includeSymbols: typeof stored.includeSymbols === "boolean" ? stored.includeSymbols : defaultSettingsPreferences.includeSymbols,
    passwordLength: typeof stored.passwordLength === "string" ? stored.passwordLength : defaultSettingsPreferences.passwordLength,
    requirePasswordConfirmation:
      typeof stored.requirePasswordConfirmation === "boolean"
        ? stored.requirePasswordConfirmation
        : defaultSettingsPreferences.requirePasswordConfirmation,
    themeMode: typeof stored.themeMode === "string" ? stored.themeMode : defaultSettingsPreferences.themeMode,
    hideSensitiveInformation: typeof stored.hideSensitiveInformation === "boolean" ? stored.hideSensitiveInformation : defaultSettingsPreferences.hideSensitiveInformation,
  };
}

function readStoredSettingsPreferences() {
  try {
    const raw = window.localStorage.getItem(settingsPreferencesStorageKey);
    return raw ? normalizeSettingsPreferences(JSON.parse(raw) as Partial<SettingsPreferences>) : defaultSettingsPreferences;
  } catch {
    return defaultSettingsPreferences;
  }
}

function persistSettingsPreferences(preferences: SettingsPreferences) {
  window.localStorage.setItem(settingsPreferencesStorageKey, JSON.stringify(preferences));
}

function friendlyError(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : "SecureLocker could not complete the request.";
}

function formatDate(value?: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDevice(userAgent: string | null) {
  if (!userAgent) return "SecureLocker desktop session";
  if (userAgent.includes("Windows")) return "Windows desktop";
  if (userAgent.includes("Mac")) return "macOS desktop";
  if (userAgent.includes("Linux")) return "Linux desktop";
  return userAgent.slice(0, 72);
}

function parseTags(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isUrlLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/\s/.test(trimmed)) return false;

  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    return Boolean(url.hostname.includes(".") || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function domainFromUrl(value: string) {
  if (!value.trim()) return "No website saved";
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function maskText(value: string, type: "username" | "email" | "password" | "generic"): string {
  if (!value) return value;
  if (type === "password") return "••••••••••••";
  if (type === "email") {
    const [local, domain] = value.split("@");
    if (!domain) return "••••••";
    const [dName, tld] = domain.split(".");
    return `${"•".repeat(Math.min(local.length, 3))}@${"•".repeat(Math.min(dName.length, 3))}.${tld ?? "com"}`;
  }
  if (type === "username") {
    return value.length <= 2 ? "••" : value[0] + "•".repeat(value.length - 2) + value[value.length - 1];
  }
  return "••••••";
}

export function DashboardPage({ initialMe, onSignOut }: DashboardPageProps) {
  const [me, setMe] = useState(initialMe);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<string>("general");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [vaultEnvelope, setVaultEnvelope] = useState<VaultEnvelope | null>(null);
  const [vaultSecret, setVaultSecret] = useState<VaultSecret | null>(null);
  const [credentials, setCredentials] = useState<DecryptedCredential[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (notice) {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = window.setTimeout(() => {
        setNotice(null);
        noticeTimerRef.current = null;
      }, 2000);
    }

    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [notice]);

  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newVaultPassword, setNewVaultPassword] = useState("");
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [editingCredential, setEditingCredential] = useState<DecryptedCredential | null>(null);
  const [credentialForm, setCredentialForm] = useState<CredentialPayload>(() => emptyCredentialPayload());
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryFormError, setEntryFormError] = useState("");
  const [showEntryPassword, setShowEntryPassword] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [confirmAccountPassword, setConfirmAccountPassword] = useState("");
  const [settingsPreferences, setSettingsPreferences] = useState<SettingsPreferences>(() => readStoredSettingsPreferences());
  const [settingsConfirmAction, setSettingsConfirmAction] = useState<SettingsConfirmAction | null>(null);
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState("");
  const [settingsConfirmError, setSettingsConfirmError] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalError, setPasswordModalError] = useState("");

  // Theme sync effect
  useEffect(() => {
    const theme = settingsPreferences.themeMode;
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [settingsPreferences.themeMode]);

  const securityAnalysis = useMemo(() => analyzeCredentials(credentials), [credentials]);
  const filteredCredentials = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return credentials;
    return credentials.filter((credential) => {
      const category = credential.category === "Custom" ? credential.customCategory : credential.category;
      const customValues = credential.customFields.flatMap((field) => [field.key, field.value]);
      return [
        credential.title,
        category,
        credential.website,
        credential.username,
        credential.email,
        credential.notes,
        ...credential.tags,
        ...customValues,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [credentials, searchQuery]);

  const lastActivity = activity[0]?.timestamp ?? overview?.lastActivity?.timestamp ?? null;
  const vaultUnlocked = Boolean(vaultSecret);

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setIsLoading(true);
      const [profile, nextOverview, nextActivity, nextSessions] = await Promise.all([
        dashboardApi.getMe(),
        dashboardApi.getOverview(),
        dashboardApi.getActivity(),
        dashboardApi.getSessions(),
      ]);
      setMe(profile);
      setOverview(nextOverview);
      setActivity(nextActivity.activity);
      setSessions(nextSessions.sessions);
      if (profile.vaultConfigured) {
        const envelope = await dashboardApi.getVaultEnvelope();
        setVaultEnvelope(envelope.vault);
      }
    } catch (error) {
      setNotice({ message: friendlyError(error), tone: "error" });
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshActivity() {
    const [nextOverview, nextActivity, nextSessions] = await Promise.all([
      dashboardApi.getOverview(),
      dashboardApi.getActivity(),
      dashboardApi.getSessions(),
    ]);
    setOverview(nextOverview);
    setActivity(nextActivity.activity);
    setSessions(nextSessions.sessions);
  }

  async function loadCredentials(secret: VaultSecret) {
    const encrypted = await dashboardApi.getCredentials();
    const decrypted = await Promise.all(encrypted.credentials.map((credential) => decryptCredential(secret, credential)));
    setCredentials(decrypted);
  }

  async function handleSetupVault(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (setupPassword.length < 10 || setupPassword !== setupConfirm) {
      setNotice({ message: "Vault passwords must match and use at least 10 characters.", tone: "error" });
      return;
    }

    try {
      setBusyAction("setup-vault");
      const created = await createVaultEnvelope(setupPassword);
      const response = await dashboardApi.createVault(created.envelope);
      setVaultEnvelope(response.vault);
      setVaultSecret(created.secret);
      setGeneratedRecoveryKey(created.recoveryKey);
      setSetupPassword("");
      setSetupConfirm("");
      setMe((current) => ({ ...current, vaultConfigured: true }));
      await loadCredentials(created.secret);
      await refreshActivity();
      setNotice({ message: "Vault created and unlocked.", tone: "success" });
    } catch (error) {
      setNotice({ message: friendlyError(error), tone: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUnlockVault(event: FormEvent) {
    event.preventDefault();
    if (!vaultEnvelope) return;

    try {
      setBusyAction("unlock-vault");
      const secret = await unlockVaultWithPassword(vaultEnvelope, unlockPassword);
      setVaultSecret(secret);
      setUnlockPassword("");
      await dashboardApi.recordVaultActivity("unlocked");
      await loadCredentials(secret);
      await refreshActivity();
      setNotice({ message: "Vault unlocked.", tone: "success" });
    } catch {
      setNotice({ message: "Vault password is incorrect.", tone: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRecoverVault(event: FormEvent) {
    event.preventDefault();
    if (!vaultEnvelope) return;
    if (newVaultPassword.length < 10) {
      setNotice({ message: "New vault password must be at least 10 characters.", tone: "error" });
      return;
    }

    try {
      setBusyAction("recover-vault");
      const recovered = await recoverVaultWithKey(vaultEnvelope, recoveryKey, newVaultPassword);
      const response = await dashboardApi.updateVaultEnvelope(recovered.envelope);
      setVaultEnvelope(response.vault);
      setVaultSecret(recovered.secret);
      setRecoveryKey("");
      setNewVaultPassword("");
      await dashboardApi.recordVaultActivity("unlocked");
      await loadCredentials(recovered.secret);
      await refreshActivity();
      setNotice({ message: "Vault password reset and vault unlocked.", tone: "success" });
    } catch {
      setNotice({ message: "Recovery key could not unlock this vault.", tone: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveCredential(event: FormEvent) {
    event.preventDefault();
    if (!vaultSecret) return;

    const tags = parseTags(tagsInput);
    const customFields = credentialForm.customFields
      .map((field) => ({ ...field, key: field.key.trim(), value: field.value.trim() }))
      .filter((field) => field.key || field.value);
    const incompleteCustomField = customFields.some((field) => !field.key || !field.value);
    const creditCard = credentialForm.creditCard
      ? {
          expiry: credentialForm.creditCard.expiry.trim(),
          holder: credentialForm.creditCard.holder.trim(),
          number: credentialForm.creditCard.number.trim(),
        }
      : null;
    const normalizedCredential: CredentialPayload = {
      ...credentialForm,
      category: credentialForm.category || "Social",
      creditCard: creditCard && (creditCard.expiry || creditCard.holder || creditCard.number) ? creditCard : null,
      customCategory: credentialForm.category === "Custom" ? credentialForm.customCategory.trim() : "",
      customFields,
      email: credentialForm.email.trim(),
      notes: credentialForm.notes.trim(),
      password: credentialForm.password,
      tags,
      title: credentialForm.title.trim(),
      username: credentialForm.username.trim(),
      website: credentialForm.website.trim(),
    };

    if (!normalizedCredential.title || !normalizedCredential.password) {
      setEntryFormError("Title and password are required.");
      return;
    }

    if (!normalizedCredential.username && !normalizedCredential.email) {
      setEntryFormError("Add at least a username or email.");
      return;
    }

    if (!isUrlLike(normalizedCredential.website)) {
      setEntryFormError("Website URL is not valid.");
      return;
    }

    if (normalizedCredential.category === "Custom" && !normalizedCredential.customCategory) {
      setEntryFormError("Custom category name is required.");
      return;
    }

    if (incompleteCustomField) {
      setEntryFormError("Custom fields require both a label and a value.");
      return;
    }

    try {
      setEntryFormError("");
      setBusyAction("save-credential");
      const encrypted = await encryptCredential(vaultSecret, normalizedCredential);
      const response = editingCredential
        ? await dashboardApi.updateCredential(editingCredential.id, encrypted)
        : await dashboardApi.createCredential(encrypted);
      const decrypted = await decryptCredential(vaultSecret, response.credential);
      setCredentials((current) =>
        editingCredential ? current.map((item) => (item.id === decrypted.id ? decrypted : item)) : [decrypted, ...current],
      );
      setCredentialForm(emptyCredentialPayload());
      setEditingCredential(null);
      setEntryModalOpen(false);
      setTagsInput("");
      setShowEntryPassword(false);
      await refreshActivity();
      setNotice({ message: editingCredential ? "Password entry updated." : "Password entry added.", tone: "success" });
    } catch (error) {
      setEntryFormError(friendlyError(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteCredential(id: string) {
    try {
      setBusyAction(`delete-${id}`);
      await dashboardApi.deleteCredential(id);
      setCredentials((current) => current.filter((credential) => credential.id !== id));
      setDeleteId(null);
      await refreshActivity();
      setNotice({ message: "Password entry deleted.", tone: "success" });
    } catch (error) {
      setNotice({ message: friendlyError(error), tone: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCopyValue(credential: DecryptedCredential, target: CopyTarget, value: string) {
    if (!value) {
      setNotice({ message: "There is no saved value to copy.", tone: "error" });
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      const copiedKey = `${credential.id}:${target}`;
      setCopiedTarget(copiedKey);
      await dashboardApi.recordVaultActivity("copied", credential.id);
      await refreshActivity();
      window.setTimeout(
        () => {
          if (target === "password") {
            void navigator.clipboard.writeText("");
          }
          setCopiedTarget((current) => (current === copiedKey ? null : current));
        },
        target === "password" ? 30_000 : 3_000,
      );
    } catch {
      setNotice({ message: "Clipboard is unavailable in this desktop session.", tone: "error" });
    }
  }

  async function handleReveal(credential: DecryptedCredential) {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(credential.id)) {
        next.delete(credential.id);
      } else {
        next.add(credential.id);
        void dashboardApi.recordVaultActivity("revealed", credential.id).then(refreshActivity).catch(() => undefined);
      }
      return next;
    });
  }

  async function handleLockVault() {
    setVaultSecret(null);
    setCredentials([]);
    setRevealedIds(new Set());
    setCredentialForm(emptyCredentialPayload());
    setEditingCredential(null);
    setEntryModalOpen(false);
    setEntryFormError("");
    setTagsInput("");
    await dashboardApi.recordVaultActivity("locked").catch(() => undefined);
    await refreshActivity().catch(() => undefined);
  }

  async function handleRevokeSession(id: string) {
    try {
      setBusyAction(`session-${id}`);
      await dashboardApi.revokeSession(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      setNotice({ message: "Session revoked.", tone: "success" });
    } catch (error) {
      setNotice({ message: friendlyError(error), tone: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (newAccountPassword !== confirmAccountPassword) {
      setPasswordModalError("New account passwords do not match.");
      return;
    }
    if (newAccountPassword.length < 8) {
      setPasswordModalError("Password must be at least 8 characters.");
      return;
    }

    try {
      setBusyAction("change-password");
      await dashboardApi.changePassword(currentPassword, newAccountPassword);
      setCurrentPassword("");
      setNewAccountPassword("");
      setConfirmAccountPassword("");
      setPasswordModalError("");
      setPasswordModalOpen(false);
      await refreshActivity();
      setNotice({ message: "Account password changed. Other sessions were revoked.", tone: "success" });
    } catch (error) {
      setPasswordModalError(friendlyError(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignOut() {
    try {
      setBusyAction("signout");
      await dashboardApi.logout();
    } catch {
      // Local sign-out still protects this desktop if the API is unreachable.
    } finally {
      onSignOut();
    }
  }

  function beginEdit(credential: DecryptedCredential) {
    setEditingCredential(credential);
    setCredentialForm({
      category: credential.category,
      creditCard: credential.creditCard,
      customCategory: credential.customCategory,
      customFields: credential.customFields,
      email: credential.email,
      notes: credential.notes,
      password: credential.password,
      tags: credential.tags,
      title: credential.title,
      username: credential.username,
      website: credential.website,
    });
    setTagsInput(credential.tags.join(", "));
    setEntryFormError("");
    setShowEntryPassword(false);
    setEntryModalOpen(true);
  }

  function beginNewEntry() {
    setEditingCredential(null);
    setCredentialForm(emptyCredentialPayload());
    setTagsInput("");
    setEntryFormError("");
    setShowEntryPassword(false);
    setEntryModalOpen(true);
  }

  function updateCredentialForm(key: keyof CredentialPayload, value: string) {
    setCredentialForm((current) => ({ ...current, [key]: value }));
  }

  function updateCreditCardField(key: "expiry" | "holder" | "number", value: string) {
    setCredentialForm((current) => ({
      ...current,
      creditCard: {
        expiry: current.creditCard?.expiry ?? "",
        holder: current.creditCard?.holder ?? "",
        number: current.creditCard?.number ?? "",
        [key]: value,
      },
    }));
  }

  function addCustomField() {
    setCredentialForm((current) => ({
      ...current,
      customFields: [...current.customFields, { id: crypto.randomUUID(), key: "", value: "" }],
    }));
  }

  function updateCustomField(id: string, key: "key" | "value", value: string) {
    setCredentialForm((current) => ({
      ...current,
      customFields: current.customFields.map((field) => (field.id === id ? { ...field, [key]: value } : field)),
    }));
  }

  function removeCustomField(id: string) {
    setCredentialForm((current) => ({
      ...current,
      customFields: current.customFields.filter((field) => field.id !== id),
    }));
  }

  function closeEntryModal() {
    if (busyAction === "save-credential") return;
    setEntryModalOpen(false);
    setEditingCredential(null);
    setCredentialForm(emptyCredentialPayload());
    setTagsInput("");
    setEntryFormError("");
    setShowEntryPassword(false);
  }

  function updateSettingsPreference<Key extends keyof SettingsPreferences>(key: Key, value: SettingsPreferences[Key]) {
    setSettingsPreferences((current) => {
      const next = { ...current, [key]: value };
      persistSettingsPreferences(next);
      return next;
    });
  }

  function openSettingsConfirmation(action: SettingsConfirmAction) {
    setSettingsConfirmAction(action);
    setSettingsConfirmPassword("");
    setSettingsConfirmError("");
  }

  function closeSettingsConfirmation() {
    if (busyAction?.startsWith("settings-confirm")) return;
    setSettingsConfirmAction(null);
    setSettingsConfirmPassword("");
    setSettingsConfirmError("");
  }

  async function handleSettingsConfirmation(event: FormEvent) {
    event.preventDefault();
    if (!settingsConfirmAction) return;
    if (!settingsConfirmPassword.trim()) {
      setSettingsConfirmError("Password is required.");
      return;
    }

    try {
      setBusyAction(`settings-confirm-${settingsConfirmAction}`);
      if (settingsConfirmAction === "clear-logs") {
        const response = await dashboardApi.clearActivity(settingsConfirmPassword);
        await refreshActivity();
        setNotice({ message: response.message, tone: "success" });
      } else if (settingsConfirmAction === "delete-vault") {
        await dashboardApi.deleteVault(settingsConfirmPassword);
        setVaultEnvelope(null);
        setVaultSecret(null);
        setCredentials([]);
        setMe((current) => ({ ...current, vaultConfigured: false }));
        setNotice({ message: "Vault data deleted successfully.", tone: "success" });
      } else if (settingsConfirmAction === "delete-account") {
        await dashboardApi.deleteAccount(settingsConfirmPassword);
        setNotice({ message: "Account scheduled for deletion.", tone: "success" });
        window.setTimeout(() => onSignOut(), 2000);
      } else {
        setSettingsConfirmError("This secured backend action is not available yet.");
        setBusyAction(null);
        return;
      }
      setSettingsConfirmAction(null);
      setSettingsConfirmPassword("");
      setSettingsConfirmError("");
    } catch (error) {
      setSettingsConfirmError(friendlyError(error));
    } finally {
      setBusyAction(null);
    }
  }

  function openPasswordModal() {
    setPasswordModalOpen(true);
    setPasswordModalError("");
    setCurrentPassword("");
    setNewAccountPassword("");
    setConfirmAccountPassword("");
  }

  function closePasswordModal() {
    if (busyAction === "change-password") return;
    setPasswordModalOpen(false);
    setPasswordModalError("");
    setCurrentPassword("");
    setNewAccountPassword("");
    setConfirmAccountPassword("");
  }

  const displayUsername = settingsPreferences.hideSensitiveInformation ? maskText(me.user.username, "username") : me.user.username;
  const displayEmail = settingsPreferences.hideSensitiveInformation ? maskText(me.user.email, "email") : me.user.email;

  return (
    <main className="dashboard-page">
      <div className="dashboard-ambient" aria-hidden="true" />
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <img src={secureLockerLogo} alt="SecureLocker" />
        </div>
        <nav className="dashboard-nav" aria-label="SecureLocker dashboard">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={clsx("dashboard-nav__item", activeSection === section.id && "dashboard-nav__item--active")}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                <Icon aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="dashboard-signout" disabled={busyAction === "signout"} onClick={() => void handleSignOut()} type="button">
          <LogOut aria-hidden="true" />
          Sign out
        </button>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p>Secure Locker</p>
            <h1>{sections.find((section) => section.id === activeSection)?.label}</h1>
          </div>
          <div className="dashboard-user">
            <span>{displayUsername}</span>
            <small>{displayEmail}</small>
          </div>
        </header>

        <AnimatePresence>
          {notice ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={clsx("dashboard-notice", `dashboard-notice--${notice.tone}`)}
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: -8 }}
            >
              <span>{notice.message}</span>
              <button aria-label="Dismiss message" onClick={() => setNotice(null)} type="button">
                <X aria-hidden="true" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {generatedRecoveryKey ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="recovery-modal"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="recovery-key-title"
            >
              <motion.div animate={{ scale: 1, y: 0 }} className="recovery-modal__panel" initial={{ scale: 0.96, y: 12 }}>
                <h2 id="recovery-key-title">Save your vault recovery key</h2>
                <p>This key can reset your vault password. SecureLocker will not show it again.</p>
                <code>{generatedRecoveryKey}</code>
                <Button onClick={() => setGeneratedRecoveryKey("")}>I saved this key</Button>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {entryModalOpen ? (
            <motion.div
              animate={{ opacity: 1 }}
              aria-labelledby="entry-modal-title"
              aria-modal="true"
              className="entry-modal"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              role="dialog"
            >
              {renderEntryModal()}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {passwordModalOpen ? (
            <motion.div
              animate={{ opacity: 1 }}
              aria-labelledby="password-modal-title"
              aria-modal="true"
              className="password-modal"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              role="dialog"
            >
              {renderPasswordModal()}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>{settingsConfirmAction ? renderSettingsConfirmation() : null}</AnimatePresence>

        {isLoading ? (
          <div className="dashboard-loading">Loading secure dashboard...</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="dashboard-content"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              key={activeSection}
              transition={{ duration: 0.22 }}
            >
              {activeSection === "overview" ? renderOverview() : null}
              {activeSection === "vault" ? renderVault() : null}
              {activeSection === "security" ? renderSecurityCenter() : null}
              {activeSection === "activity" ? renderActivity() : null}
              {activeSection === "sessions" ? renderSessions() : null}
              {activeSection === "settings" ? renderSettings() : null}
            </motion.div>
          </AnimatePresence>
        )}
      </section>
    </main>
  );

  function renderOverview() {
    return (
      <>
        <div className="metric-grid">
          <MetricCard label="Stored passwords" value={String(credentials.length || overview?.totalPasswords || 0)} />
          <MetricCard label="Last activity" value={formatDate(lastActivity)} />
          <MetricCard
            label="Security status"
            value={vaultUnlocked ? (securityAnalysis.status === "secure" ? "Secure" : "Warning") : me.vaultConfigured ? "Vault locked" : "Setup required"}
            tone={vaultUnlocked && securityAnalysis.status === "secure" ? "success" : "warning"}
          />
        </div>

        <div className="dashboard-grid dashboard-grid--two">
          <Panel title="Quick actions">
            <div className="quick-actions">
              <Button
                onClick={() => {
                  setActiveSection("vault");
                  if (vaultUnlocked) beginNewEntry();
                }}
              >
                <Plus aria-hidden="true" />
                Add password
              </Button>
              <Button onClick={() => setActiveSection("vault")} variant="ghost">
                <Search aria-hidden="true" />
                Search vault
              </Button>
              <Button disabled={!vaultUnlocked} onClick={handleLockVault} variant="ghost">
                <Lock aria-hidden="true" />
                Lock vault
              </Button>
            </div>
          </Panel>
          <Panel title="Vault state">
            <StatusLine label="Email verification" ok={me.user.emailVerified} />
            <StatusLine label="Security questions" ok={me.securityQuestionsConfigured} />
            <StatusLine label="Password vault" ok={me.vaultConfigured} />
          </Panel>
        </div>
      </>
    );
  }

  function renderVault() {
    if (!me.vaultConfigured) {
      return (
        <Panel title="Create encrypted vault">
          <form className="dashboard-form" onSubmit={handleSetupVault}>
            <PasswordField id="vault-password" label="Vault password" onChange={setSetupPassword} value={setupPassword} />
            <PasswordField id="vault-confirm" label="Confirm vault password" onChange={setSetupConfirm} value={setupConfirm} />
            <Button loading={busyAction === "setup-vault"} type="submit">
              Create vault
            </Button>
          </form>
        </Panel>
      );
    }

    if (!vaultUnlocked) {
      return (
        <div className="dashboard-grid dashboard-grid--two">
          <Panel title="Unlock vault">
            <form className="dashboard-form" onSubmit={handleUnlockVault}>
              <PasswordField id="unlock-password" label="Vault password" onChange={setUnlockPassword} value={unlockPassword} />
              <Button loading={busyAction === "unlock-vault"} type="submit">
                Unlock vault
              </Button>
            </form>
          </Panel>
          <Panel title="Recover vault access">
            <form className="dashboard-form" onSubmit={handleRecoverVault}>
              <TextField id="recovery-key" label="Recovery key" onChange={setRecoveryKey} value={recoveryKey} />
              <PasswordField id="new-vault-password" label="New vault password" onChange={setNewVaultPassword} value={newVaultPassword} />
              <Button loading={busyAction === "recover-vault"} type="submit" variant="ghost">
                <RotateCcwKey aria-hidden="true" />
                Reset vault password
              </Button>
            </form>
          </Panel>
        </div>
      );
    }

    return (
      <Panel title="Stored credentials">
        <div className="vault-toolbar vault-toolbar--expanded">
          <Button onClick={beginNewEntry}>
            <Plus aria-hidden="true" />
            New
          </Button>
          <TextField id="vault-search" icon={<Search aria-hidden="true" />} label="Search vault" onChange={setSearchQuery} value={searchQuery} />
          <Button onClick={handleLockVault} variant="ghost">
            <Lock aria-hidden="true" />
            Lock
          </Button>
        </div>
        {filteredCredentials.length === 0 ? (
          <div className="empty-state">{credentials.length === 0 ? "No passwords are stored in this vault." : "No entries match your search."}</div>
        ) : (
          <div className="credential-list credential-list--cards">
            {filteredCredentials.map((credential) => {
              const category = credential.category === "Custom" ? credential.customCategory : credential.category;
              const primaryIdentity = credential.username || credential.email;
              const maskedIdentity = settingsPreferences.hideSensitiveInformation && !revealedIds.has(credential.id)
                ? maskText(primaryIdentity, primaryIdentity.includes("@") ? "email" : "username")
                : primaryIdentity;
              const displayPassword = revealedIds.has(credential.id)
                ? credential.password
                : settingsPreferences.hideSensitiveInformation
                  ? maskText(credential.password, "password")
                  : "••••••••••••";

              return (
                <article className="credential-card" key={credential.id}>
                  <div className="credential-card__main">
                    <div className="credential-card__title">
                      <span className="category-pill">{category || "Uncategorized"}</span>
                      <strong>{credential.title}</strong>
                    </div>
                    <span className="credential-card__meta">
                      <Globe2 aria-hidden="true" />
                      {domainFromUrl(credential.website)}
                    </span>
                    <span className="credential-card__meta">
                      <UserRound aria-hidden="true" />
                      {maskedIdentity || "No username or email saved"}
                    </span>
                    {credential.tags.length ? (
                      <div className="tag-list">
                        {credential.tags.map((tag) => (
                          <span className="tag-chip" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="credential-card__secret">
                    <code>{displayPassword}</code>
                    <div className="row-actions">
                      <IconButton label={revealedIds.has(credential.id) ? "Hide password" : "Show password"} onClick={() => void handleReveal(credential)}>
                        {revealedIds.has(credential.id) ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </IconButton>
                      <IconButton
                        label={copiedTarget === `${credential.id}:password` ? "Password copied" : "Copy password"}
                        onClick={() => void handleCopyValue(credential, "password", credential.password)}
                      >
                        <Clipboard aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={copiedTarget === `${credential.id}:username` ? "Username copied" : "Copy username"}
                        onClick={() => void handleCopyValue(credential, "username", credential.username)}
                      >
                        <UserRound aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={copiedTarget === `${credential.id}:email` ? "Email copied" : "Copy email"}
                        onClick={() => void handleCopyValue(credential, "email", credential.email)}
                      >
                        <Mail aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={copiedTarget === `${credential.id}:website` ? "Website copied" : "Copy website"}
                        onClick={() => void handleCopyValue(credential, "website", credential.website)}
                      >
                        <Copy aria-hidden="true" />
                      </IconButton>
                      <IconButton label="Edit entry" onClick={() => beginEdit(credential)}>
                        <Edit3 aria-hidden="true" />
                      </IconButton>
                      <IconButton label="Delete entry" onClick={() => setDeleteId(credential.id)}>
                        <Trash2 aria-hidden="true" />
                      </IconButton>
                    </div>
                  </div>
                  {deleteId === credential.id ? (
                    <div className="delete-confirm">
                      <span>Delete this password entry?</span>
                      <button disabled={busyAction === `delete-${credential.id}`} onClick={() => void handleDeleteCredential(credential.id)} type="button">
                        Delete
                      </button>
                      <button onClick={() => setDeleteId(null)} type="button">
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    );
  }

  function renderEntryModal() {
    const creditCardOpen = Boolean(credentialForm.creditCard);

    return (
      <motion.form
        animate={{ scale: 1, y: 0 }}
        className="entry-modal__panel"
        exit={{ scale: 0.98, y: 10 }}
        initial={{ scale: 0.98, y: 10 }}
        onSubmit={handleSaveCredential}
      >
        <header className="entry-modal__header">
          <div>
            <p>Encrypted vault entry</p>
            <h2 id="entry-modal-title">{editingCredential ? "Edit entry" : "New entry"}</h2>
          </div>
          <button aria-label="Close entry form" onClick={closeEntryModal} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        {entryFormError ? <div className="entry-form-error">{entryFormError}</div> : null}

        <div className="entry-modal__body">
          <section className="entry-section">
            <h3>Identity</h3>
            <div className="entry-grid entry-grid--two">
              <TextField id="entry-title" label="Title / Name" onChange={(value) => updateCredentialForm("title", value)} value={credentialForm.title} />
              <label className="dashboard-select-field">
                <span>Category</span>
                <select
                  className="dashboard-select"
                  onChange={(event) => updateCredentialForm("category", event.currentTarget.value)}
                  value={credentialForm.category}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {credentialForm.category === "Custom" ? (
              <TextField
                id="entry-custom-category"
                label="Custom category"
                onChange={(value) => updateCredentialForm("customCategory", value)}
                value={credentialForm.customCategory}
              />
            ) : null}
          </section>

          <section className="entry-section">
            <h3>Login</h3>
            <div className="entry-grid entry-grid--two">
              <TextField id="entry-website" label="Website URL" onChange={(value) => updateCredentialForm("website", value)} value={credentialForm.website} />
              <TextField id="entry-username" label="Username" onChange={(value) => updateCredentialForm("username", value)} value={credentialForm.username} />
              <TextField id="entry-email" label="Email" onChange={(value) => updateCredentialForm("email", value)} type="email" value={credentialForm.email} />
              <PasswordField
                action={
                  <button className="password-inline-action" onClick={() => setShowEntryPassword((current) => !current)} type="button">
                    {showEntryPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                }
                id="entry-password"
                label="Password"
                onChange={(value) => updateCredentialForm("password", value)}
                value={credentialForm.password}
                visible={showEntryPassword}
              />
            </div>
          </section>

          <section className="entry-section">
            <h3>Notes and tags</h3>
            <label className="dashboard-textarea">
              <span>Notes</span>
              <textarea onChange={(event) => updateCredentialForm("notes", event.currentTarget.value)} value={credentialForm.notes} />
            </label>
            <TextField
              id="entry-tags"
              icon={<Tags aria-hidden="true" />}
              label="Tags"
              onChange={setTagsInput}
              placeholder="security, work, shared"
              value={tagsInput}
            />
          </section>

          <section className="entry-section">
            <button
              className="optional-section-toggle"
              onClick={() =>
                setCredentialForm((current) => ({
                  ...current,
                  creditCard: current.creditCard ? null : { expiry: "", holder: "", number: "" },
                }))
              }
              type="button"
            >
              <CreditCard aria-hidden="true" />
              <span>Credit card</span>
              <small>{creditCardOpen ? "Enabled" : "Optional"}</small>
            </button>
            {creditCardOpen ? (
              <div className="entry-grid entry-grid--three">
                <TextField
                  id="entry-card-number"
                  label="Card number"
                  onChange={(value) => updateCreditCardField("number", value)}
                  value={credentialForm.creditCard?.number ?? ""}
                />
                <TextField
                  id="entry-card-expiry"
                  label="Expiry"
                  onChange={(value) => updateCreditCardField("expiry", value)}
                  placeholder="MM/YY"
                  value={credentialForm.creditCard?.expiry ?? ""}
                />
                <TextField
                  id="entry-card-holder"
                  label="Card holder"
                  onChange={(value) => updateCreditCardField("holder", value)}
                  value={credentialForm.creditCard?.holder ?? ""}
                />
              </div>
            ) : null}
          </section>

          <section className="entry-section">
            <div className="entry-section__heading">
              <h3>Custom fields</h3>
              <button className="mini-action" onClick={addCustomField} type="button">
                <Plus aria-hidden="true" />
                Add field
              </button>
            </div>
            {credentialForm.customFields.length === 0 ? (
              <p className="entry-section__empty">No custom fields added.</p>
            ) : (
              <div className="custom-field-list">
                {credentialForm.customFields.map((field) => (
                  <div className="custom-field-row" key={field.id}>
                    <TextField id={`custom-key-${field.id}`} label="Label" onChange={(value) => updateCustomField(field.id, "key", value)} value={field.key} />
                    <TextField id={`custom-value-${field.id}`} label="Value" onChange={(value) => updateCustomField(field.id, "value", value)} value={field.value} />
                    <button aria-label="Remove custom field" className="icon-button" onClick={() => removeCustomField(field.id)} type="button">
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="entry-modal__footer">
          <Button loading={busyAction === "save-credential"} type="submit">
            {editingCredential ? "Save changes" : "Save entry"}
          </Button>
          <Button onClick={closeEntryModal} variant="ghost">
            Cancel
          </Button>
        </footer>
      </motion.form>
    );
  }

  function renderPasswordModal() {
    return (
      <motion.form
        animate={{ scale: 1, y: 0 }}
        className="password-modal__panel"
        exit={{ scale: 0.98, y: 10 }}
        initial={{ scale: 0.98, y: 10 }}
        onSubmit={handleChangePassword}
      >
        <header className="password-modal__header">
          <h2 id="password-modal-title">Change password</h2>
          <button aria-label="Close password form" onClick={closePasswordModal} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="password-modal__body">
          {passwordModalError ? <div className="entry-form-error">{passwordModalError}</div> : null}
          <PasswordField
            autoComplete="current-password"
            id="current-password"
            label="Current password"
            onChange={setCurrentPassword}
            value={currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            id="new-password"
            label="New password"
            onChange={setNewAccountPassword}
            value={newAccountPassword}
          />
          <PasswordField
            autoComplete="new-password"
            id="confirm-password"
            label="Confirm new password"
            onChange={setConfirmAccountPassword}
            value={confirmAccountPassword}
          />
        </div>
        <footer className="password-modal__footer">
          <Button loading={busyAction === "change-password"} type="submit">
            Change password
          </Button>
          <Button onClick={closePasswordModal} variant="ghost">
            Cancel
          </Button>
        </footer>
      </motion.form>
    );
  }

  function renderSettingsConfirmation() {
    if (!settingsConfirmAction) return null;

    const details: Record<SettingsConfirmAction, { actionLabel: string; description: string; title: string }> = {
      "clear-logs": {
        actionLabel: "Clear logs",
        description: "Confirm your account password before clearing activity logs from this dashboard view.",
        title: "Clear activity logs",
      },
      "delete-account": {
        actionLabel: "Delete account",
        description: "Confirm your account password before scheduling account deletion. This action is irreversible.",
        title: "Delete account",
      },
      "delete-vault": {
        actionLabel: "Delete vault data",
        description: "Confirm your account password before deleting all vault data. This action is irreversible.",
        title: "Delete vault data",
      },
      "export-data": {
        actionLabel: "Request export",
        description: "Confirm your account password before requesting an encrypted data export.",
        title: "Export account data",
      },
    };
    const current = details[settingsConfirmAction];
    const isBusy = busyAction === `settings-confirm-${settingsConfirmAction}`;

    return (
      <motion.div
        animate={{ opacity: 1 }}
        aria-labelledby="settings-confirm-title"
        aria-modal="true"
        className="settings-confirm"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        role="dialog"
      >
        <motion.form
          animate={{ scale: 1, y: 0 }}
          className="settings-confirm__panel"
          exit={{ scale: 0.98, y: 10 }}
          initial={{ scale: 0.98, y: 10 }}
          onSubmit={handleSettingsConfirmation}
        >
          <header className="settings-confirm__header">
            <div>
              <p>Secure confirmation</p>
              <h2 id="settings-confirm-title">{current.title}</h2>
            </div>
            <button aria-label="Close confirmation" disabled={isBusy} onClick={closeSettingsConfirmation} type="button">
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="settings-confirm__body">
            <p>{current.description}</p>
            <PasswordField
              autoComplete="current-password"
              id="settings-confirm-password"
              label="Account password"
              onChange={setSettingsConfirmPassword}
              value={settingsConfirmPassword}
            />
            {settingsConfirmError ? <div className="entry-form-error">{settingsConfirmError}</div> : null}
          </div>
          <footer className="settings-confirm__footer">
            <Button loading={isBusy} type="submit" variant={settingsConfirmAction === "export-data" ? "primary" : "ghost"}>
              {settingsConfirmAction === "export-data" ? <Clipboard aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
              {current.actionLabel}
            </Button>
            <Button disabled={isBusy} onClick={closeSettingsConfirmation} variant="ghost">
              Cancel
            </Button>
          </footer>
        </motion.form>
      </motion.div>
    );
  }

  function renderSecurityCenter() {
    return (
      <div className="dashboard-grid dashboard-grid--two">
        <Panel title="Security score">
          <div className="score-ring">
            <span>{vaultUnlocked ? securityAnalysis.score : "--"}</span>
          </div>
          <p className="panel-copy">{vaultUnlocked ? "Score is calculated locally from decrypted vault entries." : "Unlock the vault to calculate password health."}</p>
        </Panel>
        <Panel title="Password findings">
          <StatusLine label="Weak passwords" ok={vaultUnlocked && securityAnalysis.weakCount === 0} value={vaultUnlocked ? String(securityAnalysis.weakCount) : "Locked"} />
          <StatusLine label="Reused passwords" ok={vaultUnlocked && securityAnalysis.reusedCount === 0} value={vaultUnlocked ? String(securityAnalysis.reusedCount) : "Locked"} />
          <StatusLine label="Vault encryption" ok={me.vaultConfigured} value={me.vaultConfigured ? "Enabled" : "Required"} />
        </Panel>
      </div>
    );
  }

  function renderActivity() {
    return (
      <Panel title="Recent security activity">
        {activity.length === 0 ? (
          <div className="empty-state">No account activity has been recorded yet.</div>
        ) : (
          <div className="activity-list">
            {activity.map((item) => (
              <div className="activity-row" key={item.id}>
                <span className={clsx("activity-dot", `activity-dot--${item.status}`)} />
                <div>
                  <strong>{item.message}</strong>
                  <small>{formatDate(item.timestamp)}</small>
                </div>
                <em>{item.type}</em>
              </div>
            ))}
          </div>
        )}
      </Panel>
    );
  }

  function renderSessions() {
    return (
      <Panel title="Active sessions">
        {sessions.length === 0 ? (
          <div className="empty-state">No active sessions were returned by SecureLocker.</div>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <article className="session-row" key={session.id}>
                <MonitorSmartphone aria-hidden="true" />
                <div>
                  <strong>{formatDevice(session.userAgent)}</strong>
                  <span>{session.ipAddress ?? "Unknown IP"}</span>
                  <small>Last access {formatDate(session.lastUsedAt)}</small>
                </div>
                {session.current ? (
                  <span className="current-badge">Current</span>
                ) : (
                  <Button loading={busyAction === `session-${session.id}`} onClick={() => void handleRevokeSession(session.id)} variant="ghost">
                    Revoke
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
    );
  }

  function renderSettings() {
    const settingsCategories = [
      { id: "general", label: "General", icon: Settings },
      { id: "security", label: "Security", icon: ShieldCheck },
      { id: "vault", label: "Vault", icon: KeyRound },
      { id: "activity", label: "Activity Logs", icon: Activity },
      { id: "sessions", label: "Sessions & Devices", icon: MonitorSmartphone },
      { id: "recovery", label: "Recovery & Settings", icon: RotateCcwKey },
      { id: "account", label: "Account", icon: UserRound },
    ];

    return (
      <div className="settings-modern">
        <aside className="settings-sidebar">
          <nav className="settings-nav">
            {settingsCategories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  className={clsx("settings-nav__item", activeSettingsCategory === category.id && "settings-nav__item--active")}
                  key={category.id}
                  onClick={() => setActiveSettingsCategory(category.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="settings-content">
          <header className="settings-content__header">
            <h2>{settingsCategories.find(c => c.id === activeSettingsCategory)?.label}</h2>
          </header>

          <div className="settings-content__body">
            {activeSettingsCategory === "general" && (
              <>
                <section className="settings-panel">
                  <div className="settings-panel__header">
                    <h3>Appearance</h3>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row__label">
                      <span>Theme mode</span>
                    </div>
                    <div className="settings-row__control">
                      <select
                        className="settings-select"
                        onChange={(event) => updateSettingsPreference("themeMode", event.currentTarget.value)}
                        value={settingsPreferences.themeMode}
                      >
                        <option value="system">System</option>
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="settings-panel">
                  <div className="settings-panel__header">
                    <h3>Interface</h3>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row__label">
                      <span>Compact vault cards</span>
                    </div>
                    <div className="settings-row__control">
                      <label className="settings-toggle">
                        <input
                          checked={settingsPreferences.compactVault}
                          onChange={(event) => updateSettingsPreference("compactVault", event.currentTarget.checked)}
                          type="checkbox"
                        />
                        <span className="settings-toggle__slider"></span>
                      </label>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row__label">
                      <span>Hide sensitive information</span>
                    </div>
                    <div className="settings-row__control">
                      <label className="settings-toggle">
                        <input
                          checked={settingsPreferences.hideSensitiveInformation}
                          onChange={(event) => updateSettingsPreference("hideSensitiveInformation", event.currentTarget.checked)}
                          type="checkbox"
                        />
                        <span className="settings-toggle__slider"></span>
                      </label>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSettingsCategory === "security" && (
              <section className="settings-panel">
                <div className="settings-panel__header">
                  <h3>Security Preferences</h3>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Auto-lock minutes</span>
                  </div>
                  <div className="settings-row__control">
                    <input
                      className="settings-input"
                      id="settings-auto-lock"
                      inputMode="numeric"
                      min={0}
                      onChange={(event) => updateSettingsPreference("autoLockMinutes", event.target.value)}
                      type="number"
                      value={settingsPreferences.autoLockMinutes}
                    />
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Clipboard clear seconds</span>
                  </div>
                  <div className="settings-row__control">
                    <input
                      className="settings-input"
                      id="settings-clipboard-clear"
                      inputMode="numeric"
                      min={5}
                      onChange={(event) => updateSettingsPreference("clipboardClearSeconds", event.target.value)}
                      type="number"
                      value={settingsPreferences.clipboardClearSeconds}
                    />
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Require password confirmation</span>
                  </div>
                  <div className="settings-row__control">
                    <label className="settings-toggle">
                      <input
                        checked={settingsPreferences.requirePasswordConfirmation}
                        onChange={(event) => updateSettingsPreference("requirePasswordConfirmation", event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span className="settings-toggle__slider"></span>
                    </label>
                  </div>
                </div>
              </section>
            )}

            {activeSettingsCategory === "vault" && (
              <section className="settings-panel">
                <div className="settings-panel__header">
                  <h3>Vault Defaults</h3>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Generated password length</span>
                  </div>
                  <div className="settings-row__control">
                    <input
                      className="settings-input"
                      id="settings-password-length"
                      inputMode="numeric"
                      min={10}
                      onChange={(event) => updateSettingsPreference("passwordLength", event.target.value)}
                      type="number"
                      value={settingsPreferences.passwordLength}
                    />
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Default category</span>
                  </div>
                  <div className="settings-row__control">
                    <select
                      className="settings-select"
                      onChange={(event) => updateSettingsPreference("defaultCategory", event.currentTarget.value)}
                      value={settingsPreferences.defaultCategory}
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Include numbers in generated passwords</span>
                  </div>
                  <div className="settings-row__control">
                    <label className="settings-toggle">
                      <input
                        checked={settingsPreferences.includeNumbers}
                        onChange={(event) => updateSettingsPreference("includeNumbers", event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span className="settings-toggle__slider"></span>
                    </label>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Include symbols in generated passwords</span>
                  </div>
                  <div className="settings-row__control">
                    <label className="settings-toggle">
                      <input
                        checked={settingsPreferences.includeSymbols}
                        onChange={(event) => updateSettingsPreference("includeSymbols", event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span className="settings-toggle__slider"></span>
                    </label>
                  </div>
                </div>
              </section>
            )}

            {activeSettingsCategory === "activity" && (
              <section className="settings-panel">
                <div className="settings-panel__header">
                  <h3>Activity Logs</h3>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Activity retention</span>
                  </div>
                  <div className="settings-row__control">
                    <select
                      className="settings-select"
                      onChange={(event) => updateSettingsPreference("activityRetentionDays", event.currentTarget.value)}
                      value={settingsPreferences.activityRetentionDays}
                    >
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                    </select>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row__label">
                    <span>Recent activity entries</span>
                  </div>
                  <div className="settings-row__control">
                    <span className="settings-value">{activity.length}</span>
                  </div>
                </div>
                <div className="settings-actions">
                  <Button onClick={() => void refreshActivity()} variant="ghost">
                    <Activity aria-hidden="true" />
                    Refresh activity
                  </Button>
                  <Button onClick={() => openSettingsConfirmation("clear-logs")} variant="ghost">
                    <Trash2 aria-hidden="true" />
                    Clear logs
                  </Button>
                </div>
              </section>
            )}

            {activeSettingsCategory === "sessions" && (
              <section className="settings-panel">
                <div className="settings-panel__header">
                  <h3>Active Sessions & Devices</h3>
                </div>
                {sessions.length === 0 ? (
                  <div className="empty-state">No active sessions were returned by SecureLocker.</div>
                ) : (
                  <div className="settings-session-list">
                    {sessions.map((session) => (
                      <article className="settings-session-row" key={session.id}>
                        <MonitorSmartphone aria-hidden="true" />
                        <div>
                          <strong>{formatDevice(session.userAgent)}</strong>
                          <span>{session.ipAddress ?? "Unknown IP"}</span>
                          <small>Last access {formatDate(session.lastUsedAt)}</small>
                        </div>
                        {session.current ? (
                          <span className="current-badge">Current</span>
                        ) : (
                          <Button loading={busyAction === `session-${session.id}`} onClick={() => void handleRevokeSession(session.id)} variant="ghost">
                            Revoke
                          </Button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeSettingsCategory === "recovery" && (
              <>
                <section className="settings-panel">
                  <div className="settings-panel__header">
                    <h3>Recovery Status</h3>
                  </div>
                  <StatusLine label="Email verified" ok={me.user.emailVerified} />
                  <StatusLine label="Security questions" ok={me.securityQuestionsConfigured} />
                  <StatusLine label="Vault recovery key" ok={me.vaultConfigured} value={me.vaultConfigured ? "Configured" : "Required"} />
                </section>

                <section className="settings-panel">
                  <div className="settings-panel__header">
                    <h3>Data Export</h3>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row__label">
                      <span>Export format</span>
                    </div>
                    <div className="settings-row__control">
                      <select
                        className="settings-select"
                        onChange={(event) => updateSettingsPreference("exportFormat", event.currentTarget.value)}
                        value={settingsPreferences.exportFormat}
                      >
                        <option value="encrypted-json">Encrypted JSON</option>
                        <option value="vault-envelope">Vault envelope only</option>
                        <option value="activity-summary">Activity summary</option>
                      </select>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row__label">
                      <span>Vault records</span>
                    </div>
                    <div className="settings-row__control">
                      <span className="settings-value">{credentials.length}</span>
                    </div>
                  </div>
                  <div className="settings-actions">
                    <Button onClick={() => openSettingsConfirmation("export-data")}>
                      <Clipboard aria-hidden="true" />
                      Request encrypted export
                    </Button>
                  </div>
                </section>
              </>
            )}

            {activeSettingsCategory === "account" && (
              <section className="settings-panel">
                <div className="settings-panel__header">
                  <h3>Account Information</h3>
                </div>
                <div className="settings-profile">
                  <div className="settings-profile__row">
                    <strong>{displayEmail}</strong>
                    <span>{me.user.emailVerified ? "Verified email" : "Email verification required"}</span>
                  </div>
                  <StatusLine label="Protected session" ok={Boolean(me.activeSessionId)} value="Active" />
                  <StatusLine label="Recovery questions" ok={me.securityQuestionsConfigured} />
                </div>

                <div className="settings-panel__header" style={{ marginTop: '2rem' }}>
                  <h3>Security</h3>
                </div>
                <div className="settings-actions">
                  <Button onClick={openPasswordModal}>
                    <KeyRound aria-hidden="true" />
                    Change password
                  </Button>
                </div>

                <div className="settings-panel__header" style={{ marginTop: '2rem' }}>
                  <h3>Danger Zone</h3>
                </div>
                <p className="panel-copy">Destructive requests require password confirmation before they continue.</p>
                <div className="settings-actions">
                  <Button onClick={() => openSettingsConfirmation("delete-vault")} variant="ghost">
                    <Trash2 aria-hidden="true" />
                    Delete vault data
                  </Button>
                  <Button onClick={() => openSettingsConfirmation("delete-account")} variant="ghost">
                    <ShieldAlert aria-hidden="true" />
                    Delete account
                  </Button>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    );
  }
}

function MetricCard({ label, tone = "neutral", value }: { label: string; tone?: "neutral" | "success" | "warning"; value: string }) {
  return (
    <article className={clsx("metric-card", `metric-card--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="dashboard-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function StatusLine({ label, ok, value }: { label: string; ok: boolean; value?: string }) {
  return (
    <div className="status-line">
      {ok ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
      <span>{label}</span>
      <strong>{value ?? (ok ? "Ready" : "Attention")}</strong>
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="icon-button" onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}
