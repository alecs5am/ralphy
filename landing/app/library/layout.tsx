// Library layout — the only place the redesign stylesheet is imported, so the
// browse-strip / card / gallery / lightbox / remix-modal classes load for both
// `/library` and `/library/[slug]` without touching the global stylesheet.
import "./library.css";
import "./library2.css";

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
