import { Container, getContainer } from "@cloudflare/containers";

export class JSProxContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
}

export default {
  fetch(request, env) {
    return getContainer(env.JSPROX_CONTAINER).fetch(request);
  },
};
