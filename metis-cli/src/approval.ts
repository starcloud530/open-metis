import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptApproval(action: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    // 调用方须先卸掉 Ink，否则提示被刷掉、stdin 像卡住
    const answer = await rl.question(`⚠ 需审批: ${action}\n允许执行？[y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}
