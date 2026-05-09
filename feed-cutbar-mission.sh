#!/bin/bash
cd ~/flock-cli

# Build a consolidated context file from your entire ecosystem
cat > /tmp/flock-context.txt << 'CTX'
[CUTBAR ECOSYSTEM MAP]
- cufin-flock: Web dashboard (vite), local AI engine
- flock-cli: CLI autonomous loop (deepseek-r1), planner, terminal tools
- cutbar-flock: Android app, backend, docs, workflows
- cutpay-forge: Wallet UI components (React), asset agents, build system
- CUTBAR_SUPREME_NETWORK: 111 companies, 9 agent roles per company (999 agents)
- cutbarfinance: Financial backend
- gemini/gemini-chat/gemini-flash: Additional AI interfaces

[MISSION]
Integrate all flock variants into a unified autonomous system.
Store the CUTBAR_SUPREME_NETWORK as a skill.
Map every module path.
CTX

# Feed it
echo -e "/auto $(cat /tmp/flock-context.txt)\n/audit\nexit" | node bin/flock.js 2>&1 | tail -30
