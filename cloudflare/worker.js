import { Container, getContainer } from "@cloudflare/containers";

export class JSProxContainer extends Container {
  defaultPort = 8080;
  // Open WebSockets (the Wisp connection) count as activity in @cloudflare/containers,
  // so a long game session does not put the container to sleep.
  sleepAfter = "2m";

  constructor(ctx, env) {
    super(ctx, env);
    // Set with: npx wrangler secret put JSPROX_PASSWORD
    if (env.JSPROX_PASSWORD) this.envVars = { JSPROX_PASSWORD: env.JSPROX_PASSWORD };
  }
}

export default {
  fetch(request, env) {
    return getContainer(env.JSPROX_CONTAINER).fetch(request);
  },
};
