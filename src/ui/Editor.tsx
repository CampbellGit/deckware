/** CodeMirror-based editor for `.slide` source. */
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

const editorTheme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "13px", background: "#1b1d23" },
    ".cm-content": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      color: "#e6e8ec",
      caretColor: "#7aa2ff",
    },
    ".cm-gutters": { background: "#1b1d23", color: "#5a606b", border: "none" },
    ".cm-activeLine": { background: "rgba(255,255,255,0.03)" },
    ".cm-activeLineGutter": { background: "transparent" },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true },
);

export interface EditorHandle {
  /** Scroll the editor so the first line of slide-range [start] is in view. */
  revealLine: (line: number) => void;
}

export function Editor({
  value,
  onChange,
  onCursorLine,
  apiRef,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fired (0-based) when the caret moves to a different line. */
  onCursorLine?: (line: number) => void;
  /** Receives an imperative handle for scroll-to-line (preview → editor sync). */
  apiRef?: (api: EditorHandle | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lastLine = useRef<number>(-1);
  const onCursorLineRef = useRef(onCursorLine);
  onCursorLineRef.current = onCursorLine;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
          // Report caret line changes (0-based) for editor → preview sync.
          if (u.docChanged || u.selectionSet) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head).number - 1;
            if (line !== lastLine.current) {
              lastLine.current = line;
              onCursorLineRef.current?.(line);
            }
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    apiRef?.({
      revealLine(line: number) {
        const doc = v.state.doc;
        const n = Math.min(Math.max(line + 1, 1), doc.lines);
        const pos = doc.line(n).from;
        v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start" }) });
      },
    });
    return () => {
      apiRef?.(null);
      v.destroy();
    };
    // Mount once; external value changes are reconciled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile external value changes (e.g. inspector edits write back to the
  // source). Only dispatch when the incoming value differs from the editor's
  // own content, so typing is never interrupted.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const currentDoc = v.state.doc.toString();
    if (value !== currentDoc) {
      v.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={host} style={{ height: "100%", overflow: "auto" }} />;
}
