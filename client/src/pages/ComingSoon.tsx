import { ArrowLeft, Construction } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
export function ComingSoon() {
  const title = useLocation().pathname.slice(1);
  return (
    <main className="coming-page">
      <div className="state-icon">
        <Construction />
      </div>
      <p className="eyebrow muted">NEXT UP</p>
      <h1>
        {title.charAt(0).toUpperCase() + title.slice(1)}
        <em>.</em>
      </h1>
      <p>
        We’re building this part of the game. Player profiles and deeper stats
        are on their way.
      </p>
      <Link className="text-button" to="/">
        <ArrowLeft size={16} /> Back to the scoreboard
      </Link>
    </main>
  );
}
