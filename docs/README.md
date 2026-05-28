# docs/

Project notes and assets not part of the build.

## `ci-workflow.yml.example`

The Phase 0 CI workflow (lint + typecheck + tests). It lives here instead of
`.github/workflows/` because the original push was rejected with:

```
! [remote rejected] main -> main (refusing to allow a Personal Access Token to
  create or update workflow `.github/workflows/ci.yml` without `workflow` scope)
```

To enable CI:

1. Recreate the PAT (or fine-grained token) with the **`workflow`** scope, OR
   push from a credential that has it (e.g. GitHub Desktop, gh CLI with web auth).
2. Move the file into place:
   ```bash
   mkdir -p .github/workflows
   mv docs/ci-workflow.yml.example .github/workflows/ci.yml
   git add .github/workflows/ci.yml
   git commit -m "Add CI workflow"
   git push
   ```
