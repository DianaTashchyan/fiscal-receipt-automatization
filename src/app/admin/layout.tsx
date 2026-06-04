"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/admin",             label: "Dashboard",    icon: "⊞" },
  { href: "/admin/restaurants", label: "Restaurants",  icon: "🏪" },
  { href: "/receipts",          label: "Receipts",     icon: "🧾" },
  { href: "/docs",              label: "Instructions", icon: "📖" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();

  // Redirect to login if no token is stored.
  // This is a side effect (redirect), not a setState call, so it satisfies the lint rule.
  useEffect(() => {
    if (path === "/admin/login") return;
    if (!localStorage.getItem("admin_token")) {
      router.replace("/admin/login");
    }
  }, [path, router]);

  function handleLogout() {
    localStorage.removeItem("admin_token");
    router.push("/admin/login");
  }

  // Login page renders without the nav shell
  if (path === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <nav className="w-60 min-h-screen bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Fiscal Receipt</p>
          <p className="font-bold text-lg leading-tight">Admin</p>
        </div>

        <ul className="flex flex-col gap-0.5 p-3 flex-1">
          {NAV_LINKS.map((l) => {
            const active =
              l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
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

        <div className="p-4 border-t border-gray-700 flex flex-col gap-2">
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            ← Back to site
          </Link>
          <button
            onClick={handleLogout}
            className="text-left text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
