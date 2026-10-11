import styles from "./brand.module.css";
export function Brand() {
  return (
    <span className={styles["brand"]} aria-label="Rotto">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="3" />
        <path
          d="M16 9v14M9 16h14"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      rotto<span className={styles["brand-dot"]}>.</span>
    </span>
  );
}
