import type { Config, PushoverConfigParams } from "../config.ts";

export interface PushoverParams {
  message: string;
  title?: string;
  device?: string;
  priority?: -2 | -1 | 0 | 1 | 2;
}

export async function callPushover(
  { token, user, message, title, device }:
    & PushoverConfigParams
    & PushoverParams,
): Promise<void> {
  const body = JSON.stringify({
    token,
    user,
    title,
    message,
    device,
  });

  await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
}

export type NotifyFn = (params: PushoverParams) => Promise<void>;

export function generateNotifyFn(config: Config): NotifyFn {
  if (!config.pushover) return () => Promise.resolve();

  return (params: PushoverParams) =>
    callPushover({
      ...config.pushover as PushoverConfigParams,
      ...params,
    });
}
