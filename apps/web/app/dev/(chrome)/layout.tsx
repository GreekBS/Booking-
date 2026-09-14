import Link from "next/link";

const links = [
  { href: "/dev/widget-react", label: "React widget (mock)" },
  { href: "/dev/widget-live", label: "React widget (live)" },
  { href: "/dev/widget-embed", label: "Embed / iframe (mock)" },
  { href: "/dev/embed-live", label: "Embed script (live)" },
  { href: "/dev/iframe-live", label: "iframe (live)" },
  { href: "/dev/widget-iframe", label: "Iframe host (mock)" },
  { href: "/dev/storefront-mock", label: "Storefront SDK mock" },
  { href: "/login", label: "Admin login" },
  { href: "/register", label: "Register" },
  { href: "/platform/tenants", label: "Platform tenants" },
  { href: "/dashboard/properties", label: "Dashboard properties" },
];

export default function DevChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4">
          <Link href="/dev" className="text-lg font-semibold text-emerald-800">
            HCP Dev previews
          </Link>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          Dev previews
        </span>
        </div>
        <nav className="mx-auto mt-3 flex max-w-5xl flex-wrap gap-3 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-emerald-700 underline-offset-2 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
