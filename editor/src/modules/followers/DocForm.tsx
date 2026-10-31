// A form over a file that a tool holds (documents.hold): the schema form for the whole file or one part of it, with
// the editor's live check, editing through the document store, so undo, saving with the build's check and changes on
// disk work as for an open file.

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api.ts";
import { documents, useDocuments } from "../../documents.ts";
import { getIn, type JsonPath, type JsonValue } from "../../../shared/json.ts";
import { resolve, validate, type Constants, type Schema } from "../../../shared/schema.ts";
import { Field, type FormContext } from "../schema-form/form.tsx";

/** A file's data and schema, held for the tool, read once. */
export function useHeld(path: string | null): { data: JsonValue | null; schema: Schema | null; error: string | null; dirty: boolean } {
  const { docs } = useDocuments();
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doc = path ? docs.get(path) : undefined;
  useEffect(() => {
    if (path && !documents.get(path)) documents.hold(path).catch((e: Error) => setError(e.message));
  }, [path]);
  useEffect(() => {
    setSchema(null);
    if (doc?.schema) api.schema(doc.schema).then(setSchema, (e: Error) => setError(e.message));
  }, [doc?.schema]);
  return { data: doc?.data ?? null, schema, error: error ?? (doc && doc.data === null ? "This file is in a layout the editor can't write back; edit it as text." : null), dirty: doc?.dirty ?? false };
}

/** The part of a schema at a path of property names, as the form would reach it. */
export function schemaAt(schema: Schema, at: JsonPath): Schema {
  let s = resolve(schema, schema);
  for (const key of at) {
    const next = typeof key === "number" ? s.items : s.properties?.[key];
    if (!next) return {};
    s = resolve(next, schema);
  }
  return s;
}

export function DocForm({ path, at = [], constants, hideDescription }: {
  path: string;
  /** The part of the file to show; the whole file by default. */
  at?: JsonPath;
  constants: Constants;
  hideDescription?: boolean;
}) {
  const { data, schema, error } = useHeld(path);
  const errors = useMemo(() => (data !== null && schema ? validate(data, schema, constants) : []), [data, schema, constants]);
  const ctx: FormContext | null = useMemo(() => schema ? {
    root: schema, constants, errors,
    edit: (p: JsonPath, v: JsonValue | undefined) => documents.edit(path, p, v),
  } : null, [schema, constants, errors, path]);
  if (error) return <p className="flw-error">{path}: {error}</p>;
  if (data === null || !schema || !ctx) return <p className="muted">Reading {path}…</p>;
  const part = schemaAt(schema, at);
  const value = getIn(data, at);
  if (value === undefined) return <p className="muted">{path} has no {at.join(".")}.</p>;
  return (
    <div className="schema-form flw-form">
      {!hideDescription && part.description && <p className="schema-description">{part.description}</p>}
      <Field schema={part} value={value} path={at} ctx={ctx} />
    </div>
  );
}
