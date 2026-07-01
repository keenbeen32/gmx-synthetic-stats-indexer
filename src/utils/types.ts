// Envio entity types are deeply readonly. This strips readonly so handlers can
// build/mutate a local copy (via spread) before calling context.Entity.set().
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
