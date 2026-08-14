// robots.txt. Shared passports must never be indexed — a crawled link is a permanent disclosure (FR-051b).
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // /p/ carries shared vehicle histories. /v/ and /t/ are owner-scoped and
      // return 404 to anyone else, but there is no reason to advertise them.
      disallow: ['/p/', '/v/', '/t/', '/claim', '/auth', '/garage'],
      allow: '/',
    },
  }
}
