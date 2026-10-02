// Shared content loader: KDL text -> plain objects -> zod. Imports nothing from the shell.
import { parse } from 'kdljs';
import { z } from 'zod';

/**
 * Top-level nodes must be `<kind> "<id>" key=value ... { children }`, where kind is a key of `schemas`. Returns kind -> id -> validated
 * value, in file order; ids are unique across all kinds. Each node reaches its schema as `{ ...props, id, children: [{ name, args, props }] }`,
 * so a prop named `id` or `children` is clobbered.
 */
export function loadKdl<M extends Record<string, z.ZodType>>(src: string, schemas: M): { [K in keyof M]: Record<string, z.output<M[K]>> } {
  const kinds = Object.keys(schemas);
  const { output, errors } = parse(src);
  if (errors.length) {
    const e = errors[0] as { message?: string; token?: { startLine?: number | null; startColumn?: number | null }; previousToken?: { startLine?: number | null; startColumn?: number | null } };
    const t = Number.isFinite(e.token?.startLine) ? e.token : e.previousToken; // EOF errors carry no position of their own
    throw new Error(`${kinds.join('/')}: KDL syntax error at ${t?.startLine ?? '?'}:${t?.startColumn ?? '?'}: ${e.message ?? 'parse failed'}`);
  }
  const out: Record<string, Record<string, unknown>> = Object.fromEntries(kinds.map((k) => [k, {}]));
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const n of output ?? []) {
    const schema = Object.hasOwn(schemas, n.name) ? schemas[n.name] : undefined; // own keys only: `constructor` is not a kind
    const id = n.values[0];
    if (!schema) { problems.push(`expected node ${kinds.map((k) => `"${k}"`).join(' or ')}, found "${n.name}"`); continue; }
    if (typeof id !== 'string') { problems.push(`${n.name}: missing string id`); continue; }
    if (seen.has(id)) { problems.push(`${n.name} "${id}": duplicate id`); continue; }
    seen.add(id);
    const r = schema.safeParse({ ...n.properties, id, children: n.children.map((c) => ({ name: c.name, args: c.values, props: c.properties })) });
    if (r.success) out[n.name]![id] = r.data;
    else for (const i of r.error.issues) problems.push(`${n.name} "${id}": ${i.path.join('.')}: ${i.message}`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return out as { [K in keyof M]: Record<string, z.output<M[K]>> };
}

/**
 * Schema over a node's children: each child names a combinator in `registry` and its positional number args feed it, giving T[].
 * The one pattern all content uses to attach behaviour by name; `what` words the errors ("ability", "effect", ...).
 */
export function combinators<T>(registry: Record<string, (...args: number[]) => T>, what: string) {
  return z.array(z.strictObject({ name: z.string(), args: z.array(z.unknown()), props: z.strictObject({}) })).transform((cs, ctx): T[] => {
    const bad = (i: number, message: string) => ctx.issues.push({ code: 'custom', message, input: cs, path: [i] });
    return cs.flatMap((c, i) => {
      const make = Object.hasOwn(registry, c.name) ? registry[c.name] : undefined; // own keys only: `toString` is not a combinator
      if (!make) return bad(i, `unknown ${what} "${c.name}" (known: ${Object.keys(registry).join(', ')})`), [];
      if (c.args.length !== make.length || !c.args.every((a) => typeof a === 'number')) return bad(i, `${what} "${c.name}": expected ${make.length} number argument(s)`), [];
      return [make(...(c.args as number[]))];
    });
  });
}

/** String schema that replaces `{a.b.0}` with the number/string found by walking `table` along that path, so descriptions quote tuning without copying it. */
export function tunedText(table: object) {
  return z.string().transform((text, ctx) => text.replace(/\{([\w.]+)\}/g, (whole, path: string) => {
    const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], table);
    if (typeof v === 'number' || typeof v === 'string') return String(v);
    ctx.issues.push({ code: 'custom', message: `unknown tuning "${whole}"`, input: text });
    return whole;
  }));
}
