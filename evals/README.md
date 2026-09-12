# Key takeaway release evaluation

`gist-cases.tsv` contains 60 synthetic title/abstract pairs: ten each from medicine, life science, physical science, engineering/CS, social science, and humanities. The cases deliberately include null effects, correlational findings, uncertainty, methods, reviews, and theory so a fluent but misleading takeaway fails.

The model is chosen by measurement, not by name (see `docs/adr/0001-prepaid-key-takeaway-credits.md`). The bar, in priority order:

1. **Latency.** Provider p95 under about 1.2 seconds for these inputs. The download waits at most about 2.5 seconds from the PDF-link press, and the extension-to-Worker-to-provider hops use several hundred milliseconds of that.
2. **Fidelity.** At least 90% fidelity and 80% usefulness across all 60 cases, no discipline below 80% fidelity.
3. **Format validity.** 100% on the automatic checks: 4–10 words, at most 120 characters, no unsafe or terminal punctuation.
4. **Cost.** A tiebreaker only.

## Running

One candidate, the configured OpenAI model:

```sh
OPENAI_API_KEY=... OPENAI_MODEL=... pnpm eval:gists > gist-results.jsonl
```

Several candidates, including open models on Cloudflare Workers AI or any OpenAI-compatible host: copy `candidates.example.json`, fill in current model ids and endpoints from a fresh search, export each `apiKeyEnv`, and run:

```sh
CANDIDATES=evals/candidates.json OPENAI_API_KEY=... CLOUDFLARE_API_TOKEN=... pnpm eval:gists > gist-results.jsonl
```

Every line of the JSONL carries the candidate, the output, the automatic format verdict, and `latencyMs`. A summary table with per-candidate error count, usable count, format validity, p50, and p95 latency prints to stderr.

Latency measured from a laptop ranks candidates relative to each other. Confirm the winner's absolute numbers after deployment from the Worker's telemetry latency buckets, which the beta already records.

## Rating

For every usable output, two human raters independently mark:

- `fidelity`: the takeaway preserves the central claim, direction, negation, uncertainty, population, and causal strength. Any material distortion fails.
- `usefulness`: the takeaway is a memorable, differentiating filename phrase rather than a generic restatement.

Resolve disagreements before calculating rates. Release key takeaways only with a candidate that clears all three bars. If no candidate clears them, keep the deterministic presets only.

The case abstracts are synthetic and safe to send during development. Production requests use the same title-and-abstract-only boundary.
