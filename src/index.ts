import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createServer } from "./server.js";

const serverHandle = serveStdio(createServer, {
  onerror: (error) => {
    // stdout is reserved for MCP protocol messages when using stdio.
    console.error("GitHub Project Health MCP server error:", error);
  },
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.error(`Received ${signal}; shutting down.`);

  try {
    await serverHandle.close();
  } finally {
    process.exit(0);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
