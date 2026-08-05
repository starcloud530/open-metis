# @metis/os

Metis **本地 OS 围栏**（目标：macOS Seatbelt / Linux Landlock+seccomp / Windows→WSL2）。

开源版默认执行后端：`METIS_EXEC_BACKEND=os`（无 Docker）。

| 状态 | 行为 |
|---|---|
| 现在（MVP） | `createOsExecutor()` 透传本机 shell，注入 `METIS_SANDBOX=os` |
| O1+ | Seatbelt / Landlock + `metis.sandbox.json` 策略 |

Docker 强隔离引擎不在本仓；需要时见上游私有 `metis-sandbox` 或后续可选模块。
