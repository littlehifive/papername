# Gist release evaluation

`gist-cases.tsv` contains 60 synthetic title/abstract pairs: ten each from medicine, life science, physical science, engineering/CS, social science, and humanities. The cases deliberately include null effects, correlational findings, uncertainty, methods, reviews, and theory so a fluent but misleading gist fails.

Run the configured candidate model without committing the output:

```sh
OPENAI_API_KEY=... OPENAI_MODEL=gpt-5.6-luna pnpm eval:gists > gist-results.jsonl
```

For every usable output, two human raters independently mark:

- `fidelity`: the gist preserves the central claim, direction, negation, uncertainty, population, and causal strength. Any material distortion fails.
- `usefulness`: the gist is a memorable, differentiating filename phrase rather than a generic restatement.

Resolve disagreements before calculating rates. Release gist mode only at 90% fidelity and 80% usefulness across all 60 cases, with no discipline below 80% fidelity. If Luna fails, rerun once with `gpt-5.6-terra`; if both fail, keep deterministic presets only. The runner also reports automatic format validity (6–12 words, at most 120 characters, no unsafe or terminal punctuation), which must be 100%.

The case abstracts are synthetic and safe to send during development. Production requests use the same title-and-abstract-only boundary.
