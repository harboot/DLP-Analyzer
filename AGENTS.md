# Repository guidance

- Keep every user-facing string in the application in English, including headings, help text, controls, validation messages, tooltips, status messages, and accessibility labels.
- Use concise, descriptive commit subjects. Do not include generated branch names or phrases such as `Merge pull request ... from .../codex/...` in commit titles or commit messages.
- This environment does not provide a browser executable and its npm registry rejects Playwright downloads with HTTP 403. Do not run Playwright installation/version commands, browser-discovery commands, or screenshot attempts. Do not mention the missing screenshot unless the user explicitly asks for one.
- Do not start a local HTTP server (including `python -m http.server`) for smoke testing. Use static validation and existing automated tests instead. Do not mention the skipped HTTP smoke test unless the user explicitly asks for it.

- Whenever application code or an asset listed in the Service Worker cache is changed, update `CACHE_VERSION` in `docs/service-worker.js` so deployed clients install the new application version.
