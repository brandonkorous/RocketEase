import { Card, CardBody } from "@wizeworks/silicaui-react";

/** Real customer quotes go here; empty renders a clearly-marked placeholder (spec forbids fictional quotes). */
export type Testimonial = { quote: string; name: string; role: string; company: string };
const TESTIMONIALS: Testimonial[] = [];

export function Testimonials() {
  return (
    <section className="page-container section-pad" aria-labelledby="testimonials-heading">
      <h2 id="testimonials-heading" className="h2-marketing text-center">
        Loved by marketers who live social
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TESTIMONIALS.length > 0
          ? TESTIMONIALS.map((t) => (
              <Card key={t.name} className="border border-base-300 bg-base-100">
                <CardBody className="p-7">
                  <blockquote className="text-base leading-relaxed">&ldquo;{t.quote}&rdquo;</blockquote>
                  <footer className="mt-5 text-sm">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-secondary/70">{t.role}, {t.company}</div>
                  </footer>
                </CardBody>
              </Card>
            ))
          : [0, 1, 2].map((i) => (
              <Card key={i} className="border border-dashed border-base-300 bg-base-100">
                <CardBody className="p-7">
                  <p className="text-sm font-semibold text-secondary/70">Placeholder</p>
                  <p className="mt-2 text-base leading-relaxed text-secondary">
                    Verified customer feedback will appear here. We don&apos;t publish invented quotes.
                  </p>
                </CardBody>
              </Card>
            ))}
      </div>
    </section>
  );
}
