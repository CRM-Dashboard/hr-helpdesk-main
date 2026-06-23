import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type ReactQuill from "react-quill";

type MentionPosition = { top: number; left: number };

export type EmailMentionPickerState = {
  open: boolean;
  query: string;
  items: string[];
  activeIndex: number;
  position: MentionPosition;
};

type UseEmailMentionPickerArgs = {
  quillRef: RefObject<ReactQuill>;
  containerRef: RefObject<HTMLElement>;
  emails: string[];
};

const LOOKBACK_CHARS = 80;

function getWordStartOffset(text: string) {
  // Finds the start of the "current token" (after last whitespace/newline/embed).
  let last = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    // Check for:
    // - Regular whitespace: space, newline, tab
    // - Object replacement character (embed): \uFFFC (65532)
    // - Any control characters or special Unicode characters that might represent embeds
    if (
      ch === " " ||
      ch === "\n" ||
      ch === "\t" ||
      ch === "\uFFFC" ||
      code === 65532 ||
      // Also treat quote marks as boundaries since Quill sometimes represents embeds as quotes
      ch === '"' ||
      ch === "'" ||
      // Zero-width characters
      code === 8203 || // zero-width space
      code === 8204 || // zero-width non-joiner
      code === 8205 // zero-width joiner
    ) {
      last = i;
      break;
    }
  }
  return last + 1;
}

function uniqEmails(emails: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails || []) {
    if (!e) continue;
    const lower = e.trim().toLowerCase();
    if (!lower) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(e.trim());
  }
  return out;
}

