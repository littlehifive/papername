import { extractPaperMetadata } from "@papername/core";

import { ARTICLE_MATCHES } from "../src/hosts";

export default defineContentScript({
  matches: [...ARTICLE_MATCHES],
  runAt: "document_idle",
  main(context) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const currentMetadata = () => extractPaperMetadata(document, location.href);

    const publish = () => {
      const metadata = currentMetadata();
      if (!metadata) return;
      void chrome.runtime.sendMessage({
        type: "papername:context",
        metadata,
        pageUrl: location.href,
      });
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(publish, 250);
    };

    publish();
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    const refresh = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "papername:refresh-context"
      ) {
        publish();
      }
    };
    chrome.runtime.onMessage.addListener(refresh);

    context.onInvalidated(() => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      chrome.runtime.onMessage.removeListener(refresh);
    });
  },
});
