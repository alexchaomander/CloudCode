# Contributing to CloudCode

Thanks for your interest in improving CloudCode.

## Development setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run tests:
   ```bash
   npm test
   ```
3. Run the app locally:
   ```bash
   npm run dev
   ```

## Pull request guidelines

- Keep PRs focused and scoped.
- Include tests when adding or changing behavior.
- Update docs when APIs, env vars, or setup flows change.
- Do not commit build artifacts (`dist/`, `*.tsbuildinfo`, generated JS from TS sources).

## Commit messages

Use concise imperative messages, for example:
- `Add session snapshot endpoint`
- `Fix websocket reconnect logic`

## Security

Do not open public issues for security vulnerabilities. See `SECURITY.md`.
