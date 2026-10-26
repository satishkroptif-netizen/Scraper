export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      className="logo-mark"
      role="img"
    >
      <defs>
        <linearGradient id="ms-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d251d" />
          <stop offset="1" stopColor="#17513d" />
        </linearGradient>
        <linearGradient id="ms-pin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8fa8d" />
          <stop offset="1" stopColor="#c6e84a" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="118" fill="url(#ms-bg)" />
      <circle cx="256" cy="246" r="154" fill="none" stroke="#ddf36b" strokeOpacity="0.12" strokeWidth="12" />
      <circle cx="256" cy="246" r="108" fill="none" stroke="#ddf36b" strokeOpacity="0.22" strokeWidth="12" />
      <circle cx="256" cy="246" r="62" fill="none" stroke="#ddf36b" strokeOpacity="0.32" strokeWidth="12" />
      <path d="M256 88c-72 0-130 57-130 128 0 96 130 208 130 208s130-112 130-208c0-71-58-128-130-128z" fill="url(#ms-pin)" />
      <circle cx="256" cy="218" r="44" fill="#0f2b22" />
      <circle cx="256" cy="218" r="15" fill="#ddf36b" />
      <circle cx="405" cy="112" r="11" fill="#ddf36b" fillOpacity="0.8" />
      <circle cx="106" cy="394" r="8" fill="#ddf36b" fillOpacity="0.55" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={compact ? 32 : 38} />
      <span className="logo-text">
        <span className="logo-name">MapScraper</span>
        {!compact ? <span className="logo-sub">Google Maps lead finder</span> : null}
      </span>
    </span>
  );
}
