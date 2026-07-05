import { Link } from "@tanstack/react-router";

export const CtaSection = () => (
  <>
    {/* 4px gradient accent bar — apple → link */}
    <div
      aria-hidden="true"
      className="h-1 w-full bg-linear-to-r from-apple-9 to-link-9"
    />
    <section className="bg-apple-9 text-apple-contrast py-32">
      <div className="content-grid w-full">
        <div className="content text-center">
          <h2 className="font-display text-[clamp(3rem,8vw,6rem)] leading-[0.9] uppercase">
            Ready to fly?
          </h2>
          <p className="mt-4 text-apple-contrast/70 text-lg max-w-xs mx-auto leading-relaxed">
            Join and start your first module in minutes.
          </p>
          <div className="mt-10">
            <Link
              to="/auth/login"
              className="inline-flex items-center rounded-full bg-apple-contrast text-apple-9 px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-apple-contrast/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-contrast focus-visible:ring-offset-2 focus-visible:ring-offset-apple-9"
            >
              Sign in to start learning
            </Link>
          </div>
        </div>
      </div>
    </section>
  </>
);
