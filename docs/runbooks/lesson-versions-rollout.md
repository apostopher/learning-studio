# Lesson versions: rollout

## Update of 2026-11-25: versions become labels

The first rollout (sections 1 and 2) is done. This release goes the other way
round: **deploy first, then migrate.** The code it replaces needs the index this
migration drops: migrate first and adding a lesson to a course, or updating one,
fails until the deploy.

1. Deploy: push `main` and wait for Vercel to say Ready. Until step 2, a course
   taking a version number used before gets the older content under it, and a
   lesson removed from a module loses its place and prerequisites. So remove no
   lessons until then.
2. Migrate, then index:

   ```
   ! pnpm db:migrate-lesson-versions
   ! pnpm db:index-lesson-versions
   ```

   This is also the second run of section 2, if that is still owed.
3. Check. Must return one row, without `UNIQUE` in it:

   ```sql
   select indexdef from pg_indexes
   where tablename = 'lesson_versions' and indexdef like '%lesson_id, version%';
   ```

Editor pages left open across the deploy need a refresh. Once
migrated, the code from before this release cannot add or update lessons in
courses on this database. Fix forward rather than roll back.

Sections 1 and 2 below are the first rollout, kept for reference.

`.env.local` points at production, so you run every command here yourself, from
the repo root, as typed. Run the SQL in the production SQL console. All of it
only reads.

The leading `! ` is for running inside Claude Code. Leave it out in a plain
terminal.

## 1. Before

Take a database backup (or branch).

**The index the migration replaces must be an index, not a constraint.** Must
return no rows:

```sql
select conname from pg_constraint where conname = 'lesson_knowledge_chunks_lesson_idx';
```

If it returns a row, stop. The migration would fail and leave everything as it
was.

**Old lesson text stored as course uploads.** The old course importer did this:

```sql
select course_id, count(*) from docs
where lesson_slug is null and source_path like 'lesson-%' group by 1;
```

No rows: nothing to do. Rows: in those courses Viper also quotes this old text,
to every learner, whatever version the course is on, and it never updates. It
does not block the rollout. Afterwards, decide whether to delete those rows.

**Lessons with more than one material row:**

```sql
select lesson_slug, count(*) from lesson_material
group by 1 having count(*) > 1;
```

No rows: nothing to do. Rows: courses will show the row with the lowest `id`.
Check it is the right one. If it is not, open the lesson in Disciplines, put the
right text in and press Save before you migrate: a Save leaves one row.

**Is there an hnsw index on `docs`?**

```sql
select indexname from pg_indexes
where tablename = 'docs' and indexdef ilike '%using hnsw%';
```

A row: the first migration rebuilds an index entry for every lesson search row,
which can take minutes. No rows: expect seconds.

**Time the migration on a copy.** During the real first run, lesson pages wait
until it ends. The 5 second limit is only on how long it waits to start. Make a
database branch (or restore the backup) and use your own terminal, not Claude
Code: the branch's connection string holds a password.

1. Type this, paste the string and press Enter. Nothing shows:

   ```
   read -rs BRANCH_URL
   ```

2. Check the host. The first command prints production, the second must print
   the new branch's own name from the console. **If the two are the same, or the
   second is not the branch, stop.** (Neon gives one database two names, with and
   without `-pooler`, so the commands leave that part out.)

   ```
   pnpm exec dotenv -e .env.local -- node -p 'const u = new URL(process.env.DATABASE_URL); u.hostname.replace("-pooler", "") + u.pathname'
   DATABASE_URL="${BRANCH_URL:?}" pnpm exec dotenv -e .env.local -- node -p 'const u = new URL(process.env.DATABASE_URL); u.hostname.replace("-pooler", "") + u.pathname'
   ```

3. Run it, and note the time:

   ```
   time DATABASE_URL="${BRANCH_URL:?}" pnpm db:migrate-lesson-versions
   ```

4. Close that terminal and delete the branch.

This never touches `.env.local`: a variable set on the command line wins over
the file. Never type `DATABASE_URL=` for the real run.

## 2. Roll out

Pick a quiet time. **From the first migration until the deploy is live, nobody
edits lessons or courses.** In that gap:

- an edit to a lesson stays out of every course until the lesson's version
  changes;
- a lesson added to a course is invisible to learners until the second
  migration;
- a lesson removed from a course leaves a pin behind (harmless: adding the
  lesson again in the app drops it);
- the old code cannot save new debrief key points, so a debrief that needs them
  fails. Stored ones work. This is why you deploy straight away.

1. Migrate:

   ```
   ! pnpm db:migrate-lesson-versions
   ```

   It prints `Lesson versions are in place and every course is pinned.` If it
   stops with `canceling statement due to lock timeout`, it waited 5 seconds for
   a busy table and changed nothing. Run it again.

