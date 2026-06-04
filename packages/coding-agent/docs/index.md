# Kin Documentation

Kin is a memory-first personal coding agent for your terminal. It remembers who you are, how you work, and what matters inside each project, while staying small at the core and extensible through TypeScript extensions, skills, prompt templates, themes, and kin packages.

## Quick start

On linux or mac you can install Kin with curl:

```bash
curl -fsSL https://lando22.github.io/kin/install.sh | sh
```

To uninstall kin itself:

```bash
rm -rf ~/.local/share/kin
rm -f ~/.local/bin/kin
```

Uninstalling kin leaves settings, credentials, sessions, and installed kin packages in `~/.kin/`.

Then run it in a project directory:

```bash
kin
```

Authenticate with `/login` for your ChatGPT Plus/Pro Codex subscription, or set an API key such as `OPENROUTER_API_KEY` before starting kin.

Run `/init` on your first launch to start the onboarding chat. Kin will get to know you, learn your collaboration style and goals, explore the current project, and write durable memory under `~/.kin/Memory/` and `~/.kin/Projects/`.

For the full first-run flow, see [Quickstart](quickstart.md).

## Start here

- [Quickstart](quickstart.md) - install, authenticate, and run a first session.
- [Quickstart: onboarding](quickstart.md#onboarding) - initialize or refresh Kin's personal and project memory.
- [Quickstart: reflect and wake](quickstart.md#reflect-and-wake) - review recent work and surface next-day context.
- [Using Kin](usage.md) - interactive mode, slash commands, context files, and CLI reference.
- [Providers](providers.md) - subscription and API-key setup for built-in providers.
- [Settings](settings.md) - global and project settings.
- [Keybindings](keybindings.md) - default shortcuts and custom keybindings.
- [Sessions](sessions.md) - session management, branching, and tree navigation.
- [Compaction](compaction.md) - context compaction and branch summarization.

## Customization

- [Extensions](extensions.md) - TypeScript modules for tools, commands, events, and custom UI.
- [Skills](skills.md) - Agent Skills for reusable on-demand capabilities.
- [Prompt templates](prompt-templates.md) - reusable prompts that expand from slash commands.
- [Themes](themes.md) - built-in and custom terminal themes.
- [Kin packages](packages.md) - bundle and share extensions, skills, prompts, and themes.
- [Custom models](models.md) - add model entries for supported provider APIs.
- [Custom providers](custom-provider.md) - implement custom APIs and OAuth flows.

## Programmatic usage

- [SDK](sdk.md) - embed kin in Node.js applications.
- [RPC mode](rpc.md) - integrate over stdin/stdout JSONL.
- [JSON event stream mode](json.md) - print mode with structured events.
- [TUI components](tui.md) - build custom terminal UI for extensions.

## Reference

- [Session format](session-format.md) - JSONL session file format, entry types, and SessionManager API.

## Platform setup

- [Windows](windows.md)
- [Termux on Android](termux.md)
- [tmux](tmux.md)
- [Terminal setup](terminal-setup.md)
- [Shell aliases](shell-aliases.md)

## Development

- [Development](development.md) - local setup, project structure, and debugging.
