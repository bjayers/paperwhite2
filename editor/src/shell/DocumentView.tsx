// One open file: its views (the best module for its kind first, the generic form, and the text), the save and undo
// buttons, and the notices for problems and for changes on disk.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataType } from "../../shared/api.ts";
import type { JsonPath, JsonValue } from "../../shared/json.ts";
import { validate, type Constants, type Schema } from "../../shared/schema.ts";
import { api } from "../api.ts";
import { currentText, documents, type Document } from "../documents.ts";
import { viewsFor } from "../modules/registry.ts";

export function DocumentView({ doc, type, constants, onOpen }: {
  doc: Document;
  type: DataType | undefined;
  constants: Constants;
  onOpen(path: string): void;
}) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const views = useMemo(() => (type && doc.data !== null ? viewsFor(type) : []), [type, doc.data !== null]);
  const [viewId, setViewId] = useState<string>("");
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const showText = !view || viewId === "text";

  useEffect(() => {
    setSchema(null);
    setSchemaError(null);
    if (doc.schema) api.schema(doc.schema).then(setSchema, (e: Error) => setSchemaError(e.message));
  }, [doc.schema]);

  const errors = useMemo(
    () => (schema && doc.data !== null ? validate(doc.data, schema, constants) : []),
    [schema, doc.data, constants],
  );
  const edit = useCallback((path: JsonPath, value: JsonValue | undefined) => documents.edit(doc.path, path, value), [doc.path]);
  const replace = useCallback((data: JsonValue) => documents.replace(doc.path, data), [doc.path]);

  const jump = (path: JsonPath) => {
    setViewId(view?.id ?? "");
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-path="${CSS.escape(path.join("."))}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.classList.add("flash");
      setTimeout(() => el?.classList.remove("flash"), 1200);
    });
  };

  return (
    <div className="document">
      <div className="doc-toolbar">
        <div className="view-switch" role="tablist">
          {views.map((v) => (
            <button key={v.id} className={!showText && view?.id === v.id ? "active" : ""} onClick={() => setViewId(v.id)}>{v.title}</button>
          ))}
          <button className={showText ? "active" : ""} onClick={() => setViewId("text")}
                  title="The file as text. Valid JSON typed here updates the form.">Text</button>
        </div>
        <span className="path" title={doc.path}>{doc.path}</span>
        <span className="spacer" />
        <button onClick={() => documents.undo(doc.path)} disabled={!doc.past.length} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={() => documents.redo(doc.path)} disabled={!doc.future.length} title="Redo (Ctrl+Y)">Redo</button>
        <button className="primary" onClick={() => documents.save(doc.path)} disabled={!doc.dirty || doc.saving}
                title="Save (Ctrl+S). The build's own check runs first; nothing is written if it fails.">
          {doc.saving ? "Saving…" : "Save"}
        </button>
      </div>

      {doc.changedOnDisk && (
        <div className="notice warning">
          This file changed on disk while you had unsaved changes.
          <button onClick={() => documents.reload(doc.path)}>Reload (discard mine)</button>
          <button onClick={() => documents.save(doc.path, true)}>Keep mine and save</button>
        </div>
      )}
      {doc.saveError && !doc.changedOnDisk && <div className="notice error">Not saved: {doc.saveError}</div>}
      {doc.data === null && doc.path.endsWith(".json") && (
        <div className="notice">
          {doc.schema === null ? "This file names no schema," : "This file is laid out by hand,"} so it is edited as text.
        </div>
      )}
      {schemaError && <div className="notice error">Its schema {doc.schema} couldn't be read: {schemaError}</div>}
      {errors.length > 0 && (
        <details className="notice error problems">
          <summary>{errors.length} problem{errors.length > 1 ? "s" : ""} the build would refuse</summary>
          <ul>
            {errors.slice(0, 50).map((e, i) => (
              <li key={i}><button className="link" onClick={() => jump(e.path)}>{e.path.join(".") || "(the file)"}</button>: {e.message}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="doc-body">
        {showText || !schema || doc.data === null || !type ? (
          showText || doc.data === null ? (
            <textarea className="raw" spellCheck={false} value={currentText(doc)}
                      onChange={(e) => documents.editText(doc.path, e.target.value)} />
          ) : (
            <p className="muted pad">Loading the schema…</p>
          )
        ) : (
          <view.View doc={doc} data={doc.data} type={type} schema={schema} constants={constants} errors={errors}
                     edit={edit} replace={replace} open={onOpen} />
        )}
      </div>
    </div>
  );
}
