# @metis/core

通用 Agent 运行时。**零默认业务工具**——coding / 客服 / 玩墨 一律注入。

## 怎么写（纪律）

1. **只写循环外壳**：`runAgentLoop` = 调模型 → 执行工具 → 回填 → 三种终止（自然 / 直返 / 安全阀）
2. **不写域工具**：`read_file` / `submit_reply` / 改 Game Package 都不进本包
3. **不绑产品包名**：依赖只有 `@metis/protocol` + `zod`
4. **可注入**：`modelClient` / `tools` / `history` / `eventSink` / `onApproval` / `budget`
5. **事件流是唯一对外可见过程**：每步 `onEvent`，宿主可落盘、可 SSE

## 最小用法

```ts
import { createAgent, tool } from "@metis/core";
import { z } from "zod";

const echo = tool({
  name: "echo",
  description: "echo",
  schema: z.object({ text: z.string() }),
  returnDirectly: true,
  execute: async ({ text }) => ({ text }),
});

const agent = createAgent({
  model: { provider: "openai", apiKey: process.env.KEY, model: "deepseek-chat", baseUrl: "..." },
  tools: [echo], // 必须显式传入；省略 = []
});

const output = await agent.run("说你好", {
  onEvent: (e) => console.log(JSON.stringify(e)),
});
```

## 宿主分层

| 包 | 职责 |
|---|---|
| `@metis/core`（本包） | loop / tool / model / budget / session 辅助 |
| `@metis/protocol` | 事件契约 |
| `@metis/tools-coding` | read/write/run（AI coding 域，不进 core） |
| `@metis/cli`（另建） | `metis run` 闭环 |
| Hermes / Playink | 各自 harness + 业务 tools |

## 目录

```
src/
  agent.ts     createAgent（禁止 defaultTools）
  loop.ts      核心循环
  tool.ts      tool() 工厂
  model.ts     OpenAI 兼容 + mock + scripted
  context.ts   token 估算 / 拒大结果
  session.ts   事件日志读写（可选能力）
  types.ts     对外类型
  index.ts     导出面
tests/
  loop.test.ts
```
