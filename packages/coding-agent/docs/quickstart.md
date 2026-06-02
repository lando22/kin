# Quickstart

This page gets you from install to a useful first kin session.

## Install

On macOS or Linux, install Kin with the one-line installer. It downloads a
prebuilt `kin` binary (no Node.js required) and falls back to npm if your
platform has no binary:

```bash
curl -fsSL https://lando22.github.io/kin/install.sh | sh
```

Or install from npm directly (requires Node.js 22+):

```bash
npm install -g @landongarrison/kin-coding-agent
```

On Windows, use npm or see [Windows setup](windows.md).

### Uninstall

Use the package manager that installed kin. The curl installer uses npm globally, so curl and npm installs are removed with npm:

```bash
# curl installer or npm install -g
npm uninstall -g @landongarrison/kin-coding-agent

# pnpm
pnpm remove -g @landongarrison/kin-coding-agent

# Yarn
yarn global remove @landongarrison/kin-coding-agent

# Bun
bun uninstall -g @landongarrison/kin-coding-agent
```

Uninstalling kin leaves settings, credentials, sessions, and installed kin packages in `~/.kin/agent/`.

Then start kin in the project directory you want it to work on:

```bash
cd /path/to/project
kin
```

## Authenticate

Kin can use subscription providers through `/login`, or API-key providers through environment variables or the auth file.

### Option 1: subscription login

Start kin and run:

```text
/login
```

Then select a provider. Built-in subscription logins include Claude Pro/Max, ChatGPT Plus/Pro (Codex), and GitHub Copilot.

### Option 2: API key

Set an API key before launching kin:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
kin
```

You can also run `/login` and select an API-key provider to store the key in `~/.kin/agent/auth.json`.

See [Providers](providers.md) for all supported providers, environment variables, and cloud-provider setup.

## First session

Once kin starts, type a request and press Enter:

```text
Summarize this repository and tell me how to run its checks.
```

By default, kin gives the model four tools:

- `read` - read files
- `write` - create or overwrite files
- `edit` - patch files
- `bash` - run shell commands

You can restrict Kin to a narrower built-in set with tool options, for example `read,definition` for inspection without file mutation. Kin runs in your current working directory and can modify files there. Use git or another checkpointing workflow if you want easy rollback.

## Give kin project instructions

Kin loads context files at startup. Add an `AGENTS.md` file to tell it how to work in a project:

```markdown
# Project Instructions

- Run `npm run check` after code changes.
- Do not run production migrations locally.
- Keep responses concise.
```

Kin loads:

- `~/.kin/agent/AGENTS.md` for global instructions
- `AGENTS.md` or `CLAUDE.md` from parent directories and the current directory

Restart kin, or run `/reload`, after changing context files.

## Common things to try

### Reference files

Type `@` in the editor to fuzzy-search files, or pass files on the command line:

```bash
kin @README.md "Summarize this"
kin @src/app.ts @src/app.test.ts "Review these together"
```

Images can be pasted with Ctrl+V (Alt+V on Windows) or dragged into supported terminals.

### Run shell commands

In interactive mode:

```text
!npm run lint
```

The command output is sent to the model. Use `!!command` to run a command without adding its output to the model context.

### Switch models

Use `/model` or Ctrl+L to choose a model. Use Shift+Tab to cycle thinking level. Use Ctrl+P / Shift+Ctrl+P to cycle through scoped models.

### Continue later

Sessions are saved automatically:

```bash
kin -c                  # Continue most recent session
kin -r                  # Browse previous sessions
kin --session <path|id> # Open a specific session
```

Inside kin, use `/resume`, `/new`, `/tree`, `/fork`, and `/clone` to manage sessions.

### Non-interactive mode

For one-shot prompts:

```bash
kin -p "Summarize this codebase"
cat README.md | kin -p "Summarize this text"
kin -p @screenshot.png "What's in this image?"
```

Use `--mode json` for JSON event output or `--mode rpc` for process integration.

## Next steps

- [Using Kin](usage.md) - interactive mode, slash commands, sessions, context files, and CLI reference.
- [Providers](providers.md) - authentication and model setup.
- [Settings](settings.md) - global and project configuration.
- [Keybindings](keybindings.md) - shortcuts and customization.
- [Kin Packages](packages.md) - install shared extensions, skills, prompts, and themes.

Platform notes: [Windows](windows.md), [Termux](termux.md), [tmux](tmux.md), [Terminal setup](terminal-setup.md), [Shell aliases](shell-aliases.md).
