import { atom } from "jotai";
import { atomFamily } from "jotai-family";
import { milestones } from "#/lib/course-milestones";
import { courseDetailsAtomFamily } from "#/hooks/data/use-course-details";
import { courseProgressAtomFamily } from "#/hooks/data/use-course-progress";

const TOTAL_MILESTONES = milestones.length;

// Per-slug: map of videoId -> integer percent (0–100).
export const lessonPercentsAtomFamily = atomFamily((slug: string) =>
  atom((get) => {
    const q = get(courseProgressAtomFamily(slug));
    const byVideo = q.data?.progressByVideo;
    if (!byVideo) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const videoId in byVideo) {
      const hits = byVideo[videoId];
      let matched = 0;
      for (let i = 0; i < TOTAL_MILESTONES; i++) {
        if (hits.includes(milestones[i])) matched++;
      }
      out[videoId] = Math.min(
        100,
        Math.floor((matched / TOTAL_MILESTONES) * 100),
      );
    }
    return out;
  }),
);

// Per-slug: map of moduleId -> integer percent (average of its lesson videos).
export const modulePercentsAtomFamily = atomFamily((slug: string) =>
  atom((get) => {
    const details = get(courseDetailsAtomFamily(slug));
    const lessonPcts = get(lessonPercentsAtomFamily(slug));
    const modules = details.data?.modules;
    if (!modules) return {} as Record<number, number>;
    const out: Record<number, number> = {};
    for (const mod of modules) {
      if (mod.lessons.length === 0) {
        out[mod.id] = 0;
        continue;
      }
      let sum = 0;
      for (const lesson of mod.lessons) {
        sum += (lesson.videoId && lessonPcts[lesson.videoId]) || 0;
      }
      out[mod.id] = Math.round(sum / mod.lessons.length);
    }
    return out;
  }),
);
