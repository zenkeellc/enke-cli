/** A shortened link — consumer-facing (built by client.ts from API responses). */
export interface ShortLink {
  uid: string;
  id: string;
  url: string;
  slug: string;
  /** Computed: https://en.ke/{slug} */
  shortUrl: string;
  /** Owner-facing note. */
  comment?: string;
  /** Unix timestamp (seconds) when created. */
  ctime: number;
  /** Unix timestamp (seconds) when last modified. */
  mtime: number;
  /** Expiration in days from ctime. */
  exp_days: number;
  /** Hash of password if protected. */
  password?: string;
  /** Is the link password-protected? */
  passwordProtected: boolean;
  /** Computed: ISO string from ctime. */
  createdAt: string;
  /** Computed: ISO string from ctime + exp_days, or null if perpetual. */
  expiresAt: string | null;
  /** Social preview title. */
  title?: string;
  /** Social preview description. */
  description?: string;
  /** Social preview image URL. */
  image?: string;
  /** Device/geo targeting rules. */
  rules?: TargetingRule[];
  /** A/B test variants. */
  ab_targets?: ABTarget[];
  /** Preview/interstitial page settings. */
  preview?: LinkPreview;
}

/** A targeting rule for device/geo-based redirects. */
export interface TargetingRule {
  type: "country" | "device";
  value: string;
  url: string;
}

/** An A/B test variant with a relative weight. */
export interface ABTarget {
  url: string;
  weight: number;
}

/** Per-link preview/interstitial page settings. */
export interface LinkPreview {
  enabled: boolean;
  title?: string;
  message?: string;
  delay_seconds: number;
  show_branding: boolean;
  show_destination: boolean;
}

/** Options for creating a short link — matches API's CreateLinkReq. */
export interface ShortenOptions {
  /** Custom slug (back-half). Auto-generated if omitted. */
  slug?: string;
  /** Duration in days to keep the link (plan-dependent, up to 3650). Defaults to 30. */
  keep_days?: number;
  /** Optional password to protect the link (min 4 chars). */
  password?: string;
  /** Device/geo targeting rules. */
  rules?: TargetingRule[];
  /** A/B test variants. */
  ab_targets?: ABTarget[];
  /** Preview/interstitial page settings. */
  preview?: LinkPreview;
}

/** Options for updating a short link — matches API's LinkEditReq. */
export interface UpdateOptions {
  /** New redirect URL. */
  url?: string;
  /** New password (empty string = remove). */
  password?: string;
  /** Device/geo targeting rules. */
  rules?: TargetingRule[];
  /** A/B test variants. */
  ab_targets?: ABTarget[];
  /** Preview/interstitial page settings. */
  preview?: LinkPreview;
}

/** Filters for listing links — matches API query. */
export interface ListFilter {
  /** User ID (required by API). */
  uid: string;
  /** Pagination cursor (required by API; empty string for first page). */
  cursor?: string;
}

/** Response from listLinks. */
export interface LinkListResponse {
  /** True when there are no more pages. */
  list_complete: boolean;
  /** Cursor for the next page (null if list_complete). */
  cursor: string | null;
  links: ShortLink[];
}

/** Click analytics for a link — matches API's linkStatList response. */
export interface LinkStats {
  overview: {
    total_visits: number;
    unique_countries: number;
    unique_referers: number;
  };
  time_series: Array<{ date: string; visits: number }>;
  top_countries: Array<{ label: string; count: number; percentage?: number }>;
  top_referers: Array<{ label: string; count: number; percentage?: number }>;
  devices: Array<{ label: string; count: number; percentage?: number }>;
  historical?: {
    available: boolean;
    monthly_totals: Array<{ month: string; visits: number }>;
  };
}

/** A landing page — matches API's LandingPageSchema. */
export interface LandingPage {
  uid: string;
  slug: string;
  title: string;
  description?: string;
  links: Array<{ title: string; url: string; sort_order: number }>;
  socials?: Record<string, string | undefined>;
  theme?: {
    accent_color: string;
    background: "light" | "dark" | "gradient";
    layout: "gallery" | "terminal" | "magazine" | "matrix" | "anime";
  };
  avatar_url?: string;
  ctime: number;
  mtime: number;
}

/** Options for creating a landing page — matches API's LandingPageCreateReq. */
export interface LandingOptions {
  /** Slug is required by the API. */
  slug: string;
  title: string;
  description?: string;
  /** Each link must have `title` (API field name). */
  links: Array<{ title: string; url: string; sort_order?: number }>;
  socials?: Record<string, string | undefined>;
  theme?: {
    accent_color?: string;
    background?: "light" | "dark" | "gradient";
    layout?: "gallery" | "terminal" | "magazine" | "matrix" | "anime";
  };
  avatar_url?: string;
}

/** Plan limits from /api/v1/me */
export interface PlanLimits {
  slugMinLength: number;
  bulkBatchSize: number | null;
  docFileSizeMB: number;
  docMaxExpDays: number;
  linkMaxExpirationDays: number;
  linkMaxKeepDays: number;
}

/** User profile info — matches API's /api/v1/me response. */
export interface UserInfo {
  user_id: number;
  username: string;
  email: string;
  plan: string;
  planName: string;
  role: string;
  subscription: unknown;
  usage: {
    links: { used: number; limit: number | null };
    aiSlugs: { used: number; limit: number | null };
    landingPages: { used: number; limit: number | null };
    docShares?: { used: number; limit: number | null };
  };
  planLimits: PlanLimits;
}

/** Auth token stored locally. */
export interface AuthConfig {
  token: string;
  refreshToken: string;
  expiresAt: number;
  apiUrl: string;
  userApiUrl: string;
}

// ── Document Share ──

/** Watermark overlay configuration for document sharing. */
export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "diagonal";
  opacity: number;
  color: string;
  font_size: number;
  rotation: number;
  repeat: boolean;
}

/** A shared document — matches API's DocShare. */
export interface DocShare {
  uid: string;
  id: string;
  slug: string;
  filename: string;
  content_type: string;
  size: number;
  comment: string | null;
  ctime: number;
  mtime: number;
  exp_days: number;
  password: string | null;
  max_downloads: number;
  download_count: number;
  disable_download: boolean;
  burn_after_reading: boolean;
  watermark: WatermarkSettings | null;
  view_count: number;
}

/** Options for uploading a document. */
export interface DocUploadOptions {
  slug?: string;
  exp_days?: number;
  password?: string;
  max_downloads?: number;
  disable_download?: boolean;
  burn_after_reading?: boolean;
  watermark?: Partial<WatermarkSettings>;
  comment?: string;
}

/** Options for updating a document. */
export interface DocUpdateOptions {
  exp_days?: number;
  password?: string;
  max_downloads?: number;
  disable_download?: boolean;
  burn_after_reading?: boolean;
  watermark?: Partial<WatermarkSettings>;
  comment?: string;
}

/** Document list response. */
export interface DocListResponse {
  list_complete: boolean;
  cursor: string;
  docs: DocShare[];
}
