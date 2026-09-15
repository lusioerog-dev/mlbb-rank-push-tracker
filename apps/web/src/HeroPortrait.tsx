import { useEffect, useState } from "react";
import { heroMetadataByGameId } from "../../../packages/tracker/heroes";

export type HeroIdentity = {
  name: string;
  gameId?: string | null | undefined;
};

export function heroDisplayName(hero: HeroIdentity | null | undefined) {
  return (
    heroMetadataByGameId(hero?.gameId)?.name ?? hero?.name ?? "Hero unavailable"
  );
}

export function HeroPortrait({
  hero,
  className = "",
}: {
  hero: HeroIdentity | null | undefined;
  className?: string;
}) {
  const metadata = heroMetadataByGameId(hero?.gameId);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [metadata?.portraitUrl]);
  const name = heroDisplayName(hero);
  return (
    <span className={`hero-portrait ${className}`.trim()}>
      {metadata && !failed ? (
        <img
          src={metadata.portraitUrl}
          alt={`${name} portrait`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`${name} portrait unavailable`}>
          {hero ? name.slice(0, 2).toUpperCase() : "?"}
        </span>
      )}
    </span>
  );
}
