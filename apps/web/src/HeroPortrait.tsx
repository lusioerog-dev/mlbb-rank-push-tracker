import { useEffect, useState } from "react";
import {
  heroDisplayName,
  heroMetadataByGameId,
  type HeroIdentity,
} from "../../../packages/tracker/heroes";

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
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">
          {hero ? name.slice(0, 2).toUpperCase() : "?"}
        </span>
      )}
    </span>
  );
}
