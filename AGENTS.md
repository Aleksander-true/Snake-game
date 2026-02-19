# Rules For AI Development Agents

This file is mandatory for all AI agents working on this project.

## General Principles

- Work iteratively: implement changes step by step; at the end of each step, briefly summarize the result and propose the next step.
- Do not make destructive changes (deletions, large-scale renames, file moves, public API changes) without explicit user approval.
- If requirements are unclear or context is insufficient, ask clarifying questions first.
- Before starting each stage, provide a short plan (3–7 bullet points) and list the files expected to be modified.
- Small refactoring is allowed if it:
  - directly simplifies the current task implementation,
  - is local in scope,
  - does not change behavior outside the affected area,
  - is explicitly mentioned in the stage plan.

## Mandatory Rules During Development

- Follow the project architectural boundaries **as described in the Technical Specification** (Engine/Renderer/UI and related constraints).
- Do not add new npm dependencies and do not modify webpack/jest/tsconfig without prior approval.
- Development and code comments must be written in **English**. The technical specification in `docs/spec.md` is maintained in **Russian**.
- UI text must be in **Russian** (as required by the spec).
- Inline styles are forbidden: all UI changes must use CSS classes and CSS custom properties.
- For any randomness (if logic for generation/AI/spawning is affected), ensure deterministic behavior in tests where possible (seed/RNG substitution), if supported by the current project architecture.
- Any new `localStorage` keys:
  - must be moved into constants,
  - must be briefly documented (where they are used and what for).
- Commit message style is **recommended**: `feat:`, `fix:`, `test:`, `docs:`, `refactor:` (or another single consistent style; do not mix different approaches within the project).
- During implementation it is acceptable to not focus on linter errors if it speeds up work, **but all linter errors must be fixed before committing**.
- Tests must be written **according to the Technical Specification and the game rules as the primary source of truth**.
  - If writing tests reveals a contradiction between the code and the spec, **fix the code**, not the tests to match current code behavior.
  - If the contradiction is ambiguous and it’s unclear what is correct, ask the user for clarification first.

## Checks and Commits

- Make frequent, small commits: one commit = one completed logical step.
- During development (between commits) it is acceptable to only do a smoke check (manual verification of basic start/screen).
- **Before each commit, you must**:
  - ensure the project builds (`npm run build`);
  - ensure all tests pass (`npm test`);
  - fix linter errors (if a linter is used in the project and/or enabled in CI);
  - update documentation if changes affect behavior, module structure, parameters, or stage progress.

## Documentation

- Documentation must match the actual project state.
- Before committing, update:
  - stage progress in `docs/spec.md` (and other documents if affected by the changes).
- Do not silently change the spec wording/rules. If the spec must be adjusted (other than marking progress), get user approval first.

## Pre-Completion Checklist For Each Stage (Before Commit)

- The code matches the current spec and agreed clarifications.
- Architectural boundaries are not violated.
- No temporary debug logs / commented-out code remain without a clear need.
- `npm test` passes.
- `npm run build` passes.
- Linter errors are fixed (if a linter is used in the project and/or enabled in CI).
- Documentation is updated and reflects the real project state.
- Changes are ready for a separate commit (logically complete and not “half-working”).