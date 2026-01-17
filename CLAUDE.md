Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

---

## Project: DebugDuck VS Code Extension

DebugDuck is a VS Code extension that teaches developers to debug through progressive hints, pattern recognition, and proactive warnings - rather than just giving direct solutions.

### Core Philosophy
- **Progressive Learning**: Use Socratic method - guide users to discover solutions rather than giving answers
- **Pattern Recognition**: Track user's common mistakes and prevent repetition
- **Personalized Teaching**: Adapt to individual learning pace and style
- **Active Prevention**: Warn users before they make mistakes they've made before

### Target Audience
Beginner and intermediate developers who want to actually learn debugging rather than copy-paste solutions from AI.

### Key Differentiators from ChatGPT/Copilot
1. **Never gives direct solutions first** - Uses progressive hints (4 levels: question → direction → concept → example)
2. **Remembers your patterns** - Tracks YOUR specific bug history and learning progress
3. **Proactive warnings** - Catches bugs BEFORE you run code, based on your history
4. **Measures improvement** - Shows you're getting better over time (fewer hints needed)
5. **Contextual awareness** - Understands your entire codebase, not just a snippet
6. **Spaced repetition** - Reviews past bugs periodically to reinforce learning

### Tech Stack
- **Extension Framework**: VS Code Extension API (TypeScript)
- **AI Provider**: Claude API (Anthropic) for generating progressive hints
- **Storage**: 
  - VS Code Workspace State for session data
  - JSON files in `.debugduck/` folder for user progress
- **Language**: TypeScript throughout
- **Package Manager**: npm (required for VS Code extensions)

### Project Structure
```
debugduck-extension/
├── src/
│   ├── extension.ts              # Main entry point & command registration
│   ├── learningEngine/
│   │   ├── hintSystem.ts         # Progressive hint generation (CORE)
│   │   ├── patternTracker.ts     # Track user's bug patterns (CORE)
│   │   ├── preventionEngine.ts   # Real-time warnings (CORE)
│   │   └── spacedRepetition.ts   # Review system
│   ├── ai/
│   │   ├── claude.ts             # Claude API integration
│   │   └── prompts.ts            # Teaching-focused system prompts
│   ├── storage/
│   │   ├── localDB.ts            # JSON-based storage manager
│   │   └── patterns.ts           # Bug pattern definitions
│   └── ui/
│       ├── hintPanel.ts          # Webview for progressive hints
│       ├── progressDashboard.ts  # Learning progress visualization
│       └── inlineWarnings.ts     # Real-time code decorations
├── package.json                   # Extension manifest
├── tsconfig.json
└── README.md
```

### Core Features (Priority Order)

#### Tier 1: Must-Have (Hours 0-8)
1. **Progressive Hint System**
   - User highlights buggy code
   - AI generates 4-level progressive hints
   - UI shows hints one at a time
   - Tracks how many hints user needed
   - Records if user solved or gave up

2. **Basic Pattern Tracking**
   - Store completed debugging sessions
   - Identify bug types (undefined-access, null-reference, async-await, etc.)
   - Count occurrences per bug type
   - Calculate average hints needed per bug type

3. **Simple VS Code Integration**
   - Command: "DebugDuck: Analyze Selection"
   - Webview panel showing hints
   - Buttons: "Next Hint" and "Show Solution"

#### Tier 2: Nice-to-Have (Hours 8-16)
4. **Pattern Learning & Insights**
   - Track improvement over time
   - Identify strengths vs weaknesses
   - Generate personalized insights
   - Show "You're improving at X!" messages

5. **Real-time Prevention**
   - Analyze code as you type (debounced)
   - Show inline warnings for known patterns
   - Hover tooltips with suggestions
   - Visual decorations (underlines, icons)

6. **Progress Dashboard**
   - Webview showing learning stats
   - Charts: solve rate, hints needed over time
   - Bug pattern breakdown
   - Recent sessions list

#### Tier 3: Polish (Hours 16-24)
7. **Spaced Repetition**
   - Schedule reviews of past bugs
   - Daily reminder to review
   - Track review performance
   - Adjust intervals based on success

8. **Advanced Features**
   - Export learning report
   - Share anonymized patterns with team
   - Custom bug pattern definitions
   - Integration with Git history

### Key Data Structures

```typescript
// Core interfaces
interface Bug {
    code: string;
    language: string;
    errorMessage?: string;
    lineNumber?: number;
}

interface HintLevel {
    level: number;
    hint: string;
    type: 'question' | 'direction' | 'concept' | 'example';
}

interface LearningSession {
    id: string;
    bug: Bug;
    bugType: string;
    hintsGiven: HintLevel[];
    solved: boolean;
    hintsNeeded: number;
    timeSpent: number;
    timestamp: Date;
}

interface BugPattern {
    type: string;
    occurrences: number;
    firstSeen: Date;
    lastSeen: Date;
    averageHintsNeeded: number;
    improving: boolean;
    contexts: string[];
}

interface LearningProfile {
    userId: string;
    totalBugs: number;
    bugsSolved: number;
    averageHintsPerBug: number;
    patterns: Map<string, BugPattern>;
    strengths: string[];
    weaknesses: string[];
    streak: number;
}

interface Warning {
    type: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    line: number;
    suggestion: string;
    confidence: number;
}
```

### AI Prompt Strategy

