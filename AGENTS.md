# Agent Instructions

## Versioning

- Semantic Versioning is required for every user-facing feature or fix.
- `VERSION` is the canonical version source. Update it with each user-facing change before considering the work complete.
- Follow SemVer 2.0.0: use patch increments for backward-compatible fixes and minor increments for backward-compatible features. Before 1.0.0, use the next minor version for breaking changes; after 1.0.0, use a major increment.
- Keep the `VERSION` value in `MAJOR.MINOR.PATCH` form without a prefix or suffix.
- For a HACS release, create a Git tag matching the version with a `v` prefix (for example, `VERSION` `0.0.1` uses tag `v0.0.1`). Never reuse a published tag.
- Documentation-only or agent-instruction-only changes do not require a version increment unless they change published usage or release behavior.