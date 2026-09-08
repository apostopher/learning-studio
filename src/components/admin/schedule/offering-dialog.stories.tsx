import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { OfferingUser } from '#/lib/offering-schemas';
import { OfferingAddPerson } from './offering-add-person';
import { OfferingForm } from './offering-form';
import { levelSummary, OfferingRosterTable } from './offering-roster-table';
import {
  endDateFromWindow,
  formatWindowSummary,
  windowDaysBetween,
} from './offering-window';

const meta: Meta<typeof OfferingForm> = {
  title: 'Admin/Schedule/OfferingDialog',
  component: OfferingForm,
};
export default meta;

const ROSTER: OfferingUser[] = [
  {
    userId: 'u1',
    name: 'A. Lindholm',
    email: 'a.lindholm@example.com',
    level: 'basic',
  },
  {
    userId: 'u2',
    name: 'R. Ferreira',
    email: 'r.ferreira@example.com',
    level: 'intermediate',
  },
  {
    userId: 'u3',
    name: 'T. Okafor',
    email: 't.okafor@example.com',
    level: 'advanced',
  },
  {
    userId: 'u4',
    name: 'J. Vasseur',
    email: 'j.vasseur@example.com',
    level: null,
  },
  {
    userId: 'u5',
    name: 'M. Sandvik',
    email: 'm.sandvik@example.com',
    level: 'basic',
  },
];

const DIRECTORY: OfferingUser[] = [
  {
    userId: 'u6',
    name: 'D. Ramirez',
    email: 'd.ramirez@example.com',
    level: 'intermediate',
  },
  {
    userId: 'u7',
    name: 'S. Nakagawa',
    email: 's.nakagawa@example.com',
    level: 'basic',
  },
  {
    userId: 'u8',
    name: 'P. Novotny',
    email: 'p.novotny@example.com',
    level: 'advanced',
  },
];

const Harness = ({ initial }: { initial: OfferingUser[] }) => {
  const [startsOn, setStartsOn] = useState('2026-07-06');
  const [endsOn, setEndsOn] = useState('2026-10-16');
  const [users, setUsers] = useState(initial);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const days = windowDaysBetween(startsOn, endsOn);
  const onRoster = new Set(users.map((u) => u.userId));
  const term = query.trim().toLowerCase();
  const results = DIRECTORY.filter(
    (p) =>
      !onRoster.has(p.userId) &&
      (!term ||
        p.name.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term)),
  );

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-gray-6 bg-gray-2 p-6">
      <h2 className="font-semibold text-accent-text text-lg">
        UAS 16 Week Course
      </h2>
      <p className="mt-1 mb-5 text-secondary text-sm">
        An offering is one dated run of a course. The same course can run again
        later — that is a separate offering.
      </p>
      <OfferingForm
        startsOn={startsOn}
        onStartsOnChange={(next) => {
          setStartsOn(next);
          const shifted = days === null ? null : endDateFromWindow(next, days);
          if (shifted) setEndsOn(shifted);
        }}
        windowDays={days === null ? '' : String(days)}
        onWindowDaysChange={(next) => {
          const n = Number(next);
          if (next === '' || !Number.isInteger(n) || n < 1) return;
          const shifted = endDateFromWindow(startsOn, n);
          if (shifted) setEndsOn(shifted);
        }}
        endsOn={endsOn}
        onEndsOnChange={setEndsOn}
        summaryLine={formatWindowSummary(startsOn, endsOn)}
        rosterCount={levelSummary(users)}
        addPerson={
          <OfferingAddPerson
            query={query}
            onQueryChange={setQuery}
            results={results}
            selectedUserId={selected}
            onSelect={setSelected}
            onAdd={() => {
              const person = results.find((p) => p.userId === selected);
              if (!person) return;
              setUsers((prev) => [...prev, person]);
              setSelected(null);
              setQuery('');
            }}
            emptyLabel="Nobody matches that search who is not already on this offering."
          />
        }
        rosterTable={
          <OfferingRosterTable
            users={users}
            onRemove={(userId) =>
              setUsers((prev) => prev.filter((p) => p.userId !== userId))
            }
          />
        }
        onSubmit={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
        isSaving={false}
        submitLabel="Save"
      />
    </div>
  );
};

type Story = StoryObj<typeof OfferingForm>;

export const Editing: Story = { render: () => <Harness initial={ROSTER} /> };
export const EmptyRoster: Story = { render: () => <Harness initial={[]} /> };
