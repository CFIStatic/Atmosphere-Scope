"use client";

import { createContext, useContext } from "react";

export const LibraryQueryContext = createContext("");

export function useLibraryQuery(): string {
  return useContext(LibraryQueryContext);
}
