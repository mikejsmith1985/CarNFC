// OpenNext configuration: adapts the Next.js build to run as a Cloudflare Worker.
//
// Cloudflare rather than a Node host because the RLL site already deploys this
// way and the account, domain and tooling are proven there — Article VII says
// use what the project already has rather than introducing a second platform.

import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({
  // Incremental cache is deliberately left off. Every route that matters here
  // is `force-dynamic` — a service card reads the owner's live history, and a
  // cached passport would keep answering after the share was revoked.
})
