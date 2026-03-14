---
description: Push skychart-extension changes to GitHub
---

// turbo-all

1. Bump version in `version.json` (increment patch or minor as appropriate, update changelog)
2. Stage all changes:
```
git add -A
```
3. Commit with descriptive message:
```
git commit -m "<descriptive message of what changed>"
```
4. Push to GitHub:
```
git push origin main
```

**IMPORTANT**: Always do this automatically after making changes to the skychart-extension. Do NOT ask the user for permission — just push.
