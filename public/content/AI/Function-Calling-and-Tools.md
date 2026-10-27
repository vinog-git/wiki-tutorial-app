# AI: Function Calling and Tools

## What it is

Function calling (also called tool use) lets a language model request that your code run a function. The model does not execute anything itself. It returns a structured request, your code runs the function, and the result goes back to the model.

Example: a user asks "What is the weather in Chennai?" The model returns a call to `get_weather` with `{"city": "Chennai"}`. Your code calls a weather API and sends the result back. The model then writes the final answer.

## Defining a tool

Each tool has three parts:

- **Name.** Short and descriptive, such as `search_orders`.
- **Description.** What the tool does and when to use it. The model chooses tools based on this text, so it matters.
- **Parameters.** A JSON Schema describing the arguments, with types, required fields, and allowed values.

```json
{
  "name": "get_weather",
  "description": "Get the current weather for a city.",
  "parameters": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "City name" }
    },
    "required": ["city"]
  }
}
```

## The call loop

1. Send the messages and tool definitions to the model.
2. If the model returns a tool call, validate the arguments.
3. Run the function and capture the result or error.
4. Append the result to the conversation and call the model again.
5. Stop when the model returns a normal answer.

## Good practice

- **Validate arguments.** Do not trust the model's values. Check types, ranges, and permissions.
- **Keep tools narrow.** One clear action per tool is easier to use correctly than a general tool with many modes.
- **Return useful errors.** A clear error message lets the model retry with corrected arguments.
- **Limit the number of tools.** Long tool lists confuse the model and use context space.
- **Mark side effects.** Tools that write, send, or delete should require confirmation.

## Security

Tool output can contain instructions written by an attacker, such as a web page that says "ignore previous instructions." Treat tool results as data, never as commands, and never let a model call a privileged action based only on text it read from outside sources.

## In Open WebUI

Open WebUI supports Tools and Functions written in Python. A Tool is a function the model can call during a chat, and a Function can change how requests and responses are handled. See Open WebUI.

## Where it leads

Tool calling is the basic building block of agentic AI. For a standard way to share tools across applications, see [MCP](/AI/MCP-Model-Context-Protocol).
