# Metis CLI

## 交互 REPL

```bash
metis                 # 或 metis chat
```

## 一次性任务

```bash
metis "用一句话介绍你自己"
metis run "任务" --mock
metis run "任务" --json
metis run "任务" --plain
```

## 配置

优先环境变量（推荐开源用户）：

```bash
export METIS_API_KEY=sk-...
export METIS_BASE_URL=https://api.openai.com/v1
export METIS_MODEL=gpt-4o-mini   # 可选
```

或放置 `config/model/openai/<profile>.yaml` / `METIS_CONFIG_DIR` / `~/.metis/config`。  
示例见仓库 `config/model/openai/example.yaml.example`。

### 执行后端

| 变量 | 说明 |
|---|---|
| `METIS_EXEC_BACKEND=os\|local` | 默认 `os`（本地围栏；MVP 暂等同本机 shell）；`local` 逃生舱 |

## 全局安装

```bash
pnpm install
pnpm install:global    # → ~/.local/bin/metis
```
