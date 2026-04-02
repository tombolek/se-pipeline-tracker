export default function FreshnessDot({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return <span className="w-2 h-2 rounded-full bg-brand-navy-30 inline-block" title="Never" />;
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 7)  return <span className="w-2 h-2 rounded-full bg-status-success inline-block" title={`${days}d ago`} />;
  if (days <= 21) return <span className="w-2 h-2 rounded-full bg-status-warning inline-block" title={`${days}d ago`} />;
  return <span className="w-2 h-2 rounded-full bg-status-overdue inline-block" title={`${days}d ago`} />;
}
