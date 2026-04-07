export default function FreshnessDot({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="Never updated" />;
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 7)  return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title={`${days}d ago`} />;
  if (days <= 21) return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title={`${days}d ago`} />;
  return <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" title={`${days}d ago`} />;
}
