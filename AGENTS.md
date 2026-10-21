# Agent Instructions

## Versioning

- Semantic Versioning is required for every user-facing feature or fix.
- The latest published GitHub Release tag is the canonical version source. Bump the version for each user-facing change before publishing its release.
- Follow SemVer 2.0.0: use patch increments for backward-compatible fixes and minor increments for backward-compatible features. Before 1.0.0, use the next minor version for breaking changes; after 1.0.0, use a major increment.
- Use `vMAJOR.MINOR.PATCH` for release tags (for example, version `0.0.1` uses tag `v0.0.1`). Never reuse a published tag.
- HACS requires a published GitHub Release for version detection; creating a tag alone is not sufficient.
- Documentation-only or agent-instruction-only changes do not require a version increment unless they change published usage or release behavior.