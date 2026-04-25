import { useEffect, useState } from "react";
import { AuthPage } from "../pages/auth/AuthPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import secureLockerLogo from "../assets/new-securelocker-logo.png";
import { clearStoredSession, getStoredSession, sessionChangedEvent, type AuthSession } from "../lib/authApi";
import { dashboardApi, type MeResponse } from "../lib/dashboardApi";

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(session));

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

  if (isCheckingSession) {
    return (
      <main className="auth-page">
        <div className="ambient-grid" aria-hidden="true" />
        <div className="session-boot">
          <img src={secureLockerLogo} alt="SecureLocker" />
          <span>Securing dashboard session...</span>
        </div>
      </main>
    );
  }

  if (!session || !me) {
    return <AuthPage />;
  }

  return <DashboardPage initialMe={me} onSignOut={clearStoredSession} />;
}
