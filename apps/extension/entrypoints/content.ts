import { ARTICLE_MATCHES } from "../src/hosts";
import { publishPageContext } from "../src/page-capture";

export default defineContentScript({
  matches: [...ARTICLE_MATCHES],
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
