export function EmptyBoard({ title, text }: { title: string; text: string }) {
  return (
    <section className="panel empty-board">
      <p className="kicker">cyberGAU</p>
      <h1>{title}</h1>
      <p className="lead">{text}</p>
    </section>
  );
}
