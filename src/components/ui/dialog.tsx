"use client";

// Adapted from shadcn/ui's Radix dialog; visual styles stay in CSS modules.
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import styles from "./overlays.module.css";

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogContent({
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onBackdropClick,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  onBackdropClick: () => void;
}) {
  const previousFocus = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className={styles.overlay}
        onClick={(event) => {
          // A nested select can stop pointer propagation. Keep direct backdrop
          // clicks reliable even after its dismissable layer has unmounted.
          if (event.target === event.currentTarget) onBackdropClick();
        }}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        {...props}
        onOpenAutoFocus={(event) => {
          previousFocus.current = document.activeElement as HTMLElement;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          // These dialogs open from several controls and from profile URLs.
          event.preventDefault();
          const target = previousFocus.current?.isConnected
            ? previousFocus.current
            : document.querySelector<HTMLElement>("h2[tabindex]");
          target?.focus({ preventScroll: true });
        }}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription };
