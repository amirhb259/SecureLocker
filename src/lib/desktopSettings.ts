import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { isTauriRuntime, runUpdateFlow } from "./updater";

export async function getAutostartState() {
  if (!isTauriRuntime()) {
    return false;
  }

  return isAutostartEnabled();
}

export async function setAutostartState(enabled: boolean) {
  if (!isTauriRuntime()) {
    throw new Error("Autostart is only available in the SecureLocker desktop app.");
  }

  if (enabled) {
    await enableAutostart();
    return;
  }

  await disableAutostart();
}

export async function runStartupUpdateCheck() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await runUpdateFlow();
  } catch (error) {
    console.error("Startup update check failed.", error);
  }
}
