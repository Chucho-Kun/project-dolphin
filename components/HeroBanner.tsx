export default function HeroBanner() {
  return (
    <section className="w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/banner.avif"
        alt=""
        fetchPriority="high"
        className="block h-auto w-full"
      />
    </section>
  );
}
