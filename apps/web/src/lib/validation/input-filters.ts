import type { ChangeEvent, ClipboardEvent, DragEvent, FormEvent } from "react";

type InputKind = "email" | "password";

// Restrictive email character set.
// Allows common ASCII email characters, but blocks:
// Unicode, emojis, Zalgo, whitespace, and HTML brackets.
const EMAIL_ALLOWED = /^[A-Za-z0-9@._%+-]*$/;

// Printable ASCII, including ordinary password symbols.
// Blocks Unicode, emojis, Zalgo, and control characters.
const PASSWORD_ALLOWED = /^[\x20-\x7E]*$/;

const patterns = {
  email: EMAIL_ALLOWED,
  password: PASSWORD_ALLOWED,
};

export function createInputFilter(
  kind: InputKind,
  currentValue: string,
  onAcceptedChange: (value: string) => void,
) {
  const isAllowed = (value: string) => patterns[kind].test(value);

  return {
    // Block unsupported characters before insertion.
    onBeforeInput: (event: FormEvent<HTMLInputElement>) => {
      const inputEvent = event.nativeEvent as InputEvent;
      const insertedText = inputEvent.data;

      if (insertedText && !isAllowed(insertedText)) {
        event.preventDefault();
      }
    },

    // Reject the entire paste if it contains invalid characters.
    onPaste: (event: ClipboardEvent<HTMLInputElement>) => {
      const pastedText = event.clipboardData.getData("text");

      if (!isAllowed(pastedText)) {
        event.preventDefault();
      }
    },

    // Block invalid drag-and-drop text.
    onDrop: (event: DragEvent<HTMLInputElement>) => {
      const droppedText = event.dataTransfer.getData("text/plain");

      if (!isAllowed(droppedText)) {
        event.preventDefault();
      }
    },

    // Final UI fallback for autofill, IME, and other input paths.
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value;

      if (!isAllowed(nextValue)) {
        event.currentTarget.value = currentValue;
        return;
      }

      onAcceptedChange(nextValue);
    },
  };
}
