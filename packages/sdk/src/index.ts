// Types
export type {
  ShortLink, ShortenOptions, UpdateOptions, ListFilter,
  LinkStats, LandingPage, LandingOptions, UserInfo, AuthConfig,
  DocShare, DocUploadOptions, DocUpdateOptions, DocListResponse,
  WatermarkSettings,
} from "./types.js";

// Auth
export { login, logout, getToken, loadConfig, clearConfig, API_URL } from "./auth.js";

// API Client
export {
  shorten, listLinks, getLink, deleteLink, updateLink, getLinkStats,
  createLanding, whoami, EnkeError,
  uploadDoc, listDocs, getDoc, deleteDoc, updateDoc, renewDoc, editDocExpiration,
} from "./client.js";
