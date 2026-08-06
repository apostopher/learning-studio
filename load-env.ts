import { config } from 'dotenv';

/**
 * Loads `.env.local` — this project's single env file.
 *
 * A module of its own rather than a `config()` call inside `vite.config.ts`,
 * because ESM runs every imported module's body before any statement in the
 * importing file. `vite.config.ts` imports the theme plugin, which reaches
 * `env.ts` and validates the environment at import time; a bare `config()`
 * call would therefore run *after* that validation had already failed. As a
 * side-effect import placed first, this runs before it.
 *
 * `override` is left off so platform-provided vars (Vercel) win over the file.
 */
config({ path: '.env.local' });
