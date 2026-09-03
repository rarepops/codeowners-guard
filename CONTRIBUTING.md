# Contributing

## Development setup

Install Node.js 22 or newer, then run:

```shell
npm ci
npm run check
```

## Pull requests

- Keep behavior changes covered by focused tests.
- Run `npm run format` before submitting a change.
- Run `npm run build` and include changes under `dist/`.
- Keep Action inputs and outputs synchronized between `action.yml` and the README.
- Do not weaken workflow permissions or replace immutable action pins without explaining why.

## Validation semantics

GitHub's CODEOWNERS API is authoritative for syntax diagnostics. Local matching behavior should be backed by a conformance test before it is changed. New checks should have a stable code, a documented severity, and deterministic output ordering.
