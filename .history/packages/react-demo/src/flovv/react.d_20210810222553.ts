import { FC } from "react";
import { Store } from "./index";

export function useStore(): Store;

export const Provider: FC<{ store: Store; children?: any }>;
