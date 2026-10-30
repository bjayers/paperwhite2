// The generic editor: any kind of data in res/, as a form built from its schema. It is the fallback for every kind,
// so new data is editable the moment it has a schema, with no code here.

import { useMemo } from "react";
import type { DataViewModule, DataViewProps } from "../types.ts";
import { Field, type FormContext } from "./form.tsx";

function SchemaFormView({ data, schema, constants, errors, edit }: DataViewProps) {
  const ctx: FormContext = useMemo(() => ({ root: schema, constants, errors, edit }), [schema, constants, errors, edit]);
  return (
    <div className="schema-form">
      {schema.description && <p className="schema-description">{schema.description}</p>}
      <Field schema={schema} value={data} path={[]} ctx={ctx} />
    </div>
  );
}

const module: DataViewModule = {
  kind: "data",
  id: "schema-form",
  title: "Form",
  handles: () => 1,
  View: SchemaFormView,
};

export default module;
