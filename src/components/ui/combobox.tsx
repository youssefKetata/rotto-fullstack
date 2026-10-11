"use client";

// Adapted from shadcn/ui's combobox, using Rotto tokens, CSS Modules and icons.
// https://ui.shadcn.com/docs/components/radix/combobox
import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { clsx } from "clsx";
import { Icon } from "@/components/search/icon";
import styles from "./combobox.module.css";
import { DialogPortalContext } from "./dialog";

const Combobox = ComboboxPrimitive.Root;
const ComboboxValue = ComboboxPrimitive.Value;

function ComboboxTrigger({
  className,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={clsx(styles.trigger, className)}
      {...props}
    >
      <Icon name="chevron" size={16} />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxContent({
  className,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "anchor">) {
  const container = React.useContext(DialogPortalContext);
  return (
    <ComboboxPrimitive.Portal container={container}>
      <ComboboxPrimitive.Positioner
        anchor={anchor}
        sideOffset={6}
        align="start"
        collisionPadding={12}
        className={styles.positioner}
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={clsx(styles.popup, className)}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={clsx(styles.list, className)}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={clsx(styles.item, className)}
      {...props}
    >
      <span>{children}</span>
      <ComboboxPrimitive.ItemIndicator className={styles.indicator}>
        <Icon name="check" size={16} />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={clsx(styles.empty, className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips>) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={clsx(styles.chips, className)}
      {...props}
    />
  );
}

function ComboboxChip({ className, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={clsx(styles.chip, className)}
      {...props}
    />
  );
}

function ComboboxChipRemove({
  className,
  ...props
}: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      className={clsx(styles.remove, className)}
      {...props}
    >
      <Icon name="close" size={13} />
    </ComboboxPrimitive.ChipRemove>
  );
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={clsx(styles.input, className)}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxValue,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChipsInput,
  useComboboxAnchor,
};
