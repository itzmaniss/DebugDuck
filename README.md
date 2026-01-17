# DebugDuck

A VS Code extension that teaches you to debug through progressive hints, pattern recognition, and proactive warnings - rather than just giving direct solutions.

## Why DebugDuck?

Most AI coding assistants give you the answer immediately. You copy-paste, it works, but you don't actually learn. DebugDuck takes a different approach:

- **Progressive Hints**: Uses the Socratic method - guides you to discover solutions through 4 levels of increasingly specific hints
- **Pattern Recognition**: Tracks YOUR specific bug history and identifies patterns in your mistakes
- **Proactive Warnings**: Catches bugs BEFORE you run code, based on mistakes you've made before
- **Measures Improvement**: Shows you're getting better over time (fewer hints needed per bug type)

## Features

### Progressive Hint System
Select buggy code and get guided through debugging with hints that start vague and get more specific:
1. **Question** - A thought-provoking question to point you in the right direction
2. **Direction** - Points to the general area of the problem
3. **Concept** - Explains the concept you might be missing
4. **Example** - Shows a similar example (but not the exact solution)

### Pattern Tracking
DebugDuck remembers your debugging history:
- Tracks bug types you encounter (undefined access, null references, async/await issues, etc.)
- Calculates how many hints you typically need per bug type
- Identifies your strengths and weaknesses
- Shows improvement trends over time

### Real-time Prevention
Get warnings as you type:
- Analyzes code in real-time (debounced)
- Shows inline warnings for patterns you've struggled with before
- Displays confidence scores for each warning

### Progress Dashboard
Visualize your learning journey:
- Total bugs fixed and solve rate
- Average hints needed (trending down = you're improving!)
- Bug pattern breakdown
- Achievement system

## Installation

### From VS Code Marketplace
*(Coming soon)*

### From Source
```bash
# Clone the repository
git clone https://github.com/itzmaniss/debugduck.git
cd debugduck

# Install dependencies
bun install

# Compile
bun run compile

# Package the extension
bun run package
```

Then install the generated `.vsix` file in VS Code:
1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Install from VSIX"
4. Select the generated `debugduck-0.1.0.vsix` file

## Configuration

After installation, configure your API key:

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "DebugDuck"
3. Enter your Anthropic API key in `debugduck.apiKey`

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `debugduck.apiKey` | `""` | Your Anthropic API key for Claude |
| `debugduck.maxHints` | `4` | Maximum hints before showing solution (2-6) |
| `debugduck.enableRealTimeWarnings` | `true` | Enable real-time bug warnings while typing |

## Usage

### Analyze Selection
1. Select buggy code in the editor
2. Press `Cmd+Shift+D` (Mac) or `Ctrl+Shift+D` (Windows/Linux)
3. Or run command: "DebugDuck: Analyze Selection"

### Commands
- **DebugDuck: Analyze Selection** - Analyze selected code for bugs
- **DebugDuck: Show Progress Dashboard** - View your learning statistics
- **DebugDuck: Daily Review** - Review past bugs using spaced repetition
- **DebugDuck: Reset Learning Progress** - Clear all learning data

## Supported Bug Types

DebugDuck can detect and help you learn about:

| Bug Type | Description |
|----------|-------------|
| `undefined-access` | Accessing properties/indices that don't exist |
| `null-reference` | Not checking for null/undefined |
| `async-await` | Missing await, unhandled promises |
| `type-mismatch` | Wrong data types |
| `off-by-one` | Array index errors |
| `scope-issue` | Variable scope problems |
| `infinite-loop` | Loop condition errors |
| `mutation` | Unintended state changes |
| `comparison` | == vs ===, NaN comparisons |
| `error-handling` | Missing try-catch blocks |

## Project Structure

```
debugduck/
├── src/
│   ├── extension.ts           # VS Code extension entry point
│   ├── types.ts               # Shared TypeScript types
│   ├── api/
│   │   └── index.ts           # Unified API for frontend
│   ├── ai/
│   │   ├── claude.ts          # Claude API integration
│   │   └── prompts.ts         # Teaching-focused prompts
│   ├── learningEngine/
│   │   ├── hintSystem.ts      # Progressive hint generation
│   │   ├── patternTracker.ts  # Bug pattern tracking
│   │   ├── preventionEngine.ts # Real-time warnings
│   │   └── bugDetectors.ts    # Static bug detection
│   └── storage/
│       ├── fileStorage.ts     # JSON file storage (default)
│       ├── localDB.ts         # SQLite storage (optional)
│       └── sessionHistory.ts  # Session persistence
├── test/                      # Test files (239 tests)
├── package.json
└── README.md
```

## Development

### Prerequisites
- [Bun](https://bun.sh) runtime
- VS Code 1.85.0 or higher
- Anthropic API key

### Running Tests
```bash
bun test
```

### Development Mode
Press F5 in VS Code to launch the Extension Development Host.

### Building
```bash
bun run compile
```

## Data Storage

DebugDuck stores your learning data locally in the `.debugduck/` folder:

```
.debugduck/
├── profile.json      # Your learning profile
├── config.json       # Extension configuration
└── sessions/
    └── 2025-01-17.json  # Daily session logs
```

All data stays on your machine - nothing is sent to external servers except the code snippets you analyze (sent to Claude API).

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **AI**: Claude API (Anthropic)
- **Storage**: JSON files (default) or SQLite
- **Testing**: Bun test (239 tests, 454 assertions)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Built with [Claude](https://anthropic.com) by Anthropic
- Inspired by the Socratic teaching method
- Spaced repetition based on the SM-2 algorithm
