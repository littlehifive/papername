import { describe, expect, it } from "vitest";

import { DEFAULT_CUSTOM_TEMPLATE, PRESET_TEMPLATES } from "@papername/core";

import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

describe("stored settings normalization", () => {
  it("returns defaults for missing or malformed storage", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("settings")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ enabled: "yes", preset: 4 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("keeps current presets and the disabled state", () => {
    expect(
      normalizeSettings({ enabled: false, preset: "citation_title" }),
    ).toEqual({ enabled: false, preset: "citation_title" });
  });

  it("migrates the retired title preset to a title-only custom template", () => {
    expect(normalizeSettings({ preset: "title" })).toEqual({
      enabled: true,
      preset: "custom",
      customTemplate: [{ kind: "title" }],
    });
  });

  it("does not overwrite a valid custom template when migrating the title preset", () => {
    expect(
      normalizeSettings({
        preset: "title",
        customTemplate: PRESET_TEMPLATES.citation,
      }),
    ).toEqual({
      enabled: true,
      preset: "custom",
      customTemplate: PRESET_TEMPLATES.citation,
    });
  });

  it("migrates the retired key-takeaway preset to authors, year and title", () => {
    expect(normalizeSettings({ preset: "citation_gist" })).toEqual({
      enabled: true,
      preset: "citation_title",
    });
  });

  it("falls back to the default preset for unknown values", () => {
    expect(normalizeSettings({ preset: "abstract" })).toEqual(DEFAULT_SETTINGS);
  });

  it("drops an invalid custom template and seeds the default for the custom preset", () => {
    expect(
      normalizeSettings({ preset: "citation", customTemplate: "[Title]" }),
    ).toEqual({ enabled: true, preset: "citation" });
    expect(
      normalizeSettings({ preset: "custom", customTemplate: [{ kind: "x" }] }),
    ).toEqual({
      enabled: true,
      preset: "custom",
      customTemplate: DEFAULT_CUSTOM_TEMPLATE,
    });
    expect(
      normalizeSettings({
        preset: "custom",
        customTemplate: [{ kind: "text", value: "paper" }],
      }),
    ).toEqual({
      enabled: true,
      preset: "custom",
      customTemplate: DEFAULT_CUSTOM_TEMPLATE,
    });
  });

  it("forgets retired backend fields", () => {
    expect(
      normalizeSettings({
        enabled: true,
        preset: "citation",
        gistConsent: true,
        betaToken: "token",
        remaining: 12,
        proInterest: true,
        telemetryEnabled: true,
      }),
    ).toEqual({ enabled: true, preset: "citation" });
  });
});
