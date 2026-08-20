/**
 * Idempotent migration for course-scoped staff roles.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole schema
 * and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-staff-roles
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Seeding the two course-scoped roles…');
  await db.execute(sql`
    insert into "user_roles" ("name", "description")
    values
      ('subject-expert', 'Subject Expert (SME): authors a course''s structure and content'),
      ('course-manager', 'Course Manager (CRS-MGR): prepares a course''s structure')
    on conflict ("name") do nothing;
  `);

  console.info('Creating course_staff…');
  await db.execute(sql`
    create table if not exists "course_staff" (
      "id"          integer primary key generated always as identity,
      "user_id"     varchar(255) not null references "user_profiles"("user_id") on delete cascade,
      "course_id"   integer not null references "courses"("id") on delete cascade,
      "role_id"     integer not null references "user_roles"("id") on delete restrict,
      "assigned_by" varchar(255),
      "created_at"  timestamp not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists "course_staff_user_course_role_idx"
      on "course_staff" ("user_id", "course_id", "role_id");
  `);
  await db.execute(sql`
    create index if not exists "course_staff_user_course_idx"
      on "course_staff" ("user_id", "course_id");
  `);
  await db.execute(sql`
    create index if not exists "course_staff_course_idx"
      on "course_staff" ("course_id");
  `);

  // Grants ARE seeded here, unlike migrate-user-management.ts which deliberately
  // left role_permissions empty. The difference: `admin` already existed and
  // silently gaining powers would have surprised its holders, whereas these two
  // roles are new and hold nothing until granted — an unseeded SME would be a
  // role that does nothing, which is the failure this design exists to avoid.
  console.info('Seeding grants for the new roles…');
  await db.execute(sql`
    insert into "role_permissions" ("role_id", "entity", "action")
    select r."id", g."entity", g."action"
    from "user_roles" r
    cross join (values
      ('structure','create'), ('structure','read'), ('structure','update'), ('structure','delete'),
      ('content','create'),   ('content','read'),   ('content','update'),   ('content','delete'),
      ('staff','create'),     ('staff','read'),     ('staff','delete')
    ) as g("entity","action")
    where r."name" = 'subject-expert'
    on conflict do nothing;
  `);
  await db.execute(sql`
    insert into "role_permissions" ("role_id", "entity", "action")
    select r."id", g."entity", g."action"
    from "user_roles" r
    cross join (values
      ('structure','create'), ('structure','read'), ('structure','update'), ('structure','delete'),
      ('content','read')
    ) as g("entity","action")
    where r."name" = 'course-manager'
    on conflict do nothing;
  `);

  // NOTE: `admin` is deliberately NOT granted structure/content. Senior staff
  // administer the university and do not author its syllabi; an admin who needs
  // to edit a course assigns themselves as a subject-expert, which leaves a
  // record in course_staff.assigned_by. Admin DOES get course:* and staff:*.
  console.info('Seeding admin grants for course and staff…');
  await db.execute(sql`
    insert into "role_permissions" ("role_id", "entity", "action")
    select r."id", g."entity", g."action"
    from "user_roles" r
    cross join (values
      ('course','create'), ('course','read'), ('course','update'), ('course','delete'),
      ('staff','create'),  ('staff','read'),  ('staff','delete')
    ) as g("entity","action")
    where r."name" = 'admin'
    on conflict do nothing;
  `);

  const roles = await db.execute(
    sql`select id, name from "user_roles" order by id`,
  );
  console.info('Schema applied. Roles now:');
  for (const row of roles.rows) console.info(`  ${row.id}  ${row.name}`);
  console.info(
    'Owner is absent from role_permissions by design — it bypasses checks.',
  );
  console.info('Next: assign staff to courses from /admin.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
