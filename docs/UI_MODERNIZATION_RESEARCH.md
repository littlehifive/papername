# Popup UI Modernization Research

Research date: 2026-09-11

## Recommendation

Use a restrained, system-native visual language: one sans-serif type family, neutral page and card surfaces, one brand accent, and separate semantic colors for ready/warning/error states. Make the current-page result and filename-format choice the two dominant regions; render activation, quota, telemetry, support, and footer content as quieter supporting controls.

Suggested hierarchy:

1. Product name and a concise outcome-led hook.
2. **Current page** as the primary card, with a large state label, icon, descriptive text, and a strong accent edge or border.
3. **How should PDFs be named?** as the second primary card, with its selected format and example visually grouped.
4. Latest result and quota as compact secondary information.
5. Activation, telemetry, support, privacy, and feedback as neutral settings or progressive disclosure.

Apple recommends ordering content by importance, placing important items near the top/leading edge, aligning elements for scanability, and visually grouping related content ([Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)). Apple also advises putting task-specific settings in the context they affect and minimizing the total number of settings ([Apple HIG: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)).

## Typography

- Replace the mixed Georgia/Inter treatment with one system sans stack: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. This avoids an undeclared Inter dependency and feels native across Chromium platforms.
- Use roughly 22–24px semibold for the product name, 15px/1.5 for body copy, 14–16px semibold for primary card headings, and at least 12.5–13px for secondary copy. The current 10.5–11px auxiliary text is unnecessarily hard to read.
- Use size and weight before color to establish hierarchy; reserve semibold/bold for headings, statuses, and primary actions.

Apple recommends minimizing typefaces, using size/weight/color to communicate hierarchy, and avoiding thin weights in favor of Regular through Bold ([Apple HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)). The layout should also tolerate user text-spacing overrides without clipping or loss of content: 1.5× line height, 2× paragraph spacing, 0.12em letter spacing, and 0.16em word spacing ([WCAG 2.2 SC 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)).

## Color and emphasis

A practical modern palette:

| Role           | Suggested value | Usage                                       |
| -------------- | --------------- | ------------------------------------------- |
| App background | `#F7F8FA`       | Quiet shell                                 |
| Surface        | `#FFFFFF`       | Primary cards and controls                  |
| Primary text   | `#172033`       | Headings and body text                      |
| Secondary text | `#5C667A`       | Supporting copy                             |
| Brand accent   | `#4F46E5`       | Primary action, focus, selected naming card |
| Accent tint    | `#EEF2FF`       | Naming-card tint, never the only state cue  |
| Ready          | `#0F766E`       | Ready icon/label/strong edge                |
| Ready tint     | `#ECFDF5`       | Ready-card background                       |

Calculated contrast on white is 16.27:1 for primary text, 5.77:1 for secondary text, 6.29:1 for the indigo accent, and 5.47:1 for ready teal. Recheck every final foreground/background pair after implementation. WCAG AA requires at least 4.5:1 for ordinary text, 3:1 for large text, and 3:1 for visual information needed to identify controls and their states ([WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).

Do not make green, amber, or red the only indicator. Keep the explicit labels (for example, “Ready to rename”), icons, and distinguishable borders/shapes; WCAG requires a non-color cue when color communicates meaning ([WCAG 2.2 SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Apple likewise recommends consistent, purposeful accent use and semantic primary/secondary/tertiary color roles ([Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)).

## Switches and defaults

- Replace both checkboxes with switch-styled controls, preferably native `<input type="checkbox" role="switch">` elements.
- Give each a stable visible label that does not change with state: **Rename downloaded PDFs** and **Share anonymous usage data**. Show `On` or `Off` as separate synchronized visible state text if the track alone is not clear.
- Ensure the track, thumb, state, and focus ring remain perceivable at 3:1 contrast. Make each whole labeled row clickable and at least 24×24 CSS px ([WCAG 2.2 SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- A switch is appropriate because both controls are strictly binary. It needs an accessible label, `checked`/`aria-checked` state, and Space-key operation; the accessible label must not change when the state changes ([WAI-ARIA APG: Switch Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)).
- Default the core renaming switch to **On**. It is the installed product's expected behavior and provides immediate value; good defaults should serve the largest number of people without requiring setup ([Apple HIG: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)).

### Telemetry default caution

Keep the explanation beside the telemetry switch concrete, for example: “Sends whether renaming worked, the failure category, and a timing range. Never sends PDF text, titles, filenames, or websites.” Link directly to fuller privacy details.

Do not treat a preselected switch by itself as affirmative consent. Chrome Web Store policy requires transparency about collected user data and affirmative, informed consent before collection ([Chrome Web Store: Disclosure Requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements/)). The lowest-risk design is telemetry **Off** until an explicit opt-in. If product testing requires the switch to appear On by default, defer all telemetry transmission until the user completes a separate, prominent consent action (or document the prior qualifying consent flow) and keep the switch easy to turn off.

## Copy direction

Prefer a concrete before/after promise over the current abstract hook:

> Turn filenames like `1c96203b55c6.pdf` into `Wu et al. (2026).pdf`.

This explains the product in one scan, reinforces the filename preview, and uses the requested Wu example consistently.
