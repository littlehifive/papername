import { registerInstall } from "./backend";
import { getSettings, updateSettings } from "./storage";

let registration: Promise<string | undefined> | undefined;

/**
 * Returns this install's API token, registering an anonymous trial install the
 * first time a takeaway or telemetry needs one. Concurrent callers share one
 * registration so a press and a popup action never create two installs.
 */
export async function ensureApiToken(): Promise<string | undefined> {
  const settings = await getSettings();
  if (settings.apiToken) return settings.apiToken;
  registration ??= registerInstall()
    .then(async (result) => {
      await updateSettings({
        apiToken: result.token,
        remaining: result.remaining,
      });
      return result.token;
    })
    .catch(() => undefined)
    .finally(() => {
      registration = undefined;
    });
  return registration;
}
