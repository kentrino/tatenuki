export function hasCycle<Key extends PropertyKey>(
  graph: Record<Key, readonly Key[]>,
  start: Key,
): Promise<boolean> {
  const visiting = new Set<Key>();
  const visited = new Set<Key>();

  const visit = (key: Key): boolean => {
    visiting.add(key);

    for (const next of graph[key] ?? []) {
      if (!visiting.has(next) && !visited.has(next)) {
        if (visit(next)) {
          return true;
        }
      } else if (visiting.has(next)) {
        return true;
      }
    }

    visiting.delete(key);
    visited.add(key);
    return false;
  };

  return Promise.resolve(visit(start));
}