2. Deploy straight away: merge `lesson-versions` into `main` and wait for Vercel
   to say Ready.

3. Migrate again. This pins anything added in the gap:

   ```
   ! pnpm db:migrate-lesson-versions
   ```

4. Index lessons Viper cannot find yet:

   ```
   ! pnpm db:index-lesson-versions
   ```

   It prints `Indexed N lesson versions.` Any N is fine, 0 included. If it says
   some failed, run it again.

If a lesson was added to a course in the gap, learners may wait up to 6 hours
for it: the course page is cached and a migration does not clear it. Pressing
the lesson's eye off and on in the editor shows it at once.

Never run `db:push` for this. It offers to truncate `docs`.

## 3. Check

Every lesson a course shows has a pin. Must return 0:

```sql
select count(*) as missing_pins
from course_modules cm
join module_lessons ml on ml.module_id = cm.module_id
left join course_lesson_versions p
  on p.course_id = cm.course_id and p.lesson_id = ml.lesson_id
where p.lesson_id is null;
```

Lesson versions Viper cannot search. Must be empty, except lessons with almost
no text (under about 20 characters):

```sql
select l.slug, v.version, length(v.text) as text_length
from lesson_versions v
join lessons l on l.id = v.lesson_id
left join docs d on d.lesson_version_id = v.id
where d.id is null and (coalesce(v.text, '') <> '' or coalesce(v.pro_tips, '') <> '');
```

Lessons edited in the gap (name, video, other languages or material). Each
lesson listed needs a new version in Disciplines, then its courses updated. Only
useful right after the first rollout: from then on, editing without changing the
version is allowed, and such lessons are listed too:

```sql
select l.slug from lessons l
join lesson_versions v on v.lesson_id = l.id and v.version = l.version
where (l.name, l.video_provider, l.video_ref, l.other_video_ids)
    is distinct from (v.name, v.video_provider, v.video_ref, v.other_video_ids)
  or exists (
    select 1 from lesson_material m
    where m.lesson_slug = l.slug and m.updated_at > v.created_at
  );
```

Then click through with one lesson that two courses each have in a module of
their own.

1. Knowledge library: every course card shows a green `v1.0`; Disciplines cards
   show a plain one.
2. Edit the lesson in Disciplines and press Save. It saves; the chips stay green.
3. Enter `1.1` and Save. The chips in both courses turn gold. Enter `1.0` again
   and Save: green. Back to `1.1`.
4. Open the lesson as a learner: still the old text.
5. In one course, remove the lesson and drag it in again from Disciplines. Its
   chip turns green and that course shows the new text, the other the old one.
   It is back in its place, with the prerequisites it had.
   Repeat with a lesson in the 3D Airmanship column: every course updates.
6. Try to delete the lesson in Disciplines: it names the courses using it.
7. Ask Viper about the lesson from each course.

## 4. Rolling back

The old code runs on the migrated database, but:

- it shows the working copy, so every edit made since appears in
  every course at once;
- it cannot regenerate debrief key points, because the index it relies on is
  gone. Do not put that index back: lessons may now have several rows;
- Viper may quote more than one version of a lesson.

Prefer fixing forward. If you did roll back, run the migration and the indexer
again after the next deploy.

## 5. Old code after the rollout

Old code is any branch, worktree or preview from before this one. `.env.local`
is production, so running it locally counts. It:

- wipes a lesson's search rows, for every version, when its material is saved;
- edits lessons without a version;
- places lessons without pins.

Rebase every open branch and worktree onto `main` before you run it. If old code
did run, run both `db:` commands, then the "edited in the gap" query above:

```
! pnpm db:migrate-lesson-versions
! pnpm db:index-lesson-versions
```

## 6. Scripts that go around versions

`scripts/import-course.ts` (with `import-course-modules.ts`) places lessons
without pins. After it, run:

```
! pnpm db:migrate-lesson-versions
! pnpm db:index-lesson-versions
```

- It also edits lessons without a version. Courses keep what they
  had and their chip stays green. Enter another version in Disciplines, then
  update each course.
- If it puts back a lesson a course used to have, the course may keep its old
  version. Remove it and drag it in again.

`! pnpm db:migrate-other-video-ids --write` also edits lessons without a
version. Change those versions and update their courses.

`! pnpm db:remix-flagship-everywhere` pins correctly but does not index. After
it, run `! pnpm db:index-lesson-versions`.

After any other script or hand-written SQL that puts lessons or modules in
courses, run both commands above.

## 7. Now and then

If Viper's indexing of a lesson fails, nothing retries it by itself. Only this
does. It is safe to run any time:

```
! pnpm db:index-lesson-versions
```
