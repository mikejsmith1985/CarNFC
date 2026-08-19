// The production side: making runs of tags before any of them has an owner.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { isAdminAccount, listTagBatches } from '@/app/actions/admin-tags'
import { TagBatchCreator } from '@/components/admin/TagBatchCreator'
import { TagBatchList } from '@/components/admin/TagBatchList'

export const metadata = { title: 'Tag runs · ServiceCard' }
export const dynamic = 'force-dynamic'

/**
 * Makes and inspects batches of tags for manufacture.
 *
 * Not linked from anywhere in the product. Everything else here belongs to a
 * vehicle owner; this belongs to whoever is shipping hardware, and an owner
 * finding it would only be confused by it. A non-admin gets a 404 rather than a
 * refusal, because saying "not allowed" would confirm the page exists.
 */
export default async function AdminTagsPage() {
  if (!(await isAdminAccount())) notFound()

  const batches = await listTagBatches()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.rootlevellabs.tech'

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 py-8 pb-16">
      <Link
        href="/garage"
        className="-ml-1 inline-flex min-h-touch items-center gap-1 text-sm text-text-muted"
      >
        <ChevronLeft size={16} aria-hidden />
        Garage
      </Link>

      <h1 className="mt-2 text-xl font-bold">Tag runs</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Tags made here have no owner. Whoever taps one first claims it, which is what lets them be
        printed before you know who is buying.
      </p>

      <div className="mt-6 space-y-6">
        <TagBatchCreator appUrl={appUrl} />

        <section aria-label="Previous runs">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-secondary">
            Previous runs
          </h2>
          <TagBatchList batches={batches} appUrl={appUrl} />
        </section>
      </div>
    </main>
  )
}
