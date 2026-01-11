import ngrok from "@ngrok/ngrok";

export type NgrokConfig = ngrok.Config;

export async function forwardServer({ server, config }: { server: Deno.HttpServer<Deno.NetAddr>; config: ngrok.Config }) {
  const listener = await ngrok.forward({
    ...config,
    addr: server.addr.port,
    proto: "http",
  });

  return listener.url();
}
