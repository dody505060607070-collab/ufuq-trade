import { Link } from "@tanstack/react-router";
import logoEn from "@/assets/logo-en.png";
import logoAr from "@/assets/logo-ar.png";
import { useI18n } from "@/lib/i18n";

/** Brand logo image that follows the site language. */
export function BrandMark({ className = "h-9 w-auto" }: { className?: string }) {
  const { lang } = useI18n();
  return <img src={lang === "ar" ? logoAr : logoEn} alt={lang === "ar" ? "أُفُق تريد" : "Ufuq Trade"} className={className} />;
}

export function Logo({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return <Link to={to} className="flex items-center"><BrandMark /></Link>;
}
