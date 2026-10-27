# AI: MCP (Model Context Protocol)

## What it is

The Model Context Protocol (MCP) is an open standard for connecting AI applications to external tools, data sources, and prompts. Instead of writing custom integration code for every model and every tool pair, a tool exposes an MCP server once, and any MCP-capable client can use it.

## The parts

- **Host.** The AI application the user works in, such as an IDE assistant or a chat app.
- **Client.** The component inside the host that keeps a connection to one server.
- **Server.** A program that exposes capabilities to the client.

A server can offer three kinds of things:

- **Tools.** Actions the model can call, such as creating an issue or running a query.
- **Resources.** Read-only data the client can load into context, such as a file or a database record.
- **Prompts.** Reusable prompt templates the user can select.

## Transport

Clients and servers talk with JSON-RPC messages. Local servers usually communicate over standard input and output. Remote servers use HTTP-based transports. The protocol defines the message format, so the transport can change without changing the server's logic.

## Why it matters

- **Write once, reuse everywhere.** A server built for one client works with others.
- **Clear boundaries.** The server decides what it exposes, and the host decides what the user approves.
- **Ecosystem.** Many ready-made servers exist for common systems such as Git, databases, and browsers.

## Security points

MCP servers run code and access data on the user's behalf, so treat them like any other dependency:

- Only install servers from sources you trust.
- Give each server the smallest access it needs, such as a read-only database user.
- Review tool descriptions. A malicious server can use them to influence the model.
- Require user approval for actions with side effects.

## Relation to function calling

MCP does not replace function calling and tools. Function calling is how the model requests a tool call. MCP is the standard way the tools are discovered and reached. The two work together.

## Relation to agents

An agentic AI system often gets its tools through MCP servers. Adding a new capability then means connecting a server, not writing new integration code in the agent.
