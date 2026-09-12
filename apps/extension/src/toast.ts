export type ToastPayload =
  | { type: "papername:toast"; state: "preparing" }
  | {
      type: "papername:toast";
      state: "named";
      filename: string;
      remaining?: number;
    }
  | {
      type: "papername:toast";
      state: "fallback";
      reason: string;
      remaining?: number;
    };

export const LOW_BALANCE_THRESHOLD = 20;

const FALLBACK_TEXT: Record<string, string> = {
  missing_abstract: "No abstract on this page, used the title instead",
  quota_exhausted: "Out of names, used the title instead",
  gist_timeout: "Takeaway took too long, used the title instead",
};

export function isToastPayload(value: unknown): value is ToastPayload {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "papername:toast" &&
    "state" in value,
  );
}

export function toastText(payload: ToastPayload): string {
  if (payload.state === "preparing") return "Preparing key takeaway…";
  const balance =
    typeof payload.remaining === "number" &&
    payload.remaining <= LOW_BALANCE_THRESHOLD
      ? payload.remaining === 0
        ? " · No names left"
        : ` · ${payload.remaining} ${payload.remaining === 1 ? "name" : "names"} left`
      : "";
  if (payload.state === "named") return `Named: ${payload.filename}${balance}`;
  return `${
    FALLBACK_TEXT[payload.reason] ??
    "Takeaway unavailable, used the title instead"
  }${balance}`;
}

const HOST_TAG = "papername-toast";
const STYLES = `
  :host { all: initial; }
  .toast {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 14px;
    border-radius: 10px;
    background: #172033;
    color: #ffffff;
    font: 13px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 6px 24px rgba(23, 32, 51, 0.28);
    pointer-events: none;
    overflow-wrap: anywhere;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 160ms ease, transform 160ms ease;
  }
  .toast[data-visible="true"] { opacity: 1; transform: none; }
  .toast[data-state="fallback"] { background: #7c2d12; }
  .label { font-weight: 650; margin-right: 6px; }
`;

const HIDE_AFTER_MS: Record<ToastPayload["state"], number> = {
  preparing: 8_000,
  named: 4_000,
  fallback: 5_000,
};

let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Renders the corner note inside a shadow root so page CSS cannot reach it. */
export function renderToast(document: Document, payload: ToastPayload): void {
  let host = document.querySelector<HTMLElement>(HOST_TAG);
  if (!host) {
    host = document.createElement(HOST_TAG);
    host.setAttribute("aria-live", "polite");
    (document.body ?? document.documentElement).append(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Papername";
    const text = document.createElement("span");
    text.className = "text";
    toast.append(label, text);
    root.append(style, toast);
  }
  const toast = host.shadowRoot?.querySelector<HTMLElement>(".toast");
  const text = host.shadowRoot?.querySelector<HTMLElement>(".text");
  if (!toast || !text) return;
  text.textContent = toastText(payload);
  toast.dataset.state = payload.state;
  toast.dataset.visible = "true";
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.dataset.visible = "false";
  }, HIDE_AFTER_MS[payload.state]);
}
