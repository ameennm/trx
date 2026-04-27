const safeJson = (obj: any) => {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) return '[Circular]';
      cache.add(value);
    }
    return value;
  });
};

export function logEvent(event: string, payload: Record<string, unknown>) {
  console.log(safeJson({ ts: new Date().toISOString(), event, ...payload }));
}
