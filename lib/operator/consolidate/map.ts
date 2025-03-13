export function getOrSet<K, T>(map: Map<K, T>, key: K, value: T): T {
  if (map.has(key)) return map.get(key) as T;

  map.set(key, value);
  return value;
}
