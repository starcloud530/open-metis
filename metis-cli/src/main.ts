import { listSessions } from "@metis/core";
import { runCommand } from "./commands/run.js";
import { chatCommand } from "./commands/chat.js";
import { replaySession } from "./commands/replay.js";
import { listModelProfiles } from "./model-config.js";
import { getVersion } from "./version.js";

function printUsage(): void {
  process.stderr.write(`metis v${getVersion()} — 对话优先的 CLI agent

用法:
  metis                                 # 交互 REPL（一行品牌 + ›）
  metis chat [--verbose] [--no-brand]   # 同上；--no-brand 跳过字标
  metis "把 README 改成 pnpm"             # 一次性任务（Ink pretty）
  metis run "任务" --pretty|--json|--plain|--mock
  metis run "任务" --model <profile>
  metis models | sessions | replay <id>
  metis --version

REPL 内: /help /status /about /quit
配置: cwd 向上找 config/model/openai，或 METIS_CONFIG_DIR
`);
}

function parseFlags(args: string[]) {
  const json = args.includes("--json");
  const plain = args.includes("--plain");
  const pretty = json ? false : args.includes("--pretty") || !json;
  const mock = args.includes("--mock");
  const verbose = args.includes("--verbose");
  const noBrand = args.includes("--no-brand");
  const brand = args.includes("--brand") ? true : noBrand ? false : undefined;
  let modelProfile: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (
      a === "--pretty" ||
      a === "--json" ||
      a === "--mock" ||
      a === "--plain" ||
      a === "--verbose" ||
      a === "--brand" ||
      a === "--no-brand"
    ) {
      continue;
    }
    if (a === "--model") {
      modelProfile = args[++i];
      continue;
    }
    if (a.startsWith("--model=")) {
      modelProfile = a.slice("--model=".length);
      continue;
    }
    rest.push(a);
  }
  return {
    pretty: json ? false : pretty,
    plain,
    mock,
    verbose,
    brand,
    modelProfile,
    rest,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--version" || command === "-V" || command === "version") {
    process.stdout.write(`metis v${getVersion()}\n`);
    return;
  }

  if (command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  // 无参 → REPL
  if (!command) {
    await chatCommand({});
    return;
  }

  if (command === "chat") {
    const { mock, modelProfile, verbose, brand } = parseFlags(args.slice(1));
    await chatCommand({ mock, modelProfile, verbose, brand });
    return;
  }

  // 仅 flags（如 metis --verbose）：进 REPL
  if (command.startsWith("-")) {
    const { mock, modelProfile, verbose, brand, rest, pretty, plain } =
      parseFlags(args);
    if (rest.length === 0) {
      await chatCommand({ mock, modelProfile, verbose, brand });
      return;
    }
    await runCommand(rest.join(" ").trim(), {
      pretty,
      plain,
      mock,
      modelProfile,
    });
    return;
  }

  if (command === "models") {
    const profiles = await listModelProfiles();
    for (const p of profiles) process.stdout.write(`${p}\n`);
    return;
  }

  if (command === "sessions") {
    const sessions = await listSessions();
    for (const id of sessions) process.stdout.write(`${id}\n`);
    return;
  }

  if (command === "replay") {
    const { pretty, plain, rest } = parseFlags(args.slice(1));
    const sessionId = rest[0];
    if (!sessionId) {
      process.stderr.write("usage: metis replay <session-id>\n");
      process.exit(2);
    }
    await replaySession(sessionId, { pretty, plain });
    return;
  }

  const isRun = command === "run";
  const { pretty, plain, mock, modelProfile, rest } = parseFlags(
    isRun ? args.slice(1) : args,
  );
  const task = rest.join(" ").trim();
  if (!task) {
    printUsage();
    process.exit(2);
  }

  await runCommand(task, { pretty, plain, mock, modelProfile });
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
