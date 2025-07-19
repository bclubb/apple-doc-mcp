#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { AppleDevDocsClient } from './apple-client.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class AppleDevDocsMcpServer {
  private server: Server;
  private client: AppleDevDocsClient;

  constructor() {
    this.server = new Server(
      {
        name: 'apple-dev-docs-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.client = new AppleDevDocsClient();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_technologies',
            description: 'List all available Apple technologies/frameworks',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get_documentation',
            description: 'Get detailed documentation for any symbol, class, struct, or framework. Handles both framework names and full documentation paths automatically. Examples: "SwiftUI", "UIViewController", "documentation/SwiftUI/View", "FoundationModels"',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Framework name (e.g., "SwiftUI", "UIKit", "FoundationModels") or full documentation path (e.g., "documentation/SwiftUI/View", "documentation/UIKit/UIViewController")',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'search_symbols',
            description: 'Search for symbols across Apple frameworks with wildcard support (* and ?). Examples: "RPBroadcast*", "*Controller", "*View*". Can search globally or within specific framework.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query with wildcard support. Examples: "RPBroadcast*" (prefix), "*Controller" (suffix), "*View*" (contains)',
                },
                framework: {
                  type: 'string',
                  description: 'Optional: Search within specific framework only (e.g., "UIKit", "SwiftUI")',
                },
                symbolType: {
                  type: 'string',
                  description: 'Optional: Filter by symbol type (class, protocol, struct, enum, function, etc.)',
                },
                platform: {
                  type: 'string',
                  description: 'Optional: Filter by platform (iOS, macOS, tvOS, watchOS, visionOS)',
                },
                maxResults: {
                  type: 'number',
                  description: 'Optional: Maximum number of results (default: 20)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'check_updates',
            description: 'Check for available updates from the git repository',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'list_technologies':
            return await this.handleListTechnologies();
          
          case 'get_documentation':
            return await this.handleGetDocumentation(request.params.arguments);
          
          case 'search_symbols':
            return await this.handleSearchSymbols(request.params.arguments);
          
          case 'check_updates':
            return await this.handleCheckUpdates();
          
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async handleListTechnologies() {
    const technologies = await this.client.getTechnologies();
    
    // Group technologies by type/category
    const frameworks: Array<{name: string, description: string}> = [];
    const others: Array<{name: string, description: string}> = [];
    
    Object.values(technologies).forEach((tech) => {
      if (tech.kind === 'symbol' && tech.role === 'collection') {
        const description = this.client.extractText(tech.abstract);
        const item = { name: tech.title, description };
        frameworks.push(item);
      } else {
        const description = this.client.extractText(tech.abstract);
        others.push({ name: tech.title, description });
      }
    });

    const content = [
      '# Apple Developer Technologies\n',
      '## Core Frameworks\n',
      ...frameworks.slice(0, 15).map(f => `• **${f.name}** - ${f.description}`),
      '\n## Additional Technologies\n',
      ...others.slice(0, 10).map(f => `• **${f.name}** - ${f.description}`),
      '\n*Use `get_documentation <name>` to explore any framework or symbol*',
      `\n\n**Total: ${frameworks.length + others.length} technologies available**`
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: content,
        },
      ],
    };
  }

  private async handleGetDocumentation(args: any) {
    const { path } = args;
    
    try {
      // Try the path as-is first
      const data = await this.client.getSymbol(path);
      
      const title = data.metadata?.title || 'Symbol';
      const kind = data.metadata?.symbolKind || 'Unknown';
      const platforms = this.client.formatPlatforms(data.metadata?.platforms);
      const description = this.client.extractText(data.abstract);
      
      let content = [
        `# ${title}\n`,
        `**Type:** ${kind}`,
        `**Platforms:** ${platforms}\n`,
        '## Overview',
        description
      ];

      // Add topic sections if available
      if (data.topicSections && data.topicSections.length > 0) {
        content.push('\n## API Reference\n');
        data.topicSections.forEach(section => {
          content.push(`### ${section.title}`);
          if (section.identifiers && section.identifiers.length > 0) {
            section.identifiers.slice(0, 5).forEach(id => {
              const ref = data.references?.[id];
              if (ref) {
                const refDesc = this.client.extractText(ref.abstract || []);
                content.push(`• **${ref.title}** - ${refDesc.substring(0, 100)}${refDesc.length > 100 ? '...' : ''}`);
              }
            });
            if (section.identifiers.length > 5) {
              content.push(`*... and ${section.identifiers.length - 5} more items*`);
            }
          }
          content.push('');
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: content.join('\n'),
          },
        ],
      };
    } catch (error) {
      // Check if user searched for a technology instead of a symbol
      const frameworkName = await this.checkIfTechnology(path);
      if (frameworkName) {
        return await this.handleTechnologyFallback(frameworkName, path);
      }
      
      // Re-throw the original error if it's not a technology
      throw error;
    }
  }

  private async checkIfTechnology(path: string): Promise<string | null> {
    try {
      const technologies = await this.client.getTechnologies();
      
      // Extract potential framework name from path
      const cleanPath = path.replace(/^documentation\//, '').toLowerCase();
      const pathParts = cleanPath.split('/');
      const potentialFramework = pathParts[0];
      
      // Check if it matches any technology
      for (const tech of Object.values(technologies)) {
        if (tech && tech.title) {
          if (tech.title.toLowerCase() === potentialFramework || 
              tech.title.toLowerCase() === cleanPath) {
            return tech.title;
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private async handleTechnologyFallback(frameworkName: string, originalPath: string) {
    try {
      const data = await this.client.getFramework(frameworkName);
      
      const title = data.metadata?.title || frameworkName;
      const description = this.client.extractText(data.abstract);
      const platforms = this.client.formatPlatforms(data.metadata?.platforms);
      
              const content = [
          `# 🔍 Framework Detected: ${title}\n`,
          `⚠️ **You searched for a framework instead of a specific symbol.**`,
          `To access symbols within this framework, use the format: **framework/symbol**`,
          `**Example:** \`documentation/${frameworkName}/View\` instead of \`${originalPath}\`\n`,
          `**Platforms:** ${platforms}\n`,
          `## Framework Overview`,
          description,
          '\n## Available Symbol Categories\n',
          ...data.topicSections.map(section => {
            const count = section.identifiers?.length || 0;
            return `• **${section.title}** (${count} symbols)`;
          }),
          '\n## Next Steps',
          `• **Browse symbols:** Use \`documentation/${frameworkName}/[SymbolName]\``,
          `• **Search symbols:** Use \`search_symbols\` with a specific symbol name`,
          `• **Explore framework:** Use \`get_documentation ${frameworkName}\` for detailed structure`
        ].join('\n');

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      // If framework lookup also fails, provide general guidance
      return {
        content: [
          {
            type: 'text',
            text: [
              `# ❌ Symbol Not Found: ${originalPath}\n`,
              `The requested symbol could not be located in Apple's documentation.`,
              `\n## Common Issues`,
              `• **Incorrect path format:** Expected \`documentation/Framework/Symbol\``,
              `• **Framework vs Symbol:** "${originalPath}" may be a framework name rather than a symbol`,
              `• **Case sensitivity:** Ensure proper capitalization (e.g., "SwiftUI" not "swiftui")`,
              `\n## Recommended Actions`,
              `• **List frameworks:** Use \`list_technologies\` to see available frameworks`,
              `• **Browse framework:** Use \`get_documentation <name>\` to explore structure`,
              `• **Search symbols:** Use \`search_symbols <query>\` to find specific symbols`,
              `• **Example search:** \`search_symbols "View"\` to find View-related symbols`
            ].join('\n'),
          },
        ],
      };
    }
  }

  private async handleSearchSymbols(args: any) {
    const { query, framework, symbolType, platform, maxResults = 20 } = args;
    
    let results;
    if (framework) {
      // Search within specific framework
      results = await this.client.searchFramework(framework, query, {
        symbolType,
        platform,
        maxResults
      });
    } else {
      // Global search across frameworks
      results = await this.client.searchGlobal(query, {
        symbolType,
        platform,
        maxResults
      });
    }

    const content = [
      `# Search Results for "${query}"\n`,
      framework ? `**Framework:** ${framework}` : '**Scope:** All frameworks',
      symbolType ? `**Symbol Type:** ${symbolType}` : '',
      platform ? `**Platform:** ${platform}` : '',
      `**Found:** ${results.length} results\n`
    ].filter(Boolean);

    if (results.length > 0) {
      content.push('## Results\n');
      results.forEach((result, index) => {
        content.push(`### ${index + 1}. ${result.title}`);
        content.push(`**Framework:** ${result.framework}${result.symbolKind ? ` | **Type:** ${result.symbolKind}` : ''}`);
        if (result.platforms) {
          content.push(`**Platforms:** ${result.platforms}`);
        }
        content.push(`**Path:** \`${result.path}\``);
        if (result.description) {
          content.push(`${result.description.substring(0, 150)}${result.description.length > 150 ? '...' : ''}`);
        }
        content.push('');
      });
      
      content.push(`*Use \`get_documentation\` with any path above to see detailed documentation*`);
    } else {
      content.push('## No Results Found\n');
      content.push('Try:');
      content.push('• Broader search terms');
      content.push('• Wildcard patterns (e.g., "UI*", "*View*")'); 
      content.push('• Removing filters');
    }

    return {
      content: [
        {
          type: 'text',
          text: content.join('\n'),
        },
      ],
    };
  }

  private async handleCheckUpdates() {
    try {
      // Fetch latest changes from remote
      await execAsync('git fetch origin');
      
      // Check current branch
      const { stdout: currentBranch } = await execAsync('git branch --show-current');
      const branch = currentBranch.trim();
      
      // Compare local vs remote commits
      const { stdout: behind } = await execAsync(`git rev-list --count HEAD..origin/${branch}`);
      const { stdout: ahead } = await execAsync(`git rev-list --count origin/${branch}..HEAD`);
      
      const behindCount = parseInt(behind.trim());
      const aheadCount = parseInt(ahead.trim());
      
      // Get latest commit info
      const { stdout: localCommit } = await execAsync('git log -1 --format="%h %s (%an, %ar)"');
      const { stdout: remoteCommit } = await execAsync(`git log -1 --format="%h %s (%an, %ar)" origin/${branch}`);
      
      let status = '';
      let icon = '';
      
      if (behindCount === 0 && aheadCount === 0) {
        status = 'Up to date';
        icon = '✅';
      } else if (behindCount > 0 && aheadCount === 0) {
        status = `${behindCount} update${behindCount > 1 ? 's' : ''} available`;
        icon = '🔄';
      } else if (behindCount === 0 && aheadCount > 0) {
        status = `${aheadCount} local change${aheadCount > 1 ? 's' : ''} ahead`;
        icon = '🚀';
      } else {
        status = `${behindCount} update${behindCount > 1 ? 's' : ''} available, ${aheadCount} local change${aheadCount > 1 ? 's' : ''} ahead`;
        icon = '⚡';
      }
      
      const content = [
        `# ${icon} Git Repository Status\n`,
        `**Branch:** ${branch}`,
        `**Status:** ${status}\n`,
        `## Current State`,
        `**Local commit:** ${localCommit.trim()}`,
        `**Remote commit:** ${remoteCommit.trim()}\n`
      ];
      
      if (behindCount > 0) {
        content.push(`## 💡 Available Updates`);
        content.push(`There ${behindCount === 1 ? 'is' : 'are'} **${behindCount}** new commit${behindCount > 1 ? 's' : ''} available.`);
        content.push(`**To update:** Run \`git pull origin ${branch}\` in your terminal, then restart the MCP server.\n`);
      }
      
      if (aheadCount > 0) {
        content.push(`## 🚀 Local Changes`);
        content.push(`You have **${aheadCount}** local commit${aheadCount > 1 ? 's' : ''} that haven't been pushed.`);
        content.push(`**To share:** Run \`git push origin ${branch}\` in your terminal.\n`);
      }
      
      if (behindCount === 0 && aheadCount === 0) {
        content.push(`## 🎉 All Good!`);
        content.push(`Your local repository is in sync with the remote repository.`);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: content.join('\n'),
          },
        ],
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: [
              `# ❌ Git Update Check Failed\n`,
              `Unable to check for updates from the git repository.`,
              `\n**Error:** ${error instanceof Error ? error.message : String(error)}`,
              `\n**Common Issues:**`,
              `• Not in a git repository`,
              `• No internet connection`,
              `• Git not installed or configured`,
              `• Repository access issues`
            ].join('\n'),
          },
        ],
      };
    }
  }

  private async checkAndDisplayUpdates() {
    try {
      // Quietly fetch latest info
      await execAsync('git fetch origin', { timeout: 5000 });
      
      const { stdout: currentBranch } = await execAsync('git branch --show-current');
      const branch = currentBranch.trim();
      
      const { stdout: behind } = await execAsync(`git rev-list --count HEAD..origin/${branch}`);
      const behindCount = parseInt(behind.trim());
      
      if (behindCount > 0) {
        console.error(`🔄 ${behindCount} update${behindCount > 1 ? 's' : ''} available! Use 'check_updates' tool for details and update instructions.`);
      }
    } catch (error) {
      // Silent fail - don't spam console with git errors
    }
  }

  async run() {
    // Check for updates on startup
    await this.checkAndDisplayUpdates();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Apple Developer Documentation MCP server running on stdio');
  }
}

const server = new AppleDevDocsMcpServer();
server.run().catch(console.error); 