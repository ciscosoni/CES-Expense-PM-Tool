import * as React from 'react';
import { PageHeader } from './page-header';

export function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="container py-8">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
