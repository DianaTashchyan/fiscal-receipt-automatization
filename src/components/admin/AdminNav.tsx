"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin",                     label: "Dashboard",    icon: "⊞" },
  { href: "/admin/restaurants",         label: "Restaurants",  icon: "🏪" },
  { href: "/receipts",                  label: "Receipts",     icon: "🧾" },
  { href: "/docs",                      label: "Instructions", icon: "📖" },
];

export default function AdminNav() {
  const path = usePathname();

  return (
    <nav className="w-60 min-h-screen bg-gray-900 text-white flex flex-col shrink-0">
      <div className="px-6 py-5 border-b border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Fiscal Receipt</p>
        <p className="font-bold text-lg leading-tight">Admin</p>
      </div>

      <ul className="flex flex-col gap-0.5 p-3 flex-1">
        {links.map((l) => {
          const active = l.href === "/admin"
            ? path === "/admin"
            : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className="text-base">{l.icon}</span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="p-4 border-t border-gray-700">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
        >
          ← Back to site
        </Link>
      </div>
    </nav>
  );
}
