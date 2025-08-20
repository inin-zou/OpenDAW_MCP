export class Warning extends Error {}

export const warn = (issue: string): never => {throw new Warning(issue)}