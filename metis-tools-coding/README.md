# @metis/tools-coding

AI coding 域工具包。依赖 `@metis/core` 的 `tool()`，**不进核心包**。

## 用法

```ts
import { createAgent } from "@metis/core";
import { createCodingTools, createLocalExecutor } from "@metis/tools-coding";
import { createOsExecutor } from "@metis/os";

const agent = createAgent({
  model: { provider: "openai", model: "...", apiKey: "..." },
  tools: createCodingTools({ exec: createOsExecutor() }),
  cwd: process.cwd(),
});
```

## 工具

- `read_file` — 默认 200 行窗口，可分页（宿主机 FS）
- `write_file` — 写文件并吐 `file_diff` 事件（宿主机 FS）
- `run_command` — 默认 `requiresApproval`；执行后端由宿主注入（`@metis/os` / `local`）
