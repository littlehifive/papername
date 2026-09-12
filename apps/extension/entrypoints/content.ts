import { firstClassSourceForUrl } from "@papername/core";

import { ARTICLE_EXCLUDE_MATCHES, ARTICLE_MATCHES } from "../src/hosts";
import {
  googleScholarContextForLink,
  googleScholarContextForPage,
} from "../src/google-scholar";
import { publishPageContext, type ContextMessage } from "../src/page-capture";
import { isLikelyPdfLink, type PdfPressMessage } from "../src/pdf-press";
import { isToastPayload, renderToast } from "../src/toast";

export default defineContentScript({
  matches: [...ARTICLE_MATCHES],
  excludeMatches: [...ARTICLE_EXCLUDE_MATCHES],
  runAt: "document_idle",
  main(context) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let publishedSignature: string | undefined;
    let knownPdfUrls: string[] = [];
    let lastPress: { url: string; at: number } | undefined;

    const publish = (force = false) => {
      const send = async (message: ContextMessage) => {
        knownPdfUrls = message.metadata.pdfUrls;
        const signature = JSON.stringify(message);
        if (!force && signature === publishedSignature) return;
        await chrome.runtime.sendMessage(message);
        publishedSignature = signature;
      };
      const scholarContext = googleScholarContextForPage(
        document,
        location.href,
      );
      if (scholarContext) {
        void send(scholarContext).catch(() => undefined);
        return;
      }
      void publishPageContext(document, location.href, send).catch(
        () => undefined,
      );
    };

    const schedule = () => {
      // A trailing debounce can wait forever on readers with animations or ads.
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        publish();
      }, 250);
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
        attributes: true,
        attributeFilter: ["content", "href"],
      });
    }
    const onMessage = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "papername:refresh-context"
      ) {
        publish(true);
        return;
      }
      if (isToastPayload(message)) renderToast(document, message);
    };
    chrome.runtime.onMessage.addListener(onMessage);

    // A pointerdown and its click both arrive for one press; report it once.
    const reportPress = (url: string) => {
      const at = Date.now();
      if (lastPress && lastPress.url === url && at - lastPress.at < 1_000)
        return;
      lastPress = { url, at };
      const message: PdfPressMessage = {
        type: "papername:pdf-press",
        pageUrl: location.href,
        url,
      };
      void chrome.runtime.sendMessage(message).catch(() => undefined);
    };

    const onPress = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Enter") return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link) return;
      const scholarMessage = googleScholarContextForLink(link, location.href);
      if (scholarMessage) {
        void chrome.runtime
          .sendMessage(scholarMessage)
          .catch(() => undefined)
          .finally(() => reportPress(link.href));
        return;
      }
      if (isLikelyPdfLink(link.href, knownPdfUrls)) reportPress(link.href);
    };
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("click", onPress, true);
    document.addEventListener("keydown", onPress, true);

    context.onInvalidated(() => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      chrome.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("click", onPress, true);
      document.removeEventListener("keydown", onPress, true);
    });
  },
});
