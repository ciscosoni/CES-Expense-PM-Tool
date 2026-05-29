'use client';

import { useParams } from 'next/navigation';
import { CommentsThread } from '@/components/comments-thread';

export default function ProjectDiscussionPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Project discussion</h2>
        <p className="text-sm text-muted-foreground">
          Cross-functional thread on this project. Audited and visible to the project team.
        </p>
      </div>
      <CommentsThread entityKind="PROJECT" entityId={params.id} title="Discussion" />
    </div>
  );
}
