export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200 lg:col-span-2" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />)}
      </div>
    </div>
  );
}
