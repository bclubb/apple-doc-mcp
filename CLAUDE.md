# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Apple Developer Documentation MCP (Model Context Protocol) server that provides seamless access to Apple's documentation API. The server exposes 4 tools for browsing frameworks, searching symbols, getting documentation, and checking repository updates.

## Architecture

### Core Components

- **`src/index.ts`**: Main MCP server implementation (`AppleDevDocsMcpServer` class)
  - Handles tool registration and routing
  - Implements intelligent fallback system for framework vs symbol detection
  - Manages git update checking and notifications
  - Uses stdio transport for MCP communication

- **`src/apple-client.ts`**: Apple Documentation API client (`AppleDevDocsClient` class)
  - HTTP client for Apple's documentation API at `developer.apple.com/tutorials/data`
  - Implements 10-minute caching with timestamps
  - Supports wildcard search patterns (`*`, `?`)
  - Handles both global and framework-specific searches

### Key Features

- **Smart Fallback System**: When users search for frameworks instead of symbols, provides helpful guidance
- **Caching Strategy**: 10-minute cache to avoid API rate limits and improve performance
- **Search Capabilities**: Global search across frameworks and targeted framework searches
- **Git Integration**: Automatic update notifications on startup and manual update checking

## Development Commands

### Build and Run
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run start        # Run the compiled server
node dist/index.js   # Direct execution for testing
```

### Development Workflow
When making updates:
1. `npm run build` - Compile TypeScript
2. `npm run start` - Run the server
3. Verify output shows: "Apple Developer Documentation MCP server running on stdio"
4. Use Ctrl+C to stop the server

## Using This MCP Server in Claude Code

### Initial Setup
Add to your Claude Code MCP configuration:
```json
{
  "mcpServers": {
    "apple-doc-mcp": {
      "command": "node",
      "args": ["/path/to/apple-doc-mcp/dist/index.js"]
    }
  }
}
```

### Development with Live Updates
The MCP server stays current during your Claude Code session:

1. **Make code changes** in `src/`
2. **Rebuild**: `npm run build`
3. **Test immediately** - MCP tools use the updated code automatically
4. **No restart needed** - Claude Code picks up changes on next tool use

### Why This Works
- MCP servers are stateless (each tool call spawns fresh process)
- Changes take effect immediately after rebuilding
- No need to restart Claude Code or reconfigure

### Project Structure
- All source code in `src/`
- Compiled output in `dist/`
- Entry point: `dist/index.js` (executable with shebang)

## MCP Tools

The server exposes these tools:

1. **`list_technologies`**: Browse all Apple frameworks
2. **`get_documentation`**: Get symbol/framework docs (auto-detects type)
3. **`search_symbols`**: Search with wildcards and filters
4. **`check_updates`**: Check for git repository updates

## Technical Details

- **Node.js**: ES modules (type: "module")
- **TypeScript**: Target ES2022, outputs to dist/
- **Dependencies**: MCP SDK, axios for HTTP requests
- **Timeout**: 15-second HTTP timeouts
- **Rate Limiting**: 10-minute cache to respect Apple's API

## Testing the Server

To verify the server works correctly:
```bash
node dist/index.js
# Should output: "Apple Developer Documentation MCP server running on stdio"
```

The server automatically checks for git updates on startup and displays notifications if updates are available.

## MCP Development Guidelines

For detailed information about when Claude Code restarts are required during development, see [MCP_DEVELOPMENT.md](./MCP_DEVELOPMENT.md). This guide explains:
- Which changes require restarting Claude Code
- Which changes update live without restart
- How to detect when a restart is needed
- Development workflow best practices