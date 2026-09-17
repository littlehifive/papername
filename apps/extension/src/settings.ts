import {
  DEFAULT_CUSTOM_TEMPLATE,
  hasMetadataToken,
  isTemplate,
  PRESETS,
  type FilenameTemplate,
  type Preset,
} from "@papername/core";

export interface ExtensionSettings {
  enabled: boolean;
  preset: Preset;
  /** Pieces for the custom format; kept even while a built-in preset is active. */
  customTemplate?: FilenameTemplate;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  preset: "citation",
};

const TITLE_ONLY_TEMPLATE: FilenameTemplate = [{ kind: "title" }];

/**
 * Coerces whatever is in extension storage into a valid settings object. Older
 * installs may hold retired presets or fields; those are migrated or dropped so
 * they disappear on the next write.
 */
export function normalizeSettings(stored: unknown): ExtensionSettings {
  const raw =
    stored && typeof stored === "object"
      ? (stored as Record<string, unknown>)
      : {};
  const settings: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
  };

  let template = isTemplate(raw.customTemplate)
    ? raw.customTemplate
    : undefined;
  let preset: Preset = DEFAULT_SETTINGS.preset;
  if (PRESETS.includes(raw.preset as Preset)) {
    preset = raw.preset as Preset;
  } else if (raw.preset === "title") {
    // The retired title-only preset becomes an equivalent custom template.
    preset = "custom";
    if (!template || !hasMetadataToken(template))
      template = TITLE_ONLY_TEMPLATE;
  } else if (raw.preset === "citation_gist") {
    // The retired key-takeaway preset always fell back to this format.
    preset = "citation_title";
  }
  if (preset === "custom" && (!template || !hasMetadataToken(template)))
    template = DEFAULT_CUSTOM_TEMPLATE;

  settings.preset = preset;
  if (template) settings.customTemplate = template;
  return settings;
}
