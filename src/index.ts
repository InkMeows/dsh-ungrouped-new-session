/**
 * @dsh-external/dsh-ungrouped-new-session — host entry.
 *
 * This plugin is browser-only: the client half wires the existing sidebar UI
 * to the session runtime's workspace-less create path.  The host entry exists
 * so the package is a normal DSH bundle and can be built and injected through
 * the standard pipeline.
 */

import type { Context } from 'cordis'
import z from 'schemastery'

export const name = '@dsh-external/dsh-ungrouped-new-session'
export const inject = []

export interface Config {}

export const Config = z.object({})

export function apply(_ctx: Context, _config: Config): void {}