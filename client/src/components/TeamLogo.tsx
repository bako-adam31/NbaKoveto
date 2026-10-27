import { useState } from 'react';
import { API_BASE_URL } from '../services/games';

export function TeamLogo({ team, className = '', label }: {
  team: { id?: number; name: string; abbreviation: string; logoUrl?: string | null };
  className?: string;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = team.logoUrl ? `${API_BASE_URL}${team.logoUrl}` : team.id ? `${API_BASE_URL}/api/logos/${team.id}` : null;
  if (!src || failed) {
    return <span className={`game-team-fallback ${className}`} aria-label={label ?? `${team.name} logo unavailable`}>{team.abbreviation || 'NBA'}</span>;
  }
  return <img className={className} src={src} alt={label ?? `${team.name} logo`} onError={() => setFailed(true)} />;
}
