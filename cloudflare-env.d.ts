declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    WECHAT_CORP_ID?: string;
    WECHAT_AGENT_ID?: string;
    WECHAT_SECRET?: string;
    WECHAT_TOKEN?: string;
    WECHAT_ENCODING_AES_KEY?: string;
  }
}
