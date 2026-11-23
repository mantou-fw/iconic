export class FeatureLoadError extends Error {
  constructor(cause: unknown) {
    super("This feature could not be loaded. Please retry.", { cause });
    this.name = "FeatureLoadError";
  }
}

/** Share successful/in-flight imports, but let a failed import be retried. */
export function createFeatureLoader<T>(loadModule: () => Promise<T>) {
  let value: T | undefined;
  let pending: Promise<T> | undefined;

  return {
    peek: () => value,
    load: () => {
      pending ??= Promise.resolve().then(loadModule).then(
        (module) => { value = module; return module; },
        (error) => { pending = undefined; throw new FeatureLoadError(error); },
      );
      return pending;
    },
  };
}
