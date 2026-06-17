# bug-catcher

A reusable floating "Report bug" button + Google Sheets backend, designed to drop into any app I'm building.

Two packages live here:

- `@kari/bug-catcher-react`: the floating button and modal (React).
- `@kari/bug-catcher-server`: Zod schema, Sheets append, Vercel Blob upload, Postgres backup helper, plus a Next.js App Router adapter.

## Install (consumer side)

```json
"dependencies": {
  "@kari/bug-catcher-react": "git+ssh://github.com/dohertykariann-code/bug-catcher.git#main",
  "@kari/bug-catcher-server": "git+ssh://github.com/dohertykariann-code/bug-catcher.git#main"
}
```

See per-package READMEs for setup.
