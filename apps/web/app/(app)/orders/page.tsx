import { ShoppingCart } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const dynamic = 'force-dynamic';

export default function OrdersPage() {
  return (
    <ModulePlaceholder
      title="Orders"
      description="Sales & purchase orders linked to a client and project."
      icon={ShoppingCart}
      points={[
        'Order number, client, project, order date, total, status',
        'Status transitions (pending → completed)',
        'Sales orders → invoice flow; purchase orders → vendor',
        'Scope being confirmed before build (sales vs purchase orders)',
      ]}
    />
  );
}
