// Types
export type {
  ShortLink, ShortenOptions, UpdateOptions, ListFilter,
  LinkStats, LandingPage, LandingOptions, UserInfo, AuthConfig,
  DocShare, DocUploadOptions, DocUpdateOptions, DocListResponse,
  WatermarkSettings,
} from "./types.js";

// Mem types
export type {
  Memory, CreateMemoryInput, SearchResponse as MemSearchResponse,
  StatsResponse as MemStatsResponse, Session as MemSession,
  AssembledContext as MemAssembledContext,
  DocInfo as MemDocInfo, DocSearchResult as MemDocSearchResult,
  MemoryType, TtlLevel,
} from "./mem.js";

// Auth
export { login, logout, getToken, loadConfig, clearConfig, API_URL } from "./auth.js";

// API Client
export {
  shorten, listLinks, getLink, deleteLink, updateLink, getLinkStats,
  createLanding, whoami, EnkeError,
  uploadDoc, listDocs, getDoc, deleteDoc, updateDoc, renewDoc, editDocExpiration,
} from "./client.js";

// Mem Client
export { MemClient, MemApiError } from "./mem.js";
