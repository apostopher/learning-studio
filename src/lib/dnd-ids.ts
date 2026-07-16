/**
 * Namespaced dnd-kit identifiers for the course board. Modules and lessons live
 * in ONE DndContext (so lessons can be dragged across modules), and their DB ids
 * can collide (module 5 vs lesson 5), so every draggable/droppable id is
 * prefixed by type.
 */

export type DndType = 'module' | 'lesson' | 'container';

export const moduleDndId = (id: number) => `module-${id}`;
export const lessonDndId = (id: number) => `lesson-${id}`;
/** Droppable wrapping a module's lesson area (so empty modules accept drops). */
export const containerDndId = (moduleId: number) => `container-${moduleId}`;

export function parseDndId(
  id: string | number,
): { type: DndType; id: number } | null {
  const [prefix, rest] = String(id).split('-');
  const num = Number(rest);
  if (!Number.isInteger(num)) return null;
  if (prefix === 'module') return { type: 'module', id: num };
  if (prefix === 'lesson') return { type: 'lesson', id: num };
  if (prefix === 'container') return { type: 'container', id: num };
  return null;
}
