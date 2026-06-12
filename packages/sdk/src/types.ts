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
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  plan: string;
}

/** Auth token stored locally. */
export interface AuthConfig {
  token: string;
  refreshToken: string;
  expiresAt: number;
  apiUrl: string;
  userApiUrl: string;
}
