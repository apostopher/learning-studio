/**
 * The 3D airmanship section, before there is a 3D airmanship section.
 *
 * It says so in as many words rather than rendering an empty shell: every
 * other section in this shell can be empty because of what the actor is
 * allowed to see, so "nothing here" without a reason reads as a permissions
 * problem. This one is simply unbuilt, and says which it is.
 */
export const AirmanshipPlaceholder = () => (
  <div className="content-grid py-10">
    <div className="content flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-primary">3D airmanship</h1>
        <p className="text-secondary text-sm">
          The 3D airmanship authoring surface.
        </p>
      </header>

      <div className="rounded-xl border border-gray-6 border-dashed bg-gray-2 p-10 text-center">
        <p className="font-medium text-primary text-sm">Not built yet</p>
        <p className="mt-1 text-secondary text-sm">
          This section has no content or settings yet. Nothing is hidden by your
          permissions — there is simply nothing here so far.
        </p>
      </div>
    </div>
  </div>
);
