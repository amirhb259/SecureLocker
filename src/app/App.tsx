import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { AuthPage } from "../pages/auth/AuthPage";
import { UpdateChangelogOverlay } from "../components/app/UpdateChangelogOverlay";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import secureLockerLogo from "../assets/new-securelocker-logo.png";
import { clearStoredSession, getStoredSession, sessionChangedEvent, type AuthSession } from "../lib/authApi";
import { dashboardApi, type MeResponse } from "../lib/dashboardApi";
import { consumeUpdateAnnouncement, dismissUpdateAnnouncement, resolveAppVersion, type UpdateAnnouncement } from "../lib/updater";
import packageJson from "../../package.json";

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(session));
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const [updateAnnouncement, setUpdateAnnouncement] = useState<UpdateAnnouncement | null>(null);

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
