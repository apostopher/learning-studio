# Lesson versions: rollout

`.env.local` points at production, so you run every command here yourself, from
the repo root, as typed. Run the SQL in the production SQL console. All of it
only reads.

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

## 2. Roll out

Pick a quiet time. **From the first migration until the deploy is live, nobody
edits lessons or courses.** In that gap:

- an edit to a lesson stays out of every course until the lesson goes to 1.1;
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

Lesson material edited in the gap. Each lesson listed needs a higher version in
Disciplines, then its courses updated:

```sql
select distinct l.slug from lessons l
join lesson_versions v on v.lesson_id = l.id and v.version = l.version
join lesson_material m on m.lesson_slug = l.slug
where m.updated_at > v.created_at;
```

Then click through, with one lesson that two courses use:

1. Knowledge library: every course card shows a green `v1.0`; Disciplines cards
   show a plain one.
2. Edit the lesson in Disciplines. Under Version: `v1.0 is used by 2 courses.
   Enter a higher version to make changes.` Change the text and press Save: it
   is refused and your text stays.
3. Enter `1.1` and Save. The chips in both courses turn gold.
4. Open the lesson as a learner: still the old text.
5. Click one gold chip, then Update lesson. That course shows the new text, the
   other the old one.
6. Try to delete the lesson in Disciplines: it names the courses using it.
7. Ask Viper about the lesson from each course.

## 4. Rolling back

The old code runs on the migrated database, but:

- it shows the working copy, so every edit made since (1.1 and up) appears in
  every course at once;
- it cannot regenerate debrief key points, because the index it relies on is
  gone. Do not put that index back: lessons may now have several rows;
- Viper may quote more than one version of a lesson.

Prefer fixing forward. If you did roll back, run the migration and the indexer
again after the next deploy.

## 5. Scripts that go around versions

`scripts/import-course.ts` (with `import-course-modules.ts`) places lessons
without pins. After it, run:

```
! pnpm db:migrate-lesson-versions
! pnpm db:index-lesson-versions
```

- It also edits lessons without checking their version. Courses keep what they
  had and their chip stays green. Enter a higher version in Disciplines, then
  update each course.
- If it puts back a lesson a course used to have, the course may keep its old
  version. Click its gold chip.

`! pnpm db:migrate-other-video-ids --write` also edits lessons without checking
their version. Raise those versions and update their courses.

`! pnpm db:remix-flagship-everywhere` pins correctly but does not index. After
it, run `! pnpm db:index-lesson-versions`.

After any other script or hand-written SQL that puts lessons or modules in
courses, run both commands above.
