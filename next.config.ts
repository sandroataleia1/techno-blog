import type { NextConfig } from "next";
// React's dev-mode debugging features (reconstructing callstacks across
// Server/Client boundaries) call eval() — this never happens in production
// (React's own runtime never uses eval() there), so 'unsafe-eval' is added
// to script-src only outside production, keeping the deployed CSP exactly
// as strict as before.
const scriptSrc=process.env.NODE_ENV==="production"?"script-src 'self' 'unsafe-inline'":"script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const csp=["default-src 'self'","base-uri 'self'","frame-ancestors 'none'","object-src 'none'","form-action 'self'","img-src 'self' data: https:","style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",scriptSrc,"connect-src 'self' https:","font-src 'self' data: https://fonts.gstatic.com","upgrade-insecure-requests"].join("; ");
const security={"Content-Security-Policy":csp,"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()","X-Frame-Options":"DENY",...(process.env.NODE_ENV==="production"?{"Strict-Transport-Security":"max-age=31536000; includeSubDomains"}:{})};
// Independent, config-level guarantee that the database/backups directory
// never lands in .next/standalone — not just a fix for lib/backups.ts's own
// dynamic fs access (see the turbopackIgnore comments there), and not
// something that depends on .dockerignore excluding it from the build
// context. Applies to every route ("*"), since output tracing runs per
// route and any of them could, in principle, import something that touches
// the filesystem dynamically.
const outputFileTracingExcludes={"*":["data/**"]};
const nextConfig:NextConfig={poweredByHeader:false,output:"standalone",outputFileTracingExcludes,async headers(){return [{source:"/:path*",headers:Object.entries(security).map(([key,value])=>({key,value}))},{source:"/admin/:path*",headers:[{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},{key:"Cache-Control",value:"private, no-store, max-age=0"}]},{source:"/api/admin/:path*",headers:[{key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"},{key:"Cache-Control",value:"no-store"}]}]},async redirects(){return [{source:"/politica-de-privacidade",destination:"/privacidade",permanent:true},{source:"/politica-de-afiliados",destination:"/divulgacao-afiliados",permanent:true}]}};
export default nextConfig;
