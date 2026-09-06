import { publishPageContext } from "../src/page-capture";

declare global {
  var __papernameProbeInstalled: boolean | undefined;
}

export default defineUnlistedScript(() => {
  const publish = () =>
    publishPageContext(document, location.href, (message) =>
      chrome.runtime.sendMessage(message),
    );

  if (globalThis.__papernameProbeInstalled) {
    void publish();
    return;
  }
  globalThis.__papernameProbeInstalled = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void publish(), 250);
  };
  void publish();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const receiveMessage = (message: unknown) => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "papername:refresh-context"
    ) {
      void publish();
    }
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "papername:stop-probe"
    ) {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      chrome.runtime.onMessage.removeListener(receiveMessage);
      delete globalThis.__papernameProbeInstalled;
    }
  };
  chrome.runtime.onMessage.addListener(receiveMessage);
});
