"use client";

// Adapted from https://ui.shadcn.com/docs/components/radix/sonner.
import { Toaster as Sonner, type ToasterProps } from "sonner";
import styles from "./sonner.module.css";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      duration={6000}
      offset={24}
      mobileOffset={16}
      className={styles.toaster}
      toastOptions={{
        classNames: {
          toast: styles.toast,
          title: styles.title,
          actionButton: styles.action,
          error: styles.error,
        },
      }}
      {...props}
    />
  );
}
