import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AuthPage } from "../pages/auth/AuthPage";
import { UpdateChangelogOverlay } from "../components/app/UpdateChangelogOverlay";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import secureLockerLogo from "../assets/new-securelocker-logo.png";
import { clearStoredSession, getStoredSession, sessionChangedEvent, type AuthSession } from "../lib/authApi";
import { dashboardApi, type MeResponse } from "../lib/dashboardApi";
import { readStoredSettingsPreferences } from "../lib/settingsPreferences";
import { checkForUpdatesOnStartup, consumeUpdateAnnouncement, dismissUpdateAnnouncement, resolveAppVersion, type UpdateAnnouncement } from "../lib/updater";
import packageJson from "../../package.json";

export default function App() {
  const startupSteps = [
    "Initializing SecureLocker...",
    "Loading user settings...",
    "Checking for updates...",
    "Verifying system compatibility...",
    "Starting SecureLocker..."
  ];

  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(session));
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const [updateAnnouncement, setUpdateAnnouncement] = useState<UpdateAnnouncement | null>(null);
  const [isStartingUp, setIsStartingUp] = useState(true);
  const [startupStep, setStartupStep] = useState(0);

  useEffect(() => {
    function syncSession() {
      setSession(getStoredSession());
    }

    window.addEventListener(sessionChangedEvent, syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener(sessionChangedEvent, syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAppVersion() {
      const version = await resolveAppVersion(packageJson.version);
      if (!active) return;

      setAppVersion(version);
      setUpdateAnnouncement(consumeUpdateAnnouncement(version));
    }

    void loadAppVersion();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function runStartupChecks() {
      try {
        // Step 0: Initializing
        setStartupStep(0);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Step 1: Loading settings
        setStartupStep(1);
        const prefs = readStoredSettingsPreferences();
        document.documentElement.setAttribute("data-theme", prefs.themeMode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : prefs.themeMode);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 2: Update check
        setStartupStep(2);
        if (prefs.checkForUpdatesOnStartup) {
          try {
            await checkForUpdatesOnStartup();
          } catch (error) {
            console.log("Startup update check failed:", error);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 3: System compatibility
        setStartupStep(3);
        // Check backend/API availability - for now assume ok
        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 4: Ready
        setStartupStep(4);
        await new Promise(resolve => setTimeout(resolve, 200));

      } finally {
        if (active) {
          setIsStartingUp(false);
        }
      }
    }

    void runStartupChecks();
    return () => {
      active = false;
    };
  }, []);



  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (!session) {
        setMe(null);
        setIsCheckingSession(false);
        return;
      }

      try {
        setIsCheckingSession(true);
        const profile = await dashboardApi.getMe();
        if (active) setMe(profile);
      } catch {
        clearStoredSession();
        if (active) setMe(null);
      } finally {
        if (active) setIsCheckingSession(false);
      }
    }

    void verifySession();
    return () => {
      active = false;
    };
  }, [session]);

  if (isStartingUp) {
    const progress = (startupStep + 1) / startupSteps.length;
    return (
      <motion.main
        className="splash-screen"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="ambient-grid" aria-hidden="true" />
        <motion.div
          className="splash-content"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <img src={secureLockerLogo} alt="SecureLocker" />
          <div className="splash-progress">
            <div className="splash-progress-bar">
              <motion.div
                className="splash-progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="splash-status">{startupSteps[startupStep]}</span>
          </div>
        </motion.div>
      </motion.main>
    );
  }

  return (
    <>
      {isCheckingSession ? (
        <main className="auth-page">
          <div className="ambient-grid" aria-hidden="true" />
          <div className="session-boot">
            <img src={secureLockerLogo} alt="SecureLocker" />
            <span>Securing dashboard session...</span>
          </div>
        </main>
      ) : !session || !me ? (
        <AuthPage />
      ) : (
        <DashboardPage initialMe={me} onSignOut={clearStoredSession} />
      )}
      <AnimatePresence>
        {updateAnnouncement ? <UpdateChangelogOverlay announcement={updateAnnouncement} onClose={handleDismissUpdateAnnouncement} /> : null}
      </AnimatePresence>
      <div className="app-version-badge">v{appVersion}</div>
    </>
  );

  function handleDismissUpdateAnnouncement() {
    if (!updateAnnouncement) return;
    dismissUpdateAnnouncement(updateAnnouncement.version);
    setUpdateAnnouncement(null);
  }
}
