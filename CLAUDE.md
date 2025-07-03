# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a workshop template for building voice agents with OpenAI's Agents SDK. It consists of two projects:
- `01-basic/`: A simple TypeScript example for learning the OpenAI Agents SDK
- `02-voice/`: A Next.js application implementing real-time voice agents with memory persistence

## Essential Commands

### Development
```bash
# Install dependencies for both projects
npm install

# Run the basic TypeScript example
npm run start:01

# Start the Next.js voice app development server
npm run start:02
```

### 02-voice Project Commands
```bash
cd 02-voice

# Development with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run ESLint
npm run lint
```

## Required Environment Variables

Both projects require:
- `OPENAI_API_KEY`: Your OpenAI API key
- `MEM_API_KEY`: Your Mem0 AI API key for memory persistence

## Architecture Overview

### 02-voice Next.js Application

The voice application follows a clear client-server separation pattern:

#### Server-Side (`src/app/server/`)
- **`client.ts`**: Singleton OpenAI client instance
- **`token.ts`**: Server actions for secure token generation and memory storage
  - `getSessionToken()`: Creates realtime sessions (gpt-4o-realtime-preview)
  - `getSessionTokenMini()`: Creates sessions with mini model
  - `addToMemory()`: Stores conversations in Mem0
- **`AIs.ts`**: Structured data extraction using Zod schemas

#### Client-Side
- **`page.tsx`**: Main voice agent interface with:
  - Real-time voice conversation using WebRTC
  - Multi-agent system with handoffs
  - Chat history and structured data display
  - Username-based memory persistence

### Multi-Agent System

The application implements two specialized agents:

1. **Data Collection Agent**
   - Pirate-themed personality for engaging interactions
   - Tools: `recordUserData`, `getFinalDailyData`
   - Collects structured daily data (cigarettes, sleep, feelings)

2. **Daily Progress Summary Agent**
   - Receives handoff from Data Collection Agent
   - Provides encouraging summaries and feedback

### Key Patterns

- **Server Actions**: All secure operations (API keys, external services) run server-side
- **Tool-based Architecture**: Agents use Zod-validated tools for structured operations
- **Event-driven Updates**: Real-time conversation state managed through events
- **Type Safety**: Extensive TypeScript and Zod schema usage throughout

## Git Workflow

**Important**: Always use the squash merge option when merging branches. This keeps the commit history clean and makes it easier to track changes.

```bash
# When merging via GitHub UI: Select "Squash and merge"
# When merging via CLI:
git merge --squash <branch-name>
git commit -m "Your merge commit message"
```

## Development Notes

- Currently there's an unresolved merge conflict in `02-voice/src/app/page.tsx` (lines 9-12, 336-453)
- No test framework is currently configured
- The project uses Next.js 15 with React 19 and Turbopack for fast development builds
- Tailwind CSS v4 is configured for styling

## Key Dependencies

- `@openai/agents`: Core SDK for building AI agents
- `@openai/agents-realtime`: Real-time voice capabilities
- `mem0ai`: Memory persistence service
- `zod`: Runtime type validation for agent tools
- `next`: Framework for the voice application