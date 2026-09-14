# Contributing to Soundscape

Thank you for your interest in contributing to Soundscape! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

Before submitting a bug report:

1. Check the [existing issues](../../issues) to avoid duplicates
2. Ensure the bug is reproducible in the latest version

When submitting a bug report, include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Browser and OS information
- Screenshots or recordings if applicable

### Suggesting Features

Feature suggestions are welcome! Please:

1. Check existing issues and discussions first
2. Provide a clear use case for the feature
3. Explain how it benefits users

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following our coding standards
4. **Test your changes**: `npm run build` should complete without errors
5. **Commit your changes** with clear, descriptive messages
6. **Push to your fork** and submit a pull request

### Confirming a Deployment

If you need to confirm that a change actually reached the running bot, run
`/theme-bot themes` and read the build value in the footer. It looks like
`build 2026-09-14 cd0a649`: the commit date and the short git SHA the running
image was built from. It moves on its own with every deploy, so there is nothing
to bump and nothing to remember.

The SHA says exactly what is running. The date says how fresh at a glance, and
is the commit's own date rather than the time the image happened to be built, so
two people building the same commit get the same footer.

Compare the SHA against the commit you expect:

```bash
git rev-parse --short=7 origin/main
```

A footer reading `unknown` means the values never reached the image: the build
arg was not passed, or the deploy did not go through the pipeline. It reports
`unknown` rather than guessing, because a marker that can lie is worse than no
marker. A footer showing the SHA with no date in front of it means the SHA
arrived and the date did not.

This exists because the bot runs on hosting with no log access and a deploy
pipeline that is not in this repo. The marker is the only way to see what is
actually running.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/soundscape.git
cd soundscape

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define interfaces for props and state
- Avoid `any` types; use proper typing

### React

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks

### CSS

- Use CSS files alongside components
- Follow existing naming conventions (BEM-style)
- Avoid inline styles except for dynamic values

### File Organization

- Place components in `src/components/ComponentName/`
- Include `ComponentName.tsx`, `ComponentName.css`, and `index.ts`
- Keep related utilities in `src/utils/`

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add velocity editing to note editor`
- `fix: resolve audio crackling on rapid note playback`
- `docs: update integration instructions`
- `refactor: simplify mixer state management`

## Testing

Currently, the project uses TypeScript compilation as the primary validation:

```bash
npm run build
```

Ensure the build completes without errors before submitting a PR.

## Areas for Contribution

### Good First Issues

- UI/UX improvements
- Documentation updates
- Accessibility enhancements
- Additional instrument presets

### Larger Contributions

- New effects (reverb, chorus, etc.)
- MIDI import/export
- Keyboard shortcuts
- Undo/redo functionality
- Mobile touch support

## Questions?

Feel free to open an issue for questions or discussions about potential contributions.
