import { useEffect } from 'react';
import { installPointerOriginTracking } from '#/lib/pointer-origin';

/**
 * Publishes the last click position to `<html>` so dialogs can grow out of it.
 *
 * Renders nothing. Mounted once at the root, because a dialog can be opened
 * from anywhere and the value has to be current before the popup paints.
 *
 * Deliberately a two-line shell: all the behaviour lives in
 * `installPointerOriginTracking`, where a test can reach it. Components in
 * this repo cannot be rendered under vitest (react-compiler nulls the hook
 * dispatcher), so anything left inside this effect would be untestable by
 * construction.
 */
export const PointerOriginTracker = () => {
  useEffect(() => installPointerOriginTracking(document), []);
  return null;
};
