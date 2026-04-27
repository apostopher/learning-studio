/**
 * Progress milestones we require a user to hit before counting a video as
 * fully watched. Mirrored in src/db/videos-progress.ts for server use.
 * Lives in src/lib so client bundles don't pull in the drizzle/db module.
 */
export const milestones: number[] = [
  10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 100,
];
