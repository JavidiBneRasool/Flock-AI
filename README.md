# Flock-AI

Flock-AI is a Local AI Autonomous Engine, part of the CUFIN.FLOCK ecosystem. It is designed to be a modular, multi-agent orchestration system that operates offline with full filesystem authority.

## Features

- **Architectural Shift**: Re-architected into a Local AI Autonomous Engine.
- **Local-First**: Uses `ollama` for local inference, removing cloud dependencies.
- **Modular Design**: Structured with `agents`, `tools`, and `memory` for multi-agent logic.
- **Autonomous Operations**: Capable of mapping ecosystems and executing autonomous runs.
- **Audit Trails**: Detailed logging of all interactions and significant actions.

## Getting Started

### Prerequisites

- Node.js
- [Ollama](https://ollama.ai/)

### Installation

```bash
npm install
```

### Usage

```bash
# To run the flock tool
node bin/flock.js
```

## Project Structure

- `bin/`: CLI entry points.
- `src/agents/`: Multi-agent logic (auditor, autonomous, brain, coordinator, planner).
- `src/memory/`: Memory engine and initialization prompts.
- `src/tools/`: CLI enhancement and terminal tools.

## License

This project is licensed under the MIT License.
