---
description: "SMART GROUPED COMMITS + PUSH"
---

# Smart Commit

Now, based on your knowledge of the project, commit all changed files now in a series of logically connected groupings with super detailed commit messages for each and then push.

Take your time to do it right. Don't edit the code at all. Don't commit obviously ephemeral files.

## Process

1. **Analyze changes**: `git status` and `git diff`
2. **Group logically**: Identify which changes belong together
3. **Commit in order**: Most foundational changes first
4. **Write good messages**: Detailed, explaining the "why"
5. **Push**: `git push`

## Commit Message Format

```
type(scope): brief description

- Detailed point 1
- Detailed point 2
- Why this change was made

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Types
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `docs`: Documentation
- `test`: Tests
- `chore`: Maintenance

## Don't Commit
- `.env` files with secrets
- `node_modules/`
- Build artifacts
- Temporary/debug files
- IDE settings (unless shared)

## Final Step
```bash
git push
git status  # Verify clean
```
