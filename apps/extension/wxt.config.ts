import { defineConfig } from "wxt";

import { ARTICLE_MATCHES } from "./src/hosts";

export default defineConfig({
  manifest: {
    name: "Papername BETA",
    description:
      "THIS EXTENSION IS FOR BETA TESTING. Give academic PDF downloads useful names.",
    minimum_chrome_version: "121",
    permissions: ["downloads", "storage"],
    host_permissions: [
      ...ARTICLE_MATCHES,
      "https://api.crossref.org/*",
      "http://127.0.0.1:8787/*",
      "https://api.papername.app/*",
    ],
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    action: {
      default_title: "Papername",
      default_icon: {
        16: "icon-16.png",
        32: "icon-32.png",
      },
    },
  },
});
