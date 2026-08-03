/**
 * Loading state, shaped like the page it precedes.
 *
 * A skeleton that mirrors the real layout — one wide lead, one narrow second,
 * then a row of columns — means the content does not jump when it arrives. A
 * centred spinner would reserve nothing and shift everything.
 */
export const NewsSkeleton = () => (
  <div className="animate-pulse" aria-hidden="true">
    <div className="border-gray-12 border-b-2 pb-3">
      <div className="border-gray-6 border-b pb-3">
        <div className="mx-auto h-10 w-2/3 rounded bg-gray-4 sm:h-14" />
      </div>
      <div className="flex justify-between pt-3">
        <div className="h-3 w-40 rounded bg-gray-4" />
        <div className="h-3 w-28 rounded bg-gray-4" />
      </div>
    </div>

    <div className="grid grid-cols-1 gap-8 pt-8 lg:grid-cols-3">
      <div className="flex flex-col gap-3 lg:col-span-2">
        <div className="aspect-video w-full rounded-sm bg-gray-4" />
        <div className="h-3 w-32 rounded bg-gray-4" />
        <div className="h-8 w-full rounded bg-gray-4" />
        <div className="h-8 w-4/5 rounded bg-gray-4" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="aspect-[4/3] w-full rounded-sm bg-gray-4" />
        <div className="h-3 w-24 rounded bg-gray-4" />
        <div className="h-6 w-full rounded bg-gray-4" />
      </div>
    </div>

    <div className="mt-10 grid grid-cols-1 gap-8 border-gray-6 border-t pt-8 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[3/2] w-full rounded-sm bg-gray-4" />
          <div className="h-3 w-20 rounded bg-gray-4" />
          <div className="h-5 w-full rounded bg-gray-4" />
          <div className="h-5 w-3/4 rounded bg-gray-4" />
        </div>
      ))}
    </div>

    <span className="sr-only">Loading news…</span>
  </div>
);
