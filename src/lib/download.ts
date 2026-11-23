/** Small browser helpers shared by JSON recovery and optional exporters. */
export function downloadBlob(blob: Blob, filename: string, signal?: AbortSignal) {
  if (signal?.aborted) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const stamp = () =>
  new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
