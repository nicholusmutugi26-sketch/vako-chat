import { BadgeCheck } from "lucide-react";

export default function VerifiedBadge({ className = "" }: { className?: string }) {
  return <span aria-label="Verified account" role="img"
    className={`inline-grid shrink-0 place-items-center rounded-full bg-[#292b2e] p-0.5 ${className}`}>
    <BadgeCheck aria-hidden="true" className="h-full w-full text-amber" size={16} />
  </span>;
}
