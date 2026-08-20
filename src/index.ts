/**
 * @dsh-external/dsh-ungrouped-new-session — host entry.
 *
 * This plugin is browser-only: the client half wires the existing sidebar UI
 * to the session runtime's workspace-less create path.  The host entry exists
 * so the package is a normal DSH bundle and can be built and injected through
 * the standard pipeline.
 */

import z from 'schemastery'

/**
 * This plugin is browser-only and the host entry is a no-op, so we deliberately
 * avoid importing `Context` from `cordis`: the standalone build compiles against
 * the public npm package, while DSH ships its own compatible fork at runtime.
 */
type ContextLike = unknown

export const name = '@dsh-external/dsh-ungrouped-new-session'
export const inject = []

export interface Config {}

export const Config = z.object({})

export function apply(_ctx: ContextLike, _config: Config): void {}