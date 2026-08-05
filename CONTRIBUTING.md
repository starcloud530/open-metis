# Contributing

Thanks for helping shape Open Metis. Early feedback via **Issues** is especially valuable.

## What we welcome

- Bugs with repro (`metis --version`, OS, `METIS_EXEC_BACKEND`, command)
- UX friction in the CLI / REPL
- PRs to `@metis/core`, `@metis/os`, `@metis/tools-coding`, `@metis/cli`
- Docs and examples that improve the happy path

## What we are not taking yet

- Cloud control plane / multi-tenant hosting
- Enterprise SSO / team policy cloud sync
- Replacing the loop with a different framework wholesale

## Dev setup

```bash
pnpm install
pnpm test
./metis run "hello" --mock --plain
```

## PR checklist

- [ ] `pnpm test` passes
- [ ] No secrets in the diff
- [ ] Small, focused change; link the issue
