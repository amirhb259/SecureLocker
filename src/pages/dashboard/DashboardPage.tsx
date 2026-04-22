import { useEffect, useMemo, useState } from "react";
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
import secureLockerLogo from "../../assets/securelocker-logo.png";
import { Button } from "../../components/ui/Button";
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

const sections: Array<{ icon: typeof LayoutDashboard; id: SectionId; label: string }> = [
  { icon: LayoutDashboard, id: "overview", label: "Overview" },
  { icon: KeyRound, id: "vault", label: "Password Vault" },
  { icon: ShieldCheck, id: "security", label: "Security Center" },
  { icon: Activity, id: "activity", label: "Activity Logs" },
  { icon: MonitorSmartphone, id: "sessions", label: "Sessions & Devices" },
  { icon: Settings, id: "settings", label: "Recovery & Settings" },
];

const categories = ["Social", "Banking", "Gaming", "Work", "Shopping", "Personal", "Custom"];

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

export function DashboardPage({ initialMe, onSignOut }: DashboardPageProps) {
  const [me, setMe] = useState(initialMe);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [activity, setActivity] = useState<DashboardActivity[]>([]);
  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [vaultEnvelope, setVaultEnvelope] = useState<VaultEnvelope | null>(null);
  const [vaultSecret, setVaultSecret] = useState<VaultSecret | null>(null);
  const [credentials, setCredentials] = useState<DecryptedCredential[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
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
      setNotice({ message: "New account passwords do not match.", tone: "error" });
      return;
    }

    try {
      setBusyAction("change-password");
      await dashboardApi.changePassword(currentPassword, newAccountPassword);
      setCurrentPassword("");
      setNewAccountPassword("");
      setConfirmAccountPassword("");
      await refreshActivity();
      setNotice({ message: "Account password changed. Other sessions were revoked.", tone: "success" });
    } catch (error) {
      setNotice({ message: friendlyError(error), tone: "error" });
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

  return (
    <main className="dashboard-page">
      <div className="dashboard-ambient" aria-hidden="true" />
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <img src={secureLockerLogo} alt="" />
          <span>
            <strong>SecureLocker</strong>
            <small>Vault Command</small>
          </span>
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
            <p>Protected session</p>
            <h1>{sections.find((section) => section.id === activeSection)?.label}</h1>
          </div>
          <div className="dashboard-user">
            <span>{me.user.username}</span>
            <small>{me.user.email}</small>
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
            <TextField id="vault-password" label="Vault password" onChange={setSetupPassword} type="password" value={setupPassword} />
            <TextField id="vault-confirm" label="Confirm vault password" onChange={setSetupConfirm} type="password" value={setupConfirm} />
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
              <TextField id="unlock-password" label="Vault password" onChange={setUnlockPassword} type="password" value={unlockPassword} />
              <Button loading={busyAction === "unlock-vault"} type="submit">
                Unlock vault
              </Button>
            </form>
          </Panel>
          <Panel title="Recover vault access">
            <form className="dashboard-form" onSubmit={handleRecoverVault}>
              <TextField id="recovery-key" label="Recovery key" onChange={setRecoveryKey} value={recoveryKey} />
              <TextField id="new-vault-password" label="New vault password" onChange={setNewVaultPassword} type="password" value={newVaultPassword} />
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
                      {primaryIdentity || "No username or email saved"}
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
                    <code>{revealedIds.has(credential.id) ? credential.password : "••••••••••••"}</code>
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
              <TextField
                action={
                  <button className="password-inline-action" onClick={() => setShowEntryPassword((current) => !current)} type="button">
                    {showEntryPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                }
                id="entry-password"
                label="Password"
                onChange={(value) => updateCredentialForm("password", value)}
                type={showEntryPassword ? "text" : "password"}
                value={credentialForm.password}
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
    return (
      <div className="dashboard-grid dashboard-grid--two">
        <Panel title="Recovery status">
          <StatusLine label="Email verified" ok={me.user.emailVerified} />
          <StatusLine label="Security questions configured" ok={me.securityQuestionsConfigured} />
          <StatusLine label="Vault recovery key" ok={me.vaultConfigured} value={me.vaultConfigured ? "Configured" : "Required"} />
        </Panel>
        <Panel title="Change account password">
          <form className="dashboard-form" onSubmit={handleChangePassword}>
            <TextField id="current-account-password" label="Current password" onChange={setCurrentPassword} type="password" value={currentPassword} />
            <TextField id="new-account-password" label="New password" onChange={setNewAccountPassword} type="password" value={newAccountPassword} />
            <TextField id="confirm-account-password" label="Confirm new password" onChange={setConfirmAccountPassword} type="password" value={confirmAccountPassword} />
            <Button loading={busyAction === "change-password"} type="submit">
              Change password
            </Button>
          </form>
        </Panel>
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
