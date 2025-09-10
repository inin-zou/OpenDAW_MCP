export class FileNotFoundError extends Error {
    constructor(path: string) {super(`${path} not found`)}
}