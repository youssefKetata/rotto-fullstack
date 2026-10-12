import { useId } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import styles from "./filter-editor.module.css";

export function FilterSelect({
  label,
  value,
  anyLabel,
  options,
  onChange,
  className,
}: {
  label: string;
  value?: string;
  anyLabel?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`${styles.selectField} ${className ?? ""}`}>
      <label className={styles.selectLabel} htmlFor={id}>
        {label}
      </label>
      <Select
        value={value || (anyLabel ? "__any__" : undefined)}
        onValueChange={(selected) =>
          onChange(selected === "__any__" ? "" : selected)
        }
      >
        <SelectTrigger id={id} className={styles.select}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {anyLabel && <SelectItem value="__any__">{anyLabel}</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
