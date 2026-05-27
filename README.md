<p align="center">
  <a href="https://kin.dev">
    <img alt="pi logo" src="https://kin.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
</p>
<p align="center">
  <a href="https://kin.dev">kin.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Pi Agent Harness Mono Repo

This is the home of the pi agent harness project including our self extensible coding agent.

* **[@earendil-works/kin-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@earendil-works/kin-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/kin-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about pi:

* [Visit kin.dev](https://kin.dev), the project website with demos
* [Read the documentation](https://kin.dev/docs/latest), but you can also ask the agent to explain itself

## Share your OSS coding agent sessions

If you use pi or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/kin-share-hf`](https://github.com/badlogic/kin-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `kin-mono` sessions.

I regularly publish my own `kin-mono` work sessions here:

- [badlogicgames/kin-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/kin-mono)

## All Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/kin-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/kin-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/kin-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@earendil-works/kin-tui](packages/tui)** | Terminal UI library with differential rendering |

For Slack/chat automation and workflows see [earendil-works/kin-chat](https://github.com/earendil-works/kin-chat).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./kin-test.sh         # Run pi from sources (can be run from any directory)
```

## License

MIT
