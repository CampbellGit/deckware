/**
 * Open a `.slide` file from disk and live-reload it when it changes.
 *
 * Uses the File System Access API (`showOpenFilePicker`) where available
 * (Chromium browsers): that returns a persistent file handle we can re-read.
 * Browsers give no file-change event, so we poll the file's `lastModified` and
 * reload when it advances — meaning you can edit the file in VS Code (or any
 * editor) and watch the deck update here.
 *
 * When the API is unavailable, `openViaHandle` is null and the caller should
 * fall back to a plain `<input type="file">` (one-shot load, no watching).
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Feature-detect the File System Access API. */
export function hasFileSystemAccess(): boolean {
  return typeof (window as unknown as { showOpenFilePicker?: unknown })
    .showOpenFilePicker === "function";
}

export interface FileWatchState {
  /** Name of the open file, or null when none is open. */
  fileName: string | null;
  /** Whether disk polling is active. */
  watching: boolean;
}

const POLL_MS = 800;

export function useFileWatch(onLoad: (text: string, name: string) => void) {
  const [state, setState] = useState<FileWatchState>({
    fileName: null,
    watching: false,
  });
  const handleRef = useRef<FileSystemFileHandle | null>(null);
  const lastModified = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep the latest onLoad without re-subscribing the poll loop.
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  const stopWatch = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setState((s) => ({ ...s, watching: false }));
  }, []);

  /** Open the system file picker, load the file, and start watching it. */
  const openViaHandle = useCallback(async () => {
    if (!hasFileSystemAccess()) return;
    const picker = (
      window as unknown as {
        showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker;
    let handle: FileSystemFileHandle;
    try {
      [handle] = await picker({
        types: [
          {
            description: "Slide decks",
            accept: {
              "text/plain": [".slide", ".md", ".markdown", ".txt"],
            },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: false,
      });
    } catch {
      return; // user cancelled the picker
    }
    handleRef.current = handle;
    const file = await handle.getFile();
    lastModified.current = file.lastModified;
    onLoadRef.current(await file.text(), file.name);
    setState({ fileName: file.name, watching: true });
  }, []);

  // Poll the open handle for on-disk changes while watching.
  useEffect(() => {
    if (!state.watching || !handleRef.current) return;
    const tick = async () => {
      const handle = handleRef.current;
      if (!handle) return;
      try {
        const file = await handle.getFile();
        if (file.lastModified !== lastModified.current) {
          lastModified.current = file.lastModified;
          onLoadRef.current(await file.text(), file.name);
        }
      } catch {
        // File went away or permission lost — stop watching quietly.
        stopWatch();
      }
    };
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [state.watching, stopWatch]);

  return { ...state, openViaHandle, stopWatch, supported: hasFileSystemAccess() };
}
