import { extractPaperMetadata } from "@papername/core";

export interface ContextMessage {
  type: "papername:context";
  metadata: NonNullable<ReturnType<typeof extractPaperMetadata>>;
  pageUrl: string;
}

export async function publishPageContext(
  document: Document,
  pageUrl: string,
  sendMessage: (message: ContextMessage) => Promise<unknown>,
): Promise<boolean> {
  const metadata = extractPaperMetadata(document, pageUrl);
  if (!metadata) return false;
  await sendMessage({
    type: "papername:context",
    metadata,
    pageUrl,
  });
  return true;
}
