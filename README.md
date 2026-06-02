<p align="center">
  <img alt="Kin logo" src="logo.svg" width="88">
</p>
<p align="center"><em>Your personal intelligence. Remembers. Learns. Helps.</em></p>

# Kin Agent Harness Mono Repo

This is the home of the kin agent harness project including our self extensible coding agent.

* **[@landongarrison/kin-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@landongarrison/kin-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@landongarrison/kin-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

## Install

macOS / Linux (no Node.js required):

```bash
curl -fsSL https://lando22.github.io/kin/install.sh | sh
```

Or via npm:

```bash
npm install -g @landongarrison/kin-coding-agent
```

Then run `kin` in any project. See the [coding-agent guide](packages/coding-agent/README.md) for the full walkthrough.

To learn more about Kin:

* [Read the documentation](packages/coding-agent/docs/index.md), or just ask the agent to explain itself

## Share your OSS coding agent sessions

If you use kin or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/kin-share-hf`](https://github.com/badlogic/kin-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `kin-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `kin-mono` sessions.

I regularly publish my own `kin-mono` work sessions here:

- [badlogicgames/kin-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/kin-mono)

## All Packages

| Package | Description |
|---------|-------------|
| **[@landongarrison/kin-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@landongarrison/kin-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@landongarrison/kin-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@landongarrison/kin-tui](packages/tui)** | Terminal UI library with differential rendering |

For Slack/chat automation and workflows see [earendil-works/kin-chat](https://github.com/earendil-works/kin-chat).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./kin-test.sh         # Run kin from sources (can be run from any directory)
```

## License

MIT
