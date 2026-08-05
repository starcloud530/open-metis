import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent, createScriptedModelClient, runAgentLoop, tool } from "../src/index.js";

describe("runAgentLoop", () => {
  it("自然终止：模型不调工具，文本即 output", async () => {
    const events: string[] = [];
    const agent = createAgent({
      model: { provider: "mock", model: "mock-llm" },
      tools: [],
    });
    const output = await agent.run("hello world", {
      onEvent: (e) => events.push(e.type),
    });
    expect(output.kind).toBe("text");
    if (output.kind === "text") expect(output.text).toContain("MOCK");
    expect(events).toContain("session_start");
    expect(events).toContain("session_end");
  });

  it("直返工具：returnDirectly 触发即终止，args 即 output", async () => {
    const submit = tool({
      name: "submit_result",
      description: "Submit final result",
      schema: z.object({ summary: z.string() }),
      returnDirectly: true,
      execute: async () => ({}),
    });

    const result = await runAgentLoop(
      {
        model: { provider: "mock", model: "test" },
        modelClient: createScriptedModelClient([
          {
            text: "",
            toolCalls: [
              {
                id: "1",
                name: "submit_result",
                arguments: JSON.stringify({ summary: "done" }),
              },
            ],
          },
        ]),
        tools: [submit],
      },
      "finish",
      { autoApprove: true, sessionId: "test_direct" },
    );

    expect(result.status).toBe("ok");
    expect(result.output).toEqual({
      kind: "tool",
      name: "submit_result",
      args: { summary: "done" },
    });
  });

  it("安全阀：超过 maxTurns 异常终止", async () => {
    const ping = tool({
      name: "ping",
      description: "ping",
      schema: z.object({}),
      execute: async () => ({ pong: true }),
    });

    const result = await runAgentLoop(
      {
        model: { provider: "mock", model: "test" },
        modelClient: createScriptedModelClient(
          [],
          () => ({
            text: "",
            toolCalls: [{ id: "x", name: "ping", arguments: "{}" }],
          }),
        ),
        tools: [ping],
        budget: { maxTurns: 2 },
      },
      "keep pinging",
      { autoApprove: true, sessionId: "test_valve" },
    );

    expect(result.status).toBe("error");
  });

  it("不传 tools 时无默认业务工具", async () => {
    const agent = createAgent({
      model: { provider: "mock", model: "x" },
    });
    const output = await agent.run("anything");
    expect(output.kind).toBe("text");
  });
});

describe("tool factory", () => {
  it("zod schema 可挂上", () => {
    const t = tool({
      name: "test",
      description: "test",
      schema: z.object({ x: z.number() }),
      execute: async (args) => args,
    });
    expect(t.name).toBe("test");
  });
});
