import { firstClassSourceForUrl } from "@papername/core";

import { ARTICLE_EXCLUDE_MATCHES, ARTICLE_MATCHES } from "../src/hosts";
import { googleScholarContextForLink } from "../src/google-scholar";
import { publishPageContext } from "../src/page-capture";

export default defineContentScript({
  matches: [...ARTICLE_MATCHES],
  excludeMatches: [...ARTICLE_EXCLUDE_MATCHES],
  runAt: "document_idle",
  main(context) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      void publishPageContext(document, location.href, (message) =>
        chrome.runtime.sendMessage(message),
      );
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(publish, 250);
    };

    publish();
    const observer = new MutationObserver(schedule);
    const observationTarget = firstClassSourceForUrl(location.href)
      ? document.documentElement
      : document.head;
    if (observationTarget) {
      observer.observe(observationTarget, {
        childList: true,
        subtree: true,
        ...(observationTarget === document.head
          ? { attributes: true, attributeFilter: ["content", "href"] }
          : {}),
      });
    }
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

    const publishScholarResult = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Enter") return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link) return;
      const message = googleScholarContextForLink(link, location.href);
      if (message) void chrome.runtime.sendMessage(message);
    };
    document.addEventListener("pointerdown", publishScholarResult, true);
    document.addEventListener("click", publishScholarResult, true);
    document.addEventListener("keydown", publishScholarResult, true);

    context.onInvalidated(() => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      chrome.runtime.onMessage.removeListener(refresh);
      document.removeEventListener("pointerdown", publishScholarResult, true);
      document.removeEventListener("click", publishScholarResult, true);
      document.removeEventListener("keydown", publishScholarResult, true);
    });
  },
});
