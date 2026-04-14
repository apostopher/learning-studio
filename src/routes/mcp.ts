import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createFileRoute } from "@tanstack/react-router";

import { handleMcpRequest } from "#/utils/mcp-handler";

const server = new McpServer({
  name: "rmtp-studio-mcp",
  version: "1.0.0",
  description: "RMTP Studio MCP Server",
  icons: [{ src: "https://rmtpstudio.com/favicon.ico" }],
  websiteUrl: "https://rmtpstudio.com",
  title: "RMTP Studio",
});

// server.registerTool(
//   "addTodo",
//   {
//     title: "Tool to add a todo to a list of todos",
//     description: "Add a todo to a list of todos",
//     inputSchema: {
//       title: z.string().describe("The title of the todo"),
//     },
//   },
//   ({ title }) => ({
//     content: [{ type: "text", text: String(addTodo(title)) }],
//   }),
// );

// server.registerResource(
//   "counter-value",
//   "count://",
//   {
//     title: "Counter Resource",
//     description: "Returns the current value of the counter",
//   },
//   async (uri) => {
//     return {
//       contents: [
//         {
//           uri: uri.href,
//           text: `The counter is at 20!`,
//         },`
//       ],
//     };
//   }
// );

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => handleMcpRequest(request, server),
    },
  },
});
