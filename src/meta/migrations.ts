export type Migration = (unknownSave: unknown) => unknown;

// Schema v1 is the first persisted format. Future migrations are registered here
// and must be covered by a fixture test before schemaVersion changes.
export const migrations: Readonly<Record<number, Migration>> = {};
