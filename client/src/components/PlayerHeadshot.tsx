import { useState } from 'react';

export function PlayerHeadshot({ name, url, className = '' }: { name: string | null; url: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'NBA';
  return (
    <span className={`player-headshot ${className}${loaded ? ' loaded' : ''}`}>
      {!loaded && !failed && <span className="headshot-loading" aria-hidden="true" />}
      {failed ? <span className="headshot-fallback" aria-hidden="true">{initials}</span> : <img src={url} alt={`${name || 'NBA player'} headshot`} loading="lazy" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    </span>
  );
}
