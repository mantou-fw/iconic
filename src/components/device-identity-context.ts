import { createContext, useContext } from "react";

export const DeviceIdentityContext = createContext<{
  tags: ReadonlyMap<string, string>;
  rename: (id: string, tag: string) => string | undefined;
}>({ tags: new Map(), rename: () => undefined });

export const useDeviceIdentity = () => useContext(DeviceIdentityContext);
