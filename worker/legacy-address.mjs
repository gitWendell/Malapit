import { publicAddressRedirect } from '../lib/public-address.mjs';

export default {
  async fetch(request, env) {
    const redirect = publicAddressRedirect(request);
    if (redirect) return redirect;
    // Preserve the URL, cookies, method and body for already-open tabs and
    // in-flight callbacks. The main app performs all normal access checks.
    return env.MALAPIT.fetch(request);
  },
};
