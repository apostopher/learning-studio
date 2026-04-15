import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface McpAuthContext {
  userId: string
  scopes: string[]
}

export function createMcpServer(_ctx: McpAuthContext): McpServer {
  const server = new McpServer({
    name: 'rmtp-studio-mcp',
    version: '1.0.0',
    description: 'RMTP Studio MCP Server',
    icons: [{ src: 'https://rmtpstudio.com/favicon.ico' }],
    websiteUrl: 'https://rmtpstudio.com',
    title: 'RMTP Studio',
  })

  // Register tools/resources here. `_ctx.userId` scopes data access per session.
  //
  // Example:
  //   server.registerTool(
  //     "listProjects",
  //     { title: "List projects", description: "List projects for the current user", inputSchema: {} },
  //     async () => ({
  //       content: [{ type: "text", text: JSON.stringify(await getProjects(_ctx.userId)) }],
  //     }),
  //   );

  return server
}
