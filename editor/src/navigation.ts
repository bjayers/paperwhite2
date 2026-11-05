// Links between the editors: the address's #tool/<id>?<params> opens a tool on a page of it (a file, a script, a
// message), so one editor can send the user to another, and a page can be linked to and reloaded.

import { useEffect, useState } from "react";

const HASH = /^#tool\/([\w-]+)(?:\?(.*))?$/;

/** The tool the address names, and its parameters. */
export function readHash(): { tool: string; params: URLSearchParams } | null {
  const m = HASH.exec(location.hash);
  return m ? { tool: m[1], params: new URLSearchParams(m[2] ?? "") } : null;
}

/** Opens a tool, on a page of it when params say which. */
export function navigate(tool: string, params: Record<string, string | number> = {}) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  location.hash = `#tool/${tool}${query ? `?${query}` : ""}`;
}

/** The address's parameters for a tool, as they change. */
export function useToolParams(tool: string): URLSearchParams {
  const read = () => {
    const h = readHash();
    return h && h.tool === tool ? h.params : new URLSearchParams();
  };
  const [params, setParams] = useState(read);
  useEffect(() => {
    // (a link to another tool leaves this one's page as it was: it stays open behind its tab)
    const changed = () => {
      const h = readHash();
      if (h && h.tool === tool) setParams(h.params);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  return params;
}
