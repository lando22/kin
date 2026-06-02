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

Or install from npm:

```bash
npm install -g @landongarrison/kin-coding-agent
```

Then run:

```bash
kin
```

## Get Started

On first launch, Kin will help you connect a model provider and start onboarding.

You can authenticate with an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
kin
```

Or start Kin and use `/login` for supported OAuth flows:

```bash
kin
/login
```

Once you are in a project, talk to Kin naturally:

```text
Explain this codebase and write down anything important you should remember.
```

Kin stores memory under `~/.kin/` and project context under `~/.kin/Projects/`.

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
