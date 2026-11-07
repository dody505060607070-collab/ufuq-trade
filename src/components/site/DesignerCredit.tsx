import { useT } from "@/lib/i18n";

const STUDIO_URL = "https://abdelrahmanstudio.store/";

/** Small, low-contrast "made by" credit shown at the very bottom of public footers. */
export function DesignerCredit() {
  const t = useT();
  return (
    <p className="pb-4 text-center text-[10px] tracking-wide text-muted-foreground/40">
      {t("Designed & developed by")}{" "}
      <a
        href={STUDIO_URL}
        target="_blank"
        rel="noopener"
        className="transition-colors hover:text-muted-foreground"
      >
        Abdelrahman Studio
      </a>
    </p>
  );
}
