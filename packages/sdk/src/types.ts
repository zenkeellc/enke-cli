/** A shortened link as returned by the API. */
export interface ShortLink {
  id: string;
  url: string;
  shortUrl: string;
  slug: string;
  createdAt: string;
  expiresAt: string | null;
  clicks: number;
  passwordProtected: boolean;
}

/** Options for creating a short link. */
export interface ShortenOptions {
  /** Custom slug (back-half). Auto-generated if omitted. */
  slug?: string;
  /** Password protect the link. */
  password?: string;
  /** Expiration: ISO date string, or duration like "7d", "24h", "30d". */
  expiresIn?: string;
  /** Webhook URL called when the link is clicked. */
  webhookUrl?: string;
}

/** Options for updating a short link. */
export interface UpdateOptions {
  slug?: string;
  password?: string;
  expiresIn?: string;
  webhookUrl?: string;
}

/** Filters for listing links. */
export interface ListFilter {
  limit?: number;
  offset?: number;
  search?: string;
}

/** Click analytics for a link. */
export interface LinkStats {
  totalClicks: number;
  daily: Array<{ date: string; count: number }>;
  referrers: Array<{ source: string; count: number }>;
  geo: Array<{ country: string; count: number }>;
  devices: Array<{ type: string; count: number }>;
}

/** A simple landing page (link-in-bio style). */
export interface LandingPage {
  id: string;
  slug: string;
  title: string;
  links: Array<{ url: string; label: string }>;
  theme: string;
  createdAt: string;
}

/** Options for creating a landing page. */
export interface LandingOptions {
  slug?: string;
  title: string;
  links: Array<{ url: string; label: string }>;
  theme?: string;
}

/** User profile info. */
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
  };
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

/** A shared document. */
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
