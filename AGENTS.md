# Repository guidance

- Keep every user-facing string in the application in English, including headings, help text, controls, validation messages, tooltips, status messages, and accessibility labels.
- Use concise, descriptive commit subjects. Do not include generated branch names or phrases such as `Merge pull request ... from .../codex/...` in commit titles or commit messages.
- This environment does not provide a browser executable and its npm registry rejects Playwright downloads with HTTP 403. Do not repeatedly run Playwright installation/version commands or browser-discovery commands solely to attempt screenshots. Document this known limitation only when a screenshot is explicitly required.
