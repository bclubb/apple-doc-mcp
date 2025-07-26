# MCP Development Guide for Claude

This guide helps Claude understand the MCP development workflow for this Apple Documentation server.

## Simple Rule: Always Restart Claude

⚠️ **After making any changes to the MCP server, restart Claude Code to see the updates.**

Claude caches both tool definitions and tool responses, so all changes require a restart to be visible when testing through the MCP tools.

## Development Workflow

1. Make changes to the code
2. Run `npm run build`
3. **Restart Claude Code and resume session** ⚠️
4. Test with MCP tools

## Testing Without Restart

You can verify changes work by testing the server directly:

```bash
# Test a specific tool directly
echo '{"jsonrpc":"2.0","id":"test","method":"tools/call","params":{"name":"get_documentation","arguments":{"path":"FoundationModels"}}}' | node dist/index.js

# This shows the actual output without Claude's caching
```

## Warning for Claude

When making changes, Claude should warn users:

```markdown
⚠️ **Restart Required**: You've made changes to the MCP server. 
Please restart Claude Code and resume your session to see these changes.
```