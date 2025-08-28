export class Abort extends Error {}

export class Warning extends Error {}

// This should be treated silently
export const abort = (issue?: string): never => {throw new Abort(issue)}

// This should trigger a warning dialog
export const warn = (issue: string): never => {throw new Warning(issue)}