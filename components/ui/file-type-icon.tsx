import type { MediaCategory } from "@/lib/types";

const iconClass = "h-10 w-10 text-muted-foreground";

export function FileCategoryIcon({
  category,
}: {
  category: MediaCategory;
}) {
  switch (category) {
    case "document":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "audio":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 18V6l12-3v12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="18" cy="15" r="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "video":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="2"
            y="4"
            width="20"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
        </svg>
      );
    case "image":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="8" cy="9" r="1.5" fill="currentColor" />
          <path
            d="M21 15l-5-5-4 4-3-3-5 5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "spreadsheet":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M3 9h18M9 3v18" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

export function categoryLabel(category: MediaCategory): string {
  switch (category) {
    case "document":
      return "Document";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "image":
      return "Image";
    case "spreadsheet":
      return "Spreadsheet";
  }
}
