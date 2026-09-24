/*
 * Ambient declarations for plain (non-module) stylesheet imports.
 *
 * Next.js ships declarations for `*.module.css` and its Sass equivalents, but
 * none for a global stylesheet pulled in for its side effects — so
 * `import '@/app/globals.css'` has no type to resolve to. TypeScript stays
 * quiet about that by default, but the editor's TS server and
 * `tsc --noUncheckedSideEffectImports` both flag it:
 *
 *   Cannot find module or type declarations for side-effect import of
 *   '@/app/globals.css'
 *
 * These wildcards give those imports a declaration. `*.module.css` is a more
 * specific pattern, so CSS modules still resolve to Next's typed declaration
 * and keep their `readonly { [key: string]: string }` default export.
 */

declare module '*.css'
declare module '*.scss'
declare module '*.sass'
