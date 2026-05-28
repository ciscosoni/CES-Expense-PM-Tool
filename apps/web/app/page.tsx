export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <header>
        <p className="text-sm uppercase tracking-wider text-neutral-500">CES Tech</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Internal Operations</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Projects, attendance, travel, expenses, reimbursements, daily allowance, and project
          P&amp;L — signed in with Microsoft Entra ID.
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="font-medium">Phase 0 — Foundations</p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Scaffold is up. Next: Entra ID SSO, Microsoft Graph user sync, RBAC, master data, and the
          DA / P&amp;L / approval engines wired into the API.
        </p>
      </section>
    </main>
  );
}
