import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { CheckCircle2 } from "lucide-react";
import { getAccountSecurityStatus, updateAccountSecurityStatus } from "../lib/securityApi";

interface EmergencyLockShortcutCardProps {
  onEnable?: () => void;
}

export function EmergencyLockShortcutCard({ onEnable }: EmergencyLockShortcutCardProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    console.log("EmergencyLockShortcutCard mounted");
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const response = await getAccountSecurityStatus();
      console.log("Security status:", response);
      setEnabled(response.emergencyShortcutEnabled);
    } catch (error) {
      console.error("Failed to load emergency shortcut status:", error);
      // Default to disabled on error
      setEnabled(false);
      // TODO: Show error toast
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await updateAccountSecurityStatus({ emergencyShortcutEnabled: false });
      setEnabled(false);
    } catch (error) {
      console.error("Failed to disable emergency shortcut:", error);
      // TODO: Show error toast
    } finally {
      setBusy(false);
    }
  }

  function handleEnable() {
    console.log("Emergency Lock Enable clicked");
    if (onEnable) {
      onEnable();
    }
  }

  if (loading) {
    return (
      <div className="settings-row">
        <div className="settings-row__label">
          <span>Emergency Lock Shortcut</span>
          <small>Instantly disables your account and signs out all sessions when triggered.</small>
        </div>
        <div className="settings-row__control">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <span>Emergency Lock Shortcut</span>
        <small>Instantly disables your account and signs out all sessions when triggered.</small>
      </div>
      <div className="settings-row__control">
        {enabled ? (
          <div className="settings-2fa-enabled">
            <CheckCircle2 aria-hidden="true" />
            <span>Enabled</span>
            <Button
              loading={busy}
              onClick={handleDisable}
              type="button"
              variant="ghost"
            >
              Disable
            </Button>
          </div>
        ) : (
          <Button
            loading={busy}
            onClick={handleEnable}
            type="button"
            variant="ghost"
          >
            Enable
          </Button>
        )}
      </div>
    </div>
  );
}