**System Prompt Template for Hint Generation:**
```
You are a patient coding teacher using the Socratic method.

CRITICAL RULES:
1. NEVER give the solution directly
2. Guide through questions and hints
3. Each hint should be progressively more specific
4. Final hint should be obvious, but still let student connect the dots

Generate exactly 4 hint levels:
- Level 1: Ask a thought-provoking question
- Level 2: Point to the general area of the problem
- Level 3: Explain the concept they're missing
- Level 4: Show similar example, but not the exact solution

RESPOND IN JSON:
{
  "hints": [
    {"level": 1, "hint": "...", "type": "question"},
    {"level": 2, "hint": "...", "type": "direction"},
    {"level": 3, "hint": "...", "type": "concept"},
    {"level": 4, "hint": "...", "type": "example"}
  ],
  "bugType": "undefined-access|null-reference|async-await|...",
  "difficulty": "beginner|intermediate|advanced",
  "learningObjective": "What the student should understand"
}
```

### Storage Format

**User Progress File: `.debugduck/profile.json`**
```json
{
  "userId": "user-123",
  "totalBugs": 45,
  "bugsSolved": 38,
  "averageHintsPerBug": 2.3,
  "patterns": {
    "undefined-access": {
      "type": "undefined-access",
      "occurrences": 12,
      "firstSeen": "2025-01-10T10:00:00Z",
      "lastSeen": "2025-01-17T14:30:00Z",
      "averageHintsNeeded": 2.1,
      "improving": true,
      "contexts": ["array-access", "object-property"]
    }
  },
  "strengths": ["async-await", "array-methods"],
  "weaknesses": ["null-checks", "type-validation"],
  "streak": 7
}
```

**Session History: `.debugduck/sessions/2025-01-17.json`**
```json
[
  {
    "id": "session-123",
    "bug": {
      "code": "const user = users[id].name;",
      "language": "typescript",
      "errorMessage": "Cannot read property 'name' of undefined"
    },
    "bugType": "undefined-access",
    "hintsGiven": [
      {"level": 1, "hint": "What if 'id' is not in the array?", "type": "question"}
    ],
    "solved": true,
    "hintsNeeded": 1,
    "timeSpent": 120,
    "timestamp": "2025-01-17T14:30:00Z"
  }
]
```

### VS Code Commands

```json
// package.json contributions
{
  "contributes": {
    "commands": [
      {
        "command": "debugduck.analyze",
        "title": "DebugDuck: Analyze Selection"
      },
      {
        "command": "debugduck.showDashboard",
        "title": "DebugDuck: Show Progress Dashboard"
      },
      {
        "command": "debugduck.dailyReview",
        "title": "DebugDuck: Daily Review"
      },
      {
        "command": "debugduck.resetProgress",
        "title": "DebugDuck: Reset Learning Progress"
      }
    ],
    "keybindings": [
      {
        "command": "debugduck.analyze",
        "key": "ctrl+shift+d",
        "mac": "cmd+shift+d",
        "when": "editorHasSelection"
      }
    ]
  }
}
```

### Development Workflow

1. **Setup**
   ```bash
   npm install -g @vscode/vsce
   npm install
   ```

2. **Development**
   - Press F5 in VS Code to launch Extension Development Host
   - Make changes, reload with Cmd+R

3. **Testing**
   ```bash
   npm test
   ```

4. **Packaging**
   ```bash
   vsce package
   # Generates debugduck-0.1.0.vsix
   ```

### Demo Strategy

**3-Minute Demo Flow:**

1. **Problem Introduction (0:00-0:30)**
   - "How many of you copy-paste from ChatGPT?"
   - "Do you actually learn from it?"
   - "DebugDuck teaches you to debug"

2. **Live Coding Demo (0:30-1:30)**
   - Write buggy code: `const user = users[id].name;`
   - Highlight code, run DebugDuck
   - Show progressive hints appearing
   - User "thinks" and fixes it
   - Show "You needed 2 hints. Last time: 3 hints. Improving!"

3. **Pattern Prevention (1:30-2:00)**
   - Start typing similar buggy code
   - Real-time warning appears: "⚠️ You've made this mistake 5x"
   - Hover shows suggestion
   - Fix it immediately

4. **Progress Dashboard (2:00-2:30)**
   - Show learning stats
   - "85% solve rate, up from 60%"
   - Pattern breakdown
   - Improvement graph

5. **Closing (2:30-3:00)**
   - "Not just fixing bugs - preventing them"
   - "Not just using AI - learning from it"
   - GitHub link + demo QR code

### Success Metrics

**For Hackathon Judging:**
- ✅ Unique value prop (not "ChatGPT in VS Code")
- ✅ Clear target audience (learners)
- ✅ Working demo (live coding)
- ✅ Technical depth (pattern recognition, ML-like learning)
- ✅ Social impact (helps beginners learn better)
- ✅ Polished UI (professional dashboard)

### Environment Variables

```env
# .env file
ANTHROPIC_API_KEY=sk-ant-...
DEBUGDUCK_ENV=development
LOG_LEVEL=debug
```

### Common Bug Types to Track

1. **undefined-access**: Accessing properties/indices that don't exist
2. **null-reference**: Not checking for null/undefined
3. **async-await**: Missing await, unhandled promises
4. **type-mismatch**: Wrong data types
5. **off-by-one**: Array index errors
6. **scope-issues**: Variable scope problems
7. **infinite-loop**: Loop conditions
8. **mutation**: Unintended state changes
9. **comparison**: == vs ===, NaN comparisons
10. **error-handling**: Missing try-catch

### Resources & Documentation

- VS Code Extension API: https://code.visualstudio.com/api
- Anthropic Claude API: https://docs.anthropic.com/
- Socratic Teaching Method: Focus on asking questions that lead to discovery
- Spaced Repetition (SM-2): https://en.wikipedia.org/wiki/SuperMemo

### Notes for Development

- Keep hint generation fast (<2 seconds)
- Cache AI responses where possible
- Use VS Code's diagnostic collection for warnings
- Store all data locally (no server needed for MVP)
- Gracefully handle API errors
- Add loading states for all async operations
- Test with various languages (TypeScript, JavaScript, Python)
