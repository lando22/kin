<p align="center">
  <img alt="Kin logo" src="logo.svg" width="88">
</p>
<p align="center"><em>Your personal intelligence. Remembers. Learns. Helps.</em></p>

# Kin

Kin is a personal coding agent for your terminal. It is designed to become more useful over time by remembering who you are, how you work, and what matters inside each project.

Kin is built from [Pi](https://github.com/badlogic/pi-mono), the minimal terminal coding agent created by [Mario Zechner](https://github.com/badlogic). Pi's philosophy is a small, extensible coding harness: give the model the core tools it needs, then let extensions, skills, prompt templates, and themes shape the rest.

Kin keeps that foundation, but puts memory first. The goal is not just an agent that can edit code; it is a collaborator that carries context forward, learns your preferences, and develops a durable picture of your projects.

## Install

macOS / Linux:

```bash
curl -fsSL https://lando22.github.io/kin/install.sh | sh
```

Then run:

```bash
kin
```

## Get Started

On first launch, Kin will help you connect a model provider and start onboarding.

You can authenticate with an OpenRouter API key:

```bash
export OPENROUTER_API_KEY=sk-or-...
kin
```

Or start Kin and use `/login` with your ChatGPT Plus/Pro subscription for Codex:

```bash
kin
/login
```

Once you are in a project, talk to Kin naturally:

```text
Explain this codebase and write down anything important you should remember.
```

Run `/init` for the first onboarding conversation. Kin will get to know you personally, learn how you like to work, explore the current project, and write the first version of its memory.

Kin stores personal memory under `~/.kin/Memory/`, project context under `~/.kin/Projects/`, reflections under `~/.kin/Reflections/`, and wake notes under `~/.kin/Wakes/`.

## Memory Lifecycle

Kin's memory is meant to last across your whole coding journey, not just the current chat window.

- **Onboarding:** `/init` starts a conversational first run. Kin learns who you are, how you think and collaborate, what you are building, and what goals or constraints should shape future work. `/reinit` refreshes that picture later without wiping existing memory.
- **Working memory:** During normal sessions, Kin quietly uses your personal portrait and the current project's context so it can pick up where you left off.
- **Reflect:** `kin reflect` runs a headless reflection cycle. Kin reviews recent sessions, checks relevant project context, gardens memory, records what happened, and can leave an agenda for the next day.
- **Wake:** `kin wake` reads the latest reflection, agenda, memory, and project context. If there is something useful to say or safe follow-up work to surface, it writes a wake note for the day.

## What Kin Does

- Reads, edits, writes, and runs commands in your project.
- Maintains long-running session history and branchable conversations.
- Remembers durable user and project context.
- Supports multiple model providers through `@landongarrison/kin-ai`.
- Can be extended with TypeScript extensions, skills, prompt templates, and themes.

## How Kin Differs From Pi

Pi is intentionally minimal: a terminal coding harness with a small tool core and a strong extension system.

Kin is a memory-first personal agent built on that base. It keeps the terminal workflow and extensibility, but treats continuity as a core feature:

- **Personal memory:** Kin keeps a portrait of how you work and what you care about.
- **Project memory:** Kin maintains durable project context so it does not rediscover the same facts every session.
- **Reflect and wake flows:** Kin can review prior sessions and surface useful follow-up context.
- **Fresh defaults:** Kin removes Pi-era process artifacts and focuses the repo around this personal-agent direction.

## Packages

| Package | Description |
|---------|-------------|
| [`@landongarrison/kin-coding-agent`](packages/coding-agent) | Terminal coding agent CLI |
| [`@landongarrison/kin-agent-core`](packages/agent) | Agent runtime with tool calling and session state |
| [`@landongarrison/kin-ai`](packages/ai) | Multi-provider LLM API |
| [`@landongarrison/kin-tui`](packages/tui) | Terminal UI components |

## Development

```bash
npm install
npm run build
npm run check
./test.sh
./kin-test.sh
```

## Credit

Kin is built on Pi, created by Mario Zechner (`badlogic`). Huge credit to Mario for the original terminal agent harness and the minimal, extensible architecture that made this direction possible.

## License

MIT
