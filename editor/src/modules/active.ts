// Whether the tool around a component is the one shown. The shell keeps every opened tool mounted, behind its tab, so
// its state survives a trip to another editor; a tool's window-wide keys listen only while it is shown. Outside a
// tool (a data view) it is always true.

import { createContext, useContext } from "react";

export const ToolActive = createContext(true);

export const useToolActive = () => useContext(ToolActive);