export function useEmailMentionPicker({
  quillRef,
  containerRef,
  emails,
}: UseEmailMentionPickerArgs) {
  const MENTION_EMBED_NAME = "emailNameMention";

  const [state, setState] = useState<EmailMentionPickerState>({
    open: false,
    query: "",
    items: [],
    activeIndex: 0,
    position: { top: 0, left: 0 },
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Keeps the current "@query" range so selection can replace it
  const mentionRangeRef = useRef<{ start: number; length: number } | null>(
    null
  );

  const normalizedEmails = useMemo(() => uniqEmails(emails), [emails]);

  const close = useCallback(() => {
    mentionRangeRef.current = null;
    setState((s) => ({
      ...s,
      open: false,
      query: "",
      items: [],
      activeIndex: 0,
    }));
  }, []);

  const setActiveIndex = useCallback((idx: number) => {
    setState((s) => ({
      ...s,
      activeIndex: Math.max(0, Math.min(idx, Math.max(0, s.items.length - 1))),
    }));
  }, []);

  const selectEmail = useCallback(
    (email: string) => {
      const quill = quillRef.current?.getEditor();
      if (!quill) return;

      const range = mentionRangeRef.current;
      if (!range) return;

      const start = range.start;
      const len = range.length;

      // Delete the @query text
      quill.deleteText(start, len, "user");

      // Insert the mention embed
      quill.insertEmbed(start, MENTION_EMBED_NAME, email, "user");

      // Insert a space after the mention
      quill.insertText(start + 1, " ", "user");

      // Move cursor after the space
      quill.setSelection(start + 2, 0, "user");

      // Close the picker
      close();

      // Force focus back to editor
      setTimeout(() => {
        quill.focus();
      }, 10);
    },
    [close, quillRef]
  );

  const recompute = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const sel = quill.getSelection();
    if (!sel || sel.length > 0) {
      // Only work with cursor (no text selection)
      close();
      return;
    }

    const cursor = sel.index;

    // Get text before cursor
    const lookbackStart = Math.max(0, cursor - LOOKBACK_CHARS);
    const beforeText = quill.getText(lookbackStart, cursor - lookbackStart);

    // console.log("DEBUG recompute:", {
    //   cursor,
    //   lookbackStart,
    //   beforeText: JSON.stringify(beforeText),
    //   beforeTextChars: beforeText
    //     .split("")
    //     .map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`)
    //     .join(" "),
    // });

    // Find the start of current word
    const tokenOffset = getWordStartOffset(beforeText);
    const wordStart = lookbackStart + tokenOffset;
    const currentWord = quill.getText(wordStart, cursor - wordStart);

    // console.log("DEBUG word analysis:", {
    //   tokenOffset,
    //   wordStart,
    //   word: JSON.stringify(currentWord),
    //   wordChars: currentWord
    //     .split("")
    //     .map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`)
    //     .join(" "),
    //   startsWithAt: currentWord.startsWith("@"),
    // });

    // Clean the word - remove any leading special characters (quotes, embeds, etc.)
    let word = currentWord;
    let skipChars = 0;

    // Skip leading special characters
    while (word.length > 0 && !word[0].match(/[a-zA-Z0-9@]/)) {
      word = word.slice(1);
      skipChars++;
    }

    // console.log("DEBUG cleaned word:", {
    //   originalWord: JSON.stringify(currentWord),
    //   cleanedWord: JSON.stringify(word),
    //   skipChars,
    //   startsWithAt: word.startsWith("@"),
    // });

    // Check if word starts with '@'
    if (!word.startsWith("@")) {
      //   console.log("DEBUG: Word doesn't start with @, closing");
      close();
      return;
    }

    // Get the query part (after @)
    const query = word.slice(1);

    // Check for whitespace in query
    if (/\s/.test(query)) {
      //   console.log("DEBUG: Query contains whitespace, closing");
      close();
      return;
    }

    // console.log("DEBUG: Valid mention trigger, query:", JSON.stringify(query));

    // Filter emails
    const q = query.toLowerCase();
    const items =
      q.length === 0
        ? normalizedEmails
        : normalizedEmails.filter((e) => e.toLowerCase().includes(q));

    // console.log("DEBUG: Filtered items:", items.length);

    // Store the range to replace later (adjust for skipped characters)
    mentionRangeRef.current = {
      start: wordStart + skipChars,
      length: word.length,
    };

    // Calculate dropdown position
    const bounds = quill.getBounds(cursor);
    const wrapper = containerRef.current;
    const qlContainer = wrapper?.querySelector(
      ".ql-container"
    ) as HTMLElement | null;
    const offsetTop = qlContainer?.offsetTop ?? 0;
    const offsetLeft = qlContainer?.offsetLeft ?? 0;

    setState({
      open: true,
      query,
      items,
      activeIndex: 0,
      position: {
        top: offsetTop + bounds.top + bounds.height + 6,
        left: offsetLeft + bounds.left,
      },
    });
  }, [close, containerRef, normalizedEmails, quillRef]);

  // Listen to Quill changes to detect @mention mode.
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const onTextChange = () => {
      //   console.log("DEBUG: text-change event");
      // Small delay to let Quill finish processing
      requestAnimationFrame(() => {
        recompute();
      });
    };

    const onSelectionChange = (range: any) => {
      //   console.log("DEBUG: selection-change event", range);
      if (range) {
        requestAnimationFrame(() => {
          recompute();
        });
      } else {
        // Editor lost focus
        close();
      }
    };

    quill.on("text-change", onTextChange);
    quill.on("selection-change", onSelectionChange);

    return () => {
      quill.off("text-change", onTextChange);
      quill.off("selection-change", onSelectionChange);
    };
  }, [quillRef, recompute, close]);

  // Keyboard navigation while dropdown is open.
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s.open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setState((prev) => {
          const n = prev.items.length || 1;
          return { ...prev, activeIndex: (prev.activeIndex + 1) % n };
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setState((prev) => {
          const n = prev.items.length || 1;
          return { ...prev, activeIndex: (prev.activeIndex - 1 + n) % n };
        });
        return;
      }

      if (e.key === "Enter") {
        if (s.items.length === 0) return;
        e.preventDefault();
        selectEmail(s.items[s.activeIndex] ?? s.items[0]);
      }
    };

    quill.root.addEventListener("keydown", onKeyDown, true);
    return () => quill.root.removeEventListener("keydown", onKeyDown, true);
  }, [close, quillRef, selectEmail]);

  // Close dropdown when clicking outside the editor area.
  useEffect(() => {
    if (!state.open) return;

    const onMouseDown = (e: MouseEvent) => {
      const wrapper = containerRef.current;
      if (!wrapper) return;

      const target = e.target as Node | null;
      if (target && wrapper.contains(target)) return;

      close();
    };

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [close, containerRef, state.open]);

  return {
    mention: state,
    close,
    selectEmail,
    setActiveIndex,
  };
}